import { NOTIFICATION_TYPES, TRANSACTION_TYPES } from '../constants/inventory';
import { toMonthKey } from '../utils/dates';
import { ACCESS } from '../constants/users';
import { EXPIRY_STATUS, STOCK_STATUS } from '../utils/stock';
import { http } from './apiAxios';
import { matchesSearch, readNotifications } from './mock/mockDb';
import { isDisposal, selectActiveTransactions, selectCriticalInventory, selectInventory, selectNameMaps } from './mock/mockSelectors';
import { mapNotification, searchMockNotifications } from './notificationsApi';
import { request } from './request';
import { mapTransaction } from './transactionsApi';

// All values are counts of active items, so nothing adds boxes to bottles:
//   availableCount / lowStockCount / outOfStockCount: items by stock status (they add up to totalItems)
//   expiringSoonCount: items with a batch expiring within the warning period, not yet expired
//   expiredCount:      items with a batch that has already expired
const mapSummary = (dto) => ({
  totalItems: Number(dto.totalItems) || 0,
  availableCount: Number(dto.availableCount) || 0,
  lowStockCount: Number(dto.lowStockCount) || 0,
  outOfStockCount: Number(dto.outOfStockCount) || 0,
  expiringSoonCount: Number(dto.expiringSoonCount) || 0,
  expiredCount: Number(dto.expiredCount) || 0,
});

// { month: 'YYYY-MM', incoming, outgoing, disposed } - raw quantities, the UI scales the bars.
//   incoming: stock received
//   outgoing: stock issued for use (as in the reports, an expired stock disposal is not an issue)
//   disposed: expired stock disposed of, reported apart so it is never counted as consumption
// Known limitation: the quantities of all items are added together whatever their unit, so the
// chart shows relative activity, not a stock figure. It includes archived items' history.
const mapMovement = (dto) => ({ month: dto.month, incoming: Number(dto.incoming) || 0, outgoing: Number(dto.outgoing) || 0, disposed: Number(dto.disposed) || 0 });

// { id, itemId, categoryId, quantity, status } where status is a stock or expiry status.
const mapCriticalRow = (dto) => ({
  id: String(dto.id),
  itemId: dto.itemId,
  categoryId: dto.categoryId,
  quantity: Number(dto.quantity) || 0,
  status: dto.status,
});

// Severity order of dashboard alerts, most severe first: out of stock, low stock, then expiry,
// where a batch that has already expired comes before one that is only expiring soon.
// Alerts of the same rank keep the notifications order (newest first).
const alertRank = (alert) => {
  if (alert.type === NOTIFICATION_TYPES.OUT_OF_STOCK) return 0;
  if (alert.type === NOTIFICATION_TYPES.LOW_STOCK) return 1;
  return alert.expiryStatus === EXPIRY_STATUS.EXPIRED ? 2 : 3;
};

export const getDashboardSummaryApi = async () => {
  const dto = await request({
    delay: 100,
    api: () => http.get('/dashboard/summary'),
    mock: (db) => {
      const inventory = selectInventory(db);
      const withStatus = (status) => inventory.filter((item) => item.status === status).length;
      const withBatch = (expiryStatus) => inventory.filter((item) => item.batches.some((batch) => batch.expiryStatus === expiryStatus)).length;
      return {
        totalItems: inventory.length,
        availableCount: withStatus(STOCK_STATUS.AVAILABLE),
        lowStockCount: withStatus(STOCK_STATUS.LOW),
        outOfStockCount: withStatus(STOCK_STATUS.OUT),
        expiringSoonCount: withBatch(EXPIRY_STATUS.EXPIRING_SOON),
        expiredCount: withBatch(EXPIRY_STATUS.EXPIRED),
      };
    },
  });
  return mapSummary(dto);
};

export const getStockMovementApi = async ({ months = 6 } = {}) => {
  const dtos = await request({
    delay: 100,
    access: ACCESS.ADMIN,
    api: () => http.get('/dashboard/stock-movement', { params: { months } }),
    mock: (db) => {
      const now = new Date();
      const keys = Array.from({ length: months }, (_, index) => toMonthKey(new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1)));
      return keys.map((month) => {
        const inMonth = selectActiveTransactions(db).filter((tx) => tx.date.startsWith(month));
        const total = (matches) => inMonth.filter(matches).reduce((sum, tx) => sum + tx.quantity, 0);
        return {
          month,
          incoming: total((tx) => tx.type === TRANSACTION_TYPES.INCOMING),
          outgoing: total((tx) => tx.type === TRANSACTION_TYPES.OUTGOING && !isDisposal(tx)),
          disposed: total(isDisposal),
        };
      });
    },
  });
  return dtos.map(mapMovement);
};

export const getCriticalInventoryApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    delay: 100,
    api: () => http.get('/dashboard/critical-inventory', { params: { search: search || undefined } }),
    mock: (db) => {
      const { itemNames, categoryNames } = selectNameMaps(db);
      return selectCriticalInventory(selectInventory(db)).filter((row) =>
        matchesSearch([itemNames.get(row.itemId), categoryNames.get(row.categoryId), row.status.replace(/_/g, ' ')], search));
    },
  });
  return dtos.map(mapCriticalRow);
};

// Most severe alerts first (see alertRank). Same model as notifications, and the same alerts any
// signed-in user can read there, so both dashboards use it.
export const getCriticalAlertsApi = async ({ search = '', limit = 3 } = {}) => {
  const dtos = await request({
    delay: 100,
    api: () => http.get('/dashboard/alerts', { params: { search: search || undefined, limit } }),
    mock: (db) => searchMockNotifications(db, readNotifications(), search)
      .sort((a, b) => alertRank(a) - alertRank(b))
      .slice(0, limit),
  });
  return dtos.map(mapNotification);
};

// Newest active transactions of both types (cancelled ones are left out). Same model as transactions.
export const getRecentTransactionsApi = async ({ search = '', limit = 5 } = {}) => {
  const dtos = await request({
    delay: 100,
    api: () => http.get('/dashboard/recent-transactions', { params: { search: search || undefined, limit } }),
    mock: (db) => {
      const { itemNames, userNames, batchNumbers } = selectNameMaps(db);
      return selectActiveTransactions(db)
        .filter((tx) => matchesSearch([itemNames.get(tx.itemId), tx.type, userNames.get(tx.recordedBy), batchNumbers.get(tx.batchId)], search))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
  });
  return dtos.map(mapTransaction);
};
