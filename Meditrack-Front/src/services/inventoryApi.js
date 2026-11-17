import { UNITS } from '../constants/inventory';
import { EXPIRY_STATUS, getExpiryStatus, getStockStatus } from '../utils/stock';
import { http } from './apiAxios';
import { ApiError, fieldError } from './apiError';
import { commit, matchesSearch, nextId, requireCurrentUser } from './mock/mockDb';
import { resolveManufacturer } from './mock/mockManufacturers';
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
    // Who made this batch and when (both null when unknown).
    manufacturerId: dto.manufacturerId ?? null,
    manufacturingDate: dto.manufacturingDate ?? null,
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
    // The current archiving (null while active) and how many times the item was archived.
    archiveReason: dto.archiveReason ?? null,
    archivedBy: dto.archivedBy ?? null,
    archiveHistoryCount: Number(dto.archiveHistoryCount) || 0,
    // The six optional details, the same for every box of the item; null when not set.
    ...Object.fromEntries(Object.keys(ITEM_DETAIL_LIMITS).map((field) => [field, dto[field] ?? null])),
    // Factory barcodes: [{ id, barcode, manufacturerId }]. Archived items keep theirs.
    barcodes: (dto.barcodes ?? []).map((barcode) => ({ id: barcode.id, barcode: barcode.barcode, manufacturerId: barcode.manufacturerId })),
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

// The same limits as the backend (items.name is 150 characters; minQty is kept well inside its column).
const MAX_NAME_LENGTH = 150;
const MAX_MIN_QTY = 1000000;

const validateItem = (db, payload, exceptId = null) => {
  const name = String(payload.name ?? '').trim();
  if (!name) throw fieldError('name', 'Item name is required.');
  if (name.length > MAX_NAME_LENGTH) throw fieldError('name', `Item name may not be longer than ${MAX_NAME_LENGTH} characters.`);
  if (!db.categories.some((category) => category.id === payload.categoryId)) throw fieldError('categoryId', 'Please choose a valid category.');
  if (!UNITS.includes(payload.unit)) throw fieldError('unit', 'Please choose a valid unit.');
  const minQty = payload.minQty === '' || payload.minQty == null ? NaN : Number(payload.minQty);
  if (!Number.isFinite(minQty) || minQty < 0) throw fieldError('minQty', 'Minimum quantity must be zero or more.');
  if (!Number.isInteger(minQty)) throw fieldError('minQty', 'Minimum quantity must be a whole number.');
  if (minQty > MAX_MIN_QTY) throw fieldError('minQty', `Minimum quantity may not be more than ${MAX_MIN_QTY.toLocaleString('en-US')}.`);
  const details = validateDetails(payload);
  assertNameAvailable(db, name, exceptId);
  return { name, categoryId: payload.categoryId, unit: payload.unit, minQty, ...details };
};

// The six optional details and their length limits (the same as the backend's items columns).
export const ITEM_DETAIL_LIMITS = {
  activeIngredient: 150,
  strength: 50,
  dosageForm: 50,
  storageConditions: 255,
  uses: 1000,
  description: 2000,
};

// Only the details that were sent: one left out stays as it is. Empty or only spaces = not set (null).
const validateDetails = (payload) => {
  const details = {};
  for (const [field, limit] of Object.entries(ITEM_DETAIL_LIMITS)) {
    if (payload[field] === undefined) continue;
    const text = String(payload[field] ?? '').trim();
    if (text.length > limit) throw fieldError(field, `This field may not be longer than ${limit} characters.`);
    details[field] = text || null;
  }
  return details;
};

// The same rule as the backend: required (not only spaces) and at most 500 characters.
const MAX_REASON_LENGTH = 500;

const requireArchiveReason = (reason) => {
  const trimmed = String(reason ?? '').trim();
  if (!trimmed) throw fieldError('reason', 'Please enter the reason for deactivating this item.');
  if (trimmed.length > MAX_REASON_LENGTH) throw fieldError('reason', `The reason may not be longer than ${MAX_REASON_LENGTH} characters.`);
  return trimmed;
};

const findItem = (db, id) => {
  const item = db.items.find((candidate) => candidate.id === id);
  if (!item) throw new ApiError('This item no longer exists.', { status: 404 });
  return item;
};

