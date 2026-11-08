import { OUTGOING_REASON_LABELS, OUTGOING_REASONS, TRANSACTION_TYPES } from '../constants/inventory';
import { ACCESS } from '../constants/users';
import { EXPIRY_STATUS, STOCK_STATUS } from '../utils/stock';
import { http } from './apiAxios';
import { ApiError } from './apiError';
import { matchesSearch } from './mock/mockDb';
import { isDisposal, round2, selectActiveTransactions, selectCriticalInventory, selectInventory, selectNameMaps, selectTransactionValue, sumTransactionValues } from './mock/mockSelectors';
import { request } from './request';

const REPORT_TYPES =['summary', 'movement_history', 'critical_items', 'inventory_value'];

// Frontend report model (raw values only; titles, labels and charts are built by the UI):
// {
//   type,
//   totals:     { [key]: number }            keys depend on the report type, see BACKEND_HANDOFF.md
//   breakdown:  [{ categoryId, value }]      inventory_value only, otherwise [] (not charted)
//   rows:       [{ id, itemId, ... }]        fields depend on the report type
//   pagination: { page, pageSize, totalItems, totalPages }
// }
const mapRow = (dto) => ({
  id: dto.id,
  itemId: dto.itemId,
  categoryId: dto.categoryId ?? null,
  type: dto.type ?? null,
  quantity: Number(dto.quantity) || 0,
  unit: dto.unit ?? null,
  minQty: dto.minQty == null ? null : Number(dto.minQty),
  unitCost: dto.unitCost == null ? null : Number(dto.unitCost),
  totalValue: dto.totalValue == null ? null : Number(dto.totalValue),
  status: dto.status ?? null,
  date: dto.date ?? null,
  supplier: dto.supplier ?? null,
  recipient: dto.recipient ?? null,
  // movement_history: 'issue' or 'expired_disposal' on outgoing rows, otherwise null.
  reason: dto.reason ?? null,
  // Inventory rows: expired stock awaiting disposal. `quantity` there is available stock only.
  expiredQuantity: Number(dto.expiredQuantity) || 0,
});

const mapReport = (dto) => ({
  type: dto.type,
  totals: Object.fromEntries(Object.entries(dto.totals ?? {}).map(([key, value]) => [key, Number(value) || 0])),
  breakdown: (dto.breakdown ?? []).map((entry) => ({ categoryId: entry.categoryId, value: Number(entry.value) || 0 })),
  rows: (dto.rows ?? []).map(mapRow),
  pagination: {
    page: Number(dto.pagination?.page) || 1,
    pageSize: Number(dto.pagination?.pageSize) || (dto.rows ?? []).length,
    totalItems: Number(dto.pagination?.totalItems) || (dto.rows ?? []).length,
    totalPages: Number(dto.pagination?.totalPages) || 1,
  },
});

// ---- Mock implementation -------------------------------------------------------------

const paginate = (rows, page, pageSize) => {
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  return {
    rows: rows.slice((current - 1) * size, current * size),
    pagination: { page: current, pageSize: size, totalItems: rows.length, totalPages },
  };
};

const sum = (rows, pick) => round2(rows.reduce((total, row) => total + pick(row), 0));
const count = (rows, predicate) => rows.filter(predicate).length;

