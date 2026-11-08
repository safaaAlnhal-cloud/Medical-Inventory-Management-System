import { UNITS } from '../constants/inventory';
import { EXPIRY_STATUS, getExpiryStatus, getStockStatus } from '../utils/stock';
import { http } from './apiAxios';
import { ApiError, fieldError } from './apiError';
import { commit, matchesSearch, nextId } from './mock/mockDb';
import { selectArchivedInventory, selectInventory, selectItem, selectNameMaps } from './mock/mockSelectors';
import { request } from './request';

// `id` is the unique batch id used by transactions; `batchNumber` is the label shown to users.
// `expiryStatus` is 'expired', 'expiring_soon' or null. The data layer decides it; if an API
// leaves the field out, it is worked out here with the shared rule so pages never do it.
// `quantity` is what is physically left in the batch. It is either all available or, once the
// batch has expired, all expired stock awaiting disposal:
//   availableQuantity: usable stock (0 for an expired batch)
//   expiredQuantity:   expired stock still on the shelf (0 for a batch that has not expired)
export const mapBatch = (dto) => {
  const quantity = Number(dto.quantity) || 0;
  const expiryStatus = dto.expiryStatus === undefined ? getExpiryStatus(dto.expiryDate) : dto.expiryStatus;
  const expired = expiryStatus === EXPIRY_STATUS.EXPIRED;
  return {
    id: dto.id,
    batchNumber: dto.batchNumber,
    quantity,
    availableQuantity: dto.availableQuantity === undefined ? (expired ? 0 : quantity) : Number(dto.availableQuantity) || 0,
    expiredQuantity: dto.expiredQuantity === undefined ? (expired ? quantity : 0) : Number(dto.expiredQuantity) || 0,
    unitCost: Number(dto.unitCost) || 0,
    supplier: dto.supplier ?? '',
    expiryDate: dto.expiryDate ?? null,
    expiryStatus,
  };
};

// Frontend item model:
// { id, name, categoryId, unit, minQty, quantity, expiredQuantity, disposedQuantity, status,
//   avgUnitCost, nearestExpiryDate, batches[], archived, archivedAt }
// quantity:   AVAILABLE stock only. Expiry belongs to a batch: an item with one expired batch
//             and one valid batch is still available through the valid one.
// status:     'available' | 'low_stock' | 'out_of_stock', from the available quantity (same
//             fallback rule as expiryStatus). An item is never "expired"; its batches are.
// nearestExpiryDate: the next date available stock expires (expired batches are not counted).
// archived:   true once the item has been archived; archivedAt is when. The UI calls an
//             archived item "Deactivated" and restoring it "Reactivate"; the field names,
//             function names and endpoints keep the word "archive".
const mapItem = (dto) => {
  const quantity = Number(dto.quantity) || 0;
  const minQty = Number(dto.minQty) || 0;
  return {
    id: dto.id,
    name: dto.name,
    categoryId: dto.categoryId,
    unit: dto.unit,
    minQty,
    // quantity is AVAILABLE stock: expired batches are not part of it.
    quantity,
    // Expired stock awaiting disposal, and what disposal transactions have already removed.
    expiredQuantity: Number(dto.expiredQuantity) || 0,
    disposedQuantity: Number(dto.disposedQuantity) || 0,
    status: dto.status ?? getStockStatus(quantity, minQty),
    avgUnitCost: Number(dto.avgUnitCost) || 0,
    nearestExpiryDate: dto.nearestExpiryDate ?? null,
    batches: (dto.batches ?? []).map(mapBatch),
    archived: Boolean(dto.archived),
    archivedAt: dto.archivedAt ?? null,
  };
};

const mapLookupEntry = (dto) => ({ id: dto.id, name: dto.name, unit: dto.unit, archived: Boolean(dto.archived) });

// ---- Mock-side validation, mirroring what the backend should enforce ------------------------

// An item name is unique among active items. Archived items do not block a name, but an
// archived item cannot be restored while an active item uses its name.
const assertNameAvailable = (db, name, exceptId = null) => {
  const duplicate = db.items.some((item) => !item.archived && item.id !== exceptId && item.name.toLowerCase() === name.toLowerCase());
  if (duplicate) throw fieldError('name', 'An active item with this name already exists.', 409);
};

const validateItem = (db, payload, exceptId = null) => {
  const name = String(payload.name ?? '').trim();
  if (!name) throw fieldError('name', 'Item name is required.');
  if (!db.categories.some((category) => category.id === payload.categoryId)) throw fieldError('categoryId', 'Please choose a valid category.');
  if (!UNITS.includes(payload.unit)) throw fieldError('unit', 'Please choose a valid unit.');
  const minQty = payload.minQty === '' || payload.minQty == null ? NaN : Number(payload.minQty);
  if (!Number.isFinite(minQty) || minQty < 0) throw fieldError('minQty', 'Minimum quantity must be zero or more.');
  assertNameAvailable(db, name, exceptId);
  return { name, categoryId: payload.categoryId, unit: payload.unit, minQty };
};