// Like the backend: name, category name, unit, active ingredient, each batch in stock (number and
// manufacturer), and each barcode (code and manufacturer).
const searchItems = (db, items, search) => {
  const { categoryNames } = selectNameMaps(db);
  const manufacturerNames = new Map(db.manufacturers.map((manufacturer) => [manufacturer.id, manufacturer.name]));
  const batchManufacturers = new Map(db.batches.map((batch) => [batch.id, batch.manufacturerId]));
  return items.filter((item) => matchesSearch([
    item.name, categoryNames.get(item.categoryId), item.unit, item.activeIngredient,
    ...item.batches.flatMap((batch) => [batch.batchNumber, manufacturerNames.get(batchManufacturers.get(batch.id))]),
    ...item.barcodes.flatMap((barcode) => [barcode.barcode, manufacturerNames.get(barcode.manufacturerId)]),
  ], search));
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

// Payload: { name, categoryId, unit, minQty } and, optionally, the six details (ITEM_DETAIL_LIMITS).
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

// Payload: the same as create. Only the form fields change (the four main ones and the details sent): stock, batches,
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
// Payload: { reason }, required, 1-500 characters (422, field "reason"). Every archiving adds a
// record to the item's archive history.
export const archiveInventoryItemApi = async (id, { reason } = {}) => {
  const dto = await request({
    delay: 100,
    api: () => http.patch(`/inventory/${id}/archive`, { reason }),
    mock: (db) => {
      const item = findItem(db, id);
      const cleanReason = requireArchiveReason(reason);
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
      const archivedAt = new Date().toISOString();
      db.itemArchivals.push({
        id: nextId(db.itemArchivals), itemId: item.id, reason: cleanReason,
        archivedBy: requireCurrentUser().id, archivedAt, restoredBy: null, restoredAt: null,
      });
      Object.assign(item, { archived: true, archivedAt });
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
      // Complete the open record: the history keeps when the item came back, and who did it.
      const open = db.itemArchivals.find((record) => record.itemId === item.id && record.restoredAt === null);
      if (open) Object.assign(open, { restoredBy: requireCurrentUser().id, restoredAt: new Date().toISOString() });
      Object.assign(item, { archived: false, archivedAt: null });
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};

// Archive history record: { id, itemId, reason, archivedBy, archivedAt, restoredBy, restoredAt }.
// restoredBy / restoredAt are null while the item is still archived.
const mapArchival = (dto) => ({
  id: dto.id,
  itemId: dto.itemId,
  reason: dto.reason,
  archivedBy: dto.archivedBy,
  archivedAt: dto.archivedAt,
  restoredBy: dto.restoredBy ?? null,
  restoredAt: dto.restoredAt ?? null,
});

// Every archiving of the item, newest first. [] if it was never archived.
export const getItemArchiveHistoryApi = async (id) => {
  const dtos = await request({
    api: () => http.get(`/inventory/${id}/archive-history`),
    mock: (db) => {
      findItem(db, id);
      return db.itemArchivals
        .filter((record) => record.itemId === id)
        .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || b.id - a.id);
    },
  });
  return dtos.map(mapArchival);
};

// ---- Factory barcodes ----------------------------------------------------------------------------
// A barcode is unique in the whole system (archived items included) and links an item to one
// manufacturer. Barcodes are compared exactly. An archived item's barcodes cannot change (409).

const MAX_BARCODE_LENGTH = 64;
const BARCODE_ARCHIVED = 'This item is deactivated. Reactivate it before changing its barcodes.';

const requireBarcode = (value) => {
  const barcode = String(value ?? '').trim();
  if (!barcode) throw fieldError('barcode', 'Enter the barcode.');
  if (barcode.length > MAX_BARCODE_LENGTH) throw fieldError('barcode', `The barcode may not be longer than ${MAX_BARCODE_LENGTH} characters.`);
  if (/\s/.test(barcode)) throw fieldError('barcode', 'The barcode may not contain spaces.');
  return barcode;
};

// What a scan found: { item: { id, name, unit, archived }, manufacturerId, barcode }.
// Fails with 404 when no item has the barcode (the Incoming form then offers to link it).
export const getItemByBarcodeApi = async (code) => {
  const dto = await request({
    api: () => http.get(`/inventory/by-barcode/${encodeURIComponent(code)}`),
    mock: (db) => {
      const found = db.itemBarcodes.find((barcode) => barcode.barcode === String(code ?? '').trim());
      if (!found) throw new ApiError('The requested record was not found.', { status: 404 });
      const item = findItem(db, found.itemId);
      return {
        item: { id: item.id, name: item.name, unit: item.unit, archived: Boolean(item.archived) },
        manufacturerId: found.manufacturerId,
        barcode: found.barcode,
      };
    },
  });
  return { item: mapLookupEntry(dto.item), manufacturerId: dto.manufacturerId, barcode: dto.barcode };
};

// Payload: { barcode, manufacturer } (the manufacturer's NAME; a new name creates it).
// Resolves with the item, its new barcode included.
export const linkBarcodeApi = async (itemId, { barcode, manufacturer }) => {
  const dto = await request({
    api: () => http.post(`/inventory/${itemId}/barcodes`, { barcode, manufacturer }),
    mock: (db) => {
      const item = findItem(db, itemId);
      const code = requireBarcode(barcode);
      if (!String(manufacturer ?? '').trim()) throw fieldError('manufacturer', 'Enter the manufacturer of this barcode.');
      if (item.archived) throw new ApiError(BARCODE_ARCHIVED, { status: 409 });
      const owner = db.itemBarcodes.find((existing) => existing.barcode === code);
      if (owner) throw fieldError('barcode', `This barcode is already linked to "${findItem(db, owner.itemId).name}".`, 409);
      // Last, once every rule has passed: a refused link leaves no new manufacturer behind.
      const { id: manufacturerId } = resolveManufacturer(db, manufacturer);
      db.itemBarcodes.push({ id: nextId(db.itemBarcodes), itemId: item.id, manufacturerId, barcode: code });
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};

// Resolves with the item without that barcode. 404 if the barcode is not this item's.
export const unlinkBarcodeApi = async (itemId, barcodeId) => {
  const dto = await request({
    api: () => http.delete(`/inventory/${itemId}/barcodes/${barcodeId}`),
    mock: (db) => {
      const item = findItem(db, itemId);
      const barcode = db.itemBarcodes.find((candidate) => candidate.id === barcodeId && candidate.itemId === itemId);
      if (!barcode) throw new ApiError('The requested record was not found.', { status: 404 });
      if (item.archived) throw new ApiError(BARCODE_ARCHIVED, { status: 409 });
      db.itemBarcodes = db.itemBarcodes.filter((candidate) => candidate.id !== barcodeId);
      commit();
      return selectItem(db, item);
    },
  });
  return mapItem(dto);
};