const buildMockReport = (db, type, { from, to, categoryId, itemId, search = '', page, pageSize }) => {
  if (!REPORT_TYPES.includes(type)) throw new ApiError('Unknown report type.', { status: 404 });

  const { itemNames, categoryNames, batchNumbers } = selectNameMaps(db);
  const itemsById = new Map(db.items.map((item) => [item.id, item]));
  const matchesFilters = (item) => item && (!categoryId || item.categoryId === categoryId) && (!itemId || item.id === itemId);

  const inventory = selectInventory(db)
    .filter(matchesFilters)
    .filter((item) => matchesSearch([item.name, categoryNames.get(item.categoryId)], search));
  // `inventory` is the active inventory (archived items excluded). `transactions` is history:
  // it keeps the transactions of archived items. Reports never include cancelled transactions.
  const transactions = selectActiveTransactions(db)
    .filter((tx) => (!from || tx.date >= from) && (!to || tx.date <= to))
    .filter((tx) => matchesFilters(itemsById.get(tx.itemId)));

  let rows;
  let totals;
  let breakdown = [];

  if (type === 'movement_history') {
    rows = transactions
      .filter((tx) => matchesSearch([itemNames.get(tx.itemId), tx.type, tx.supplier, tx.recipient, batchNumbers.get(tx.batchId), isDisposal(tx) ? OUTGOING_REASON_LABELS[tx.reason] : null], search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((tx) => ({
        id: tx.id,
        type: tx.type,
        itemId: tx.itemId,
        quantity: tx.quantity,
        date: tx.date,
        supplier: tx.supplier ?? null,
        recipient: tx.recipient ?? null,
        reason: tx.type === TRANSACTION_TYPES.OUTGOING ? (tx.reason ?? OUTGOING_REASONS.ISSUE) : null,
        unitCost: tx.unitCost ?? null,
        // Both types: quantity × the Unit Cost stored on the transaction.
        totalValue: selectTransactionValue(tx),
      }));
    totals = {
      incomingCount: count(rows, (row) => row.type === TRANSACTION_TYPES.INCOMING),
      // Stock issued for use and expired stock disposed of are counted apart: a disposal is
      // an outgoing movement, but it is not consumption.
      outgoingCount: count(rows, (row) => row.reason === OUTGOING_REASONS.ISSUE),
      disposalCount: count(rows, (row) => row.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL),
      itemsCount: new Set(rows.map((row) => row.itemId)).size,
      transactionsCount: rows.length,
    };
  } else if (type === 'critical_items') {
    rows = selectCriticalInventory(inventory);
    totals = {
      totalItems: new Set(rows.map((row) => row.itemId)).size,
      lowStock: count(rows, (row) => row.status === STOCK_STATUS.LOW),
      outOfStock: count(rows, (row) => row.status === STOCK_STATUS.OUT),
      // Expired and expiring-soon are counted separately; `expiring` is their sum.
      expired: count(rows, (row) => row.status === EXPIRY_STATUS.EXPIRED),
      expiringSoon: count(rows, (row) => row.status === EXPIRY_STATUS.EXPIRING_SOON),
      expiring: count(rows, (row) => row.status === EXPIRY_STATUS.EXPIRED || row.status === EXPIRY_STATUS.EXPIRING_SOON),
      alerts: rows.length,
    };
  } else if (type === 'inventory_value') {
    rows = inventory.map((item) => ({
      id: item.id, itemId: item.id, categoryId: item.categoryId, quantity: item.quantity, expiredQuantity: item.expiredQuantity, unit: item.unit, unitCost: item.avgUnitCost, totalValue: item.stockValue,
    }));
    // Rows and stockValue describe the AVAILABLE inventory as it is now (active items, expired
    // batches left out). expiredValue is the expired stock still awaiting disposal, valued with
    // the same Average Cost and reported beside stockValue, never inside it. incomingValue,
    // outgoingValue (stock issued for use) and disposedValue (expired stock disposed of) are history: every active transaction in the date range that matches the
    // filters, including those of archived items, so they always agree with Movement History.
    const inScope = transactions.filter((tx) => {
      const item = itemsById.get(tx.itemId);
      return matchesSearch([item.name, categoryNames.get(item.categoryId)], search);
    });
    totals = {
      totalItems: inventory.length,
      stockValue: sum(inventory, (item) => item.stockValue),
      expiredValue: sum(inventory, (item) => item.expiredValue),
      incomingValue: sumTransactionValues(inScope.filter((tx) => tx.type === TRANSACTION_TYPES.INCOMING)),
      // Each outgoing transaction is counted once: either as issued or as disposed.
      outgoingValue: sumTransactionValues(inScope.filter((tx) => tx.type === TRANSACTION_TYPES.OUTGOING && !isDisposal(tx))),
      disposedValue: sumTransactionValues(inScope.filter(isDisposal)),
    };
    breakdown = db.categories
      .map((category) => ({ categoryId: category.id, value: sum(inventory.filter((item) => item.categoryId === category.id), (item) => item.stockValue) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);
  } else {
    rows = inventory.map((item) => ({
      id: item.id, itemId: item.id, categoryId: item.categoryId, quantity: item.quantity, expiredQuantity: item.expiredQuantity, unit: item.unit, totalValue: item.stockValue, status: item.status,
    }));
    totals = {
      totalItems: rows.length,
      available: count(rows, (row) => row.status === STOCK_STATUS.AVAILABLE),
      lowStock: count(rows, (row) => row.status === STOCK_STATUS.LOW),
      outOfStock: count(rows, (row) => row.status === STOCK_STATUS.OUT),
    };
  }

  return { type, totals, breakdown, ...paginate(rows, page, pageSize) };
};

// ---- Service ---------------------------------------------------------------------------

// Filters: { from, to (ISO dates), categoryId, itemId, search, page, pageSize }
export const getReportApi = async (type, { from, to, categoryId, itemId, search = '', page = 1, pageSize = 10 } = {}) => {
  const dto = await request({
    delay: 100,
    access: ACCESS.ADMIN,
    api: () => http.get(`/reports/${type}`, { params: { from, to, categoryId, itemId, search: search || undefined, page, pageSize } }),
    mock: (db) => buildMockReport(db, type, { from, to, categoryId, itemId, search, page, pageSize }),
  });
  return mapReport(dto);
};