const findItem = (db, id) => {
  const item = db.items.find((candidate) => candidate.id === id);
  if (!item) throw new ApiError('This item no longer exists.', { status: 404 });
  return item;
};

const searchItems = (db, items, search) => {
  const { categoryNames } = selectNameMaps(db);
  return items.filter((item) =>
    matchesSearch([item.name, categoryNames.get(item.categoryId), item.unit, ...item.batches.map((batch) => batch.batchNumber)], search));
};

// ---- Service -----------------------------------------------------------------------------------

// The active inventory: archived items are never included.
export const getInventoryItemsApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    api: () => http.get('/inventory', { params: { search: search || undefined } }),
    mock: (db) => searchItems(db, selectInventory(db), search),
  });
  return dtos.map(mapItem);
};

// The archived items only, same model. They hold no stock (see archiveInventoryItemApi).
export const getArchivedInventoryItemsApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    api: () => http.get('/inventory/archived', { params: { search: search || undefined } }),
    mock: (db) => searchItems(db, selectArchivedInventory(db), search)
      .sort((a, b) => String(b.archivedAt ?? '').localeCompare(String(a.archivedAt ?? ''))),
  });
  return dtos.map(mapItem);
};

// Minimal { id, name, unit, archived } list for resolving itemId references.
// Includes archived items so old transactions and reports still show their item name.
export const getInventoryLookupApi = async () => {
  const dtos = await request({
    api: () => http.get('/inventory/lookup'),
    mock: (db) => db.items.map((item) => ({ id: item.id, name: item.name, unit: item.unit, archived: Boolean(item.archived) })),
  });
  return dtos.map(mapLookupEntry);
};

// Minimal { id, itemId, batchNumber } list of every batch ever received (including used-up
// ones), for resolving a transaction's or notification's batchId to its batch number.
export const getBatchLookupApi = async () => {
  const dtos = await request({
    api: () => http.get('/inventory/batches/lookup'),
    mock: (db) => db.batches.map((batch) => ({ id: batch.id, itemId: batch.itemId, batchNumber: batch.batchNumber })),
  });
  return dtos.map((dto) => ({ id: dto.id, itemId: dto.itemId, batchNumber: dto.batchNumber }));
};

// Payload: { name, categoryId, unit, minQty }
export const createInventoryItemApi = async (payload) => {
  const dto = await request({
    api: () => http.post('/inventory', payload),
    mock: (db) => {
      const item = { id: nextId(db.items), ...validateItem(db, payload), archived: false, archivedAt: null };
      db.items.push(item);
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};

// Payload: { name, categoryId, unit, minQty }. Only these four fields change: stock, batches,
// costs and the archive state are never touched by an update.
export const updateInventoryItemApi = async (id, payload) => {
  const dto = await request({
    api: () => http.put(`/inventory/${id}`, payload),
    mock: (db) => {
      const item = findItem(db, id);
      if (item.archived) throw new ApiError('This item is deactivated. Reactivate it before editing it.', { status: 409 });
      Object.assign(item, validateItem(db, payload, id));
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};

// MOCK BUSINESS LOGIC. "Deleting" an item archives it: nothing is removed. The item keeps its
// id, batches and transactions; it only leaves the active inventory and the item lists for new
// transactions. It is refused (409) while the item still has stock, so archiving can never make
// stock or stock value disappear: the remaining stock has to be issued or corrected first.
// Resolves with the archived item.
export const archiveInventoryItemApi = async (id) => {
  const dto = await request({
    delay: 100,
    api: () => http.patch(`/inventory/${id}/archive`),
    mock: (db) => {
      const item = findItem(db, id);
      if (item.archived) throw new ApiError('This item is already deactivated.', { status: 409 });
      // "Stock" here is everything physically left: available stock and expired stock that
      // has not been disposed of yet. Neither may vanish with the item.
      const { quantity, expiredQuantity } = selectItem(db, item);
      if (quantity > 0) {
        throw new ApiError(`"${item.name}" still has ${quantity} in stock, so it cannot be deactivated yet. Issue or correct the remaining stock first.`, { status: 409 });
      }
      if (expiredQuantity > 0) {
        throw new ApiError(`"${item.name}" still has ${expiredQuantity} expired in stock awaiting disposal, so it cannot be deactivated yet. Record the disposal first.`, { status: 409 });
      }
      Object.assign(item, { archived: true, archivedAt: new Date().toISOString() });
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};

// Puts an archived item back in the active inventory with all of its history intact.
// Refused (409) if an active item now uses the same name. Resolves with the restored item.
export const restoreInventoryItemApi = async (id) => {
  const dto = await request({
    delay: 100,
    api: () => http.patch(`/inventory/${id}/restore`),
    mock: (db) => {
      const item = findItem(db, id);
      if (!item.archived) throw new ApiError('This item is not deactivated.', { status: 409 });
      if (db.items.some((other) => !other.archived && other.name.toLowerCase() === item.name.toLowerCase())) {
        throw new ApiError(`An active item named "${item.name}" already exists. Rename that item before reactivating this one.`, { status: 409 });
      }
      Object.assign(item, { archived: false, archivedAt: null });
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};
