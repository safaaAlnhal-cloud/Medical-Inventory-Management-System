import { NOTIFICATION_TYPES, OUTGOING_REASONS, TRANSACTION_STATUS, TRANSACTION_TYPES } from '../../constants/inventory';
import { EXPIRY_STATUS, getExpiryStatus, getStockStatus, STOCK_STATUS } from '../../utils/stock';

// Read-side helpers for the mock database. They play the role of the backend's queries:
// stock, batches, alerts and user views are all derived from items + transactions.

// Rounding: money totals (transaction value, stock value) are rounded to 2 decimals. A unit
// cost is kept to 4 decimals and only shortened for display, so quantity × Average Cost does
// not drift by a cent (3 at $10 + 4 at $11 is $74.00, not 7 × $10.57 = $73.99).
export const round2 = (value) => Math.round(value * 100) / 100;
const roundUnitCost = (value) => Math.round(value * 10000) / 10000;

// ---- Cancelled transactions: MOCK BUSINESS LOGIC -------------------------------------------
// A cancelled transaction stays in db.transactions as a record, but it must not count
// anywhere. Every calculation (stock, batches, Average Cost, dashboard, alerts, reports)
// reads the transactions through these helpers, never db.transactions directly, so
// cancelling one is equivalent to it never having been recorded.
export const isActiveTransaction = (tx) => tx.status !== TRANSACTION_STATUS.CANCELLED;
export const selectActiveTransactions = (db) => db.transactions.filter(isActiveTransaction);

// ---- Transaction value: MOCK BUSINESS LOGIC ------------------------------------------------
// The monetary value of one transaction: quantity × the Unit Cost stored on it.
//   incoming: unitCost is the purchase price that was entered;
//   outgoing: unitCost is the Average Cost snapshot saved when the stock was issued.
// The stored snapshot is used as it is and is never recalculated here. Returns null when
// the quantity or Unit Cost is missing or not a valid number, so the UI can show a placeholder.
export const selectTransactionValue = (tx) => {
  if (tx.quantity == null || tx.unitCost == null) return null;
  const value = Number(tx.quantity) * Number(tx.unitCost);
  return Number.isFinite(value) && value >= 0 ? round2(value) : null;
};

// Total value of a list of transactions. One without a valid value counts as 0.
export const sumTransactionValues = (transactions) =>
  round2(transactions.reduce((total, tx) => total + (selectTransactionValue(tx) ?? 0), 0));

// ---- Average Cost: MOCK BUSINESS LOGIC ----------------------------------------------------
// The ONE place in the frontend where Average Cost is calculated. It exists only because
// there is no backend yet. With a real API the backend calculates `avgUnitCost` and this
// function is no longer called (see BACKEND_HANDOFF.md, "Average Cost and Unit Cost").
//
// Running (moving) weighted average, replayed over one item's transactions in the order
// they were recorded:
//   incoming:  averageCost = (stockQuantity × averageCost + quantity × unitCost)
//                            ÷ (stockQuantity + quantity)
//   outgoing:  reduces stockQuantity only. It never changes averageCost.
//
//   e.g. receive 10 at $5, then 20 at $8  ->  (10×5 + 20×8) ÷ 30 = $7   (not (5+8)÷2)
//        issue 5                          ->  still $7 (25 left)
//        receive 15 at $9                 ->  (25×7 + 15×9) ÷ 40 = $7.75
//
// An item with no stock keeps its last Average Cost; one that never received stock has 0.
//
// Only active transactions are passed in. Because the value is replayed from the start
// every time, cancelling an earlier transaction automatically gives the Average Cost the
// item would have had without it, including its effect on every later receipt.
const byRecordedOrder = (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

const calculateAverageCost =(itemTransactions) => {
  let stockQuantity = 0;
  let averageCost = 0;
  for (const tx of [...itemTransactions].sort(byRecordedOrder)) {
    if (tx.type === TRANSACTION_TYPES.INCOMING) {
      const newQuantity = stockQuantity + tx.quantity;
      if (newQuantity > 0) averageCost = (stockQuantity * averageCost + tx.quantity * tx.unitCost) / newQuantity;
      stockQuantity = newQuantity;
    } else {
      stockQuantity = Math.max(0, stockQuantity - tx.quantity);
    }
  }
  return roundUnitCost(averageCost);
};

// The rules that must always hold between active transactions, batches and items. Used as
// the final check before a multi-step change (editing a transaction) is saved:
//   - a transaction's batch exists and belongs to the same item;
//   - a batch is received by exactly one incoming transaction;
//   - stock is only issued from a batch after it was received (recorded order and date);
//   - a batch never goes below zero at any point in its history.
export const isStockConsistent = (db) => {
  const batchesById = new Map(db.batches.map((batch) => [batch.id, batch]));
  const receipts = new Map();
  const balances = new Map();
  for (const tx of selectActiveTransactions(db).sort(byRecordedOrder)) {
    const batch = batchesById.get(tx.batchId);
    if (!batch || batch.itemId !== tx.itemId) return false;
    if (tx.type === TRANSACTION_TYPES.INCOMING) {
      if (receipts.has(batch.id)) return false;
      receipts.set(batch.id, tx);
      balances.set(batch.id, tx.quantity);
    } else {
      const receipt = receipts.get(batch.id);
      if (!receipt || tx.date < receipt.date) return false;
      const left = balances.get(batch.id) - tx.quantity;
      if (left < 0) return false;
      balances.set(batch.id, left);
    }
  }
  return true;
};

// Builds the full view of one item. Relationships use ids only:
//   transaction.itemId -> item.id        transaction.batchId -> batch.id
//   batch.itemId -> item.id
//   - a batch's quantity is what was received into it minus what was issued from it;
//   - a batch keeps the purchase price it was received at (batch.unitCost);
//   - the item's avgUnitCost is the running weighted average above;
//   - stock value is quantity × avgUnitCost.
//
// ---- Batch expiry: MOCK BUSINESS LOGIC --------------------------------------------------------
// Expiry belongs to a batch, never to an item. The ONE place a batch's quantities are split:
//   quantity          what is physically left in the batch (received - issued - disposed)
//   expiryStatus      'expired' | 'expiring_soon' | null, from the batch's expiry date and today's
//                     local date (getExpiryStatus in utils/stock.js). Nobody sets it by hand.
//   availableQuantity quantity if the batch has not expired, otherwise 0
//   expiredQuantity   quantity if the batch has expired, otherwise 0: expired stock that is
//                     still on the shelf, awaiting a disposal transaction
// An expired batch stays recorded with its quantity, cost, supplier and expiry date until its
// stock is disposed of; only then does its quantity reach 0.
export const selectBatchQuantities = (quantity, expiryDate, now = new Date()) => {
  const expiryStatus = getExpiryStatus(expiryDate, now);
  const expired = expiryStatus === EXPIRY_STATUS.EXPIRED;
  return { quantity, expiryStatus, availableQuantity: expired ? 0 : quantity, expiredQuantity: expired ? quantity : 0 };
};

// An outgoing transaction either issues usable stock or disposes of expired stock.
export const isDisposal = (tx) => tx.type === TRANSACTION_TYPES.OUTGOING && tx.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL;

// The item's figures follow from its batches:
//   quantity         AVAILABLE stock: the sum of availableQuantity. This is the stock every
//                    rule uses (stock status, low / out of stock alerts, dashboard, reports).
//   expiredQuantity  expired stock awaiting disposal: the sum of expiredQuantity
//   disposedQuantity what active disposal transactions have already removed
//   stockValue       AVAILABLE value: quantity × avgUnitCost
//   expiredValue     expiredQuantity × avgUnitCost, reported separately, never inside stockValue
// One expired batch never makes the item expired: its other batches stay available.
// Costing is unchanged: the Average Cost is still the moving average over every receipt, an
// expired batch keeps its own purchase price, and nothing is rewritten when a batch expires.
export const selectItem = (db, item, now = new Date()) => {
  const transactions = selectActiveTransactions(db).filter((tx) => tx.itemId === item.id);

  const remaining = new Map();
  for (const tx of transactions) {
    const change = tx.type === TRANSACTION_TYPES.INCOMING ? tx.quantity : -tx.quantity;
    remaining.set(tx.batchId, (remaining.get(tx.batchId) || 0) + change);
  }

  const inStock = db.batches
    .filter((batch) => batch.itemId === item.id)
    .map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      ...selectBatchQuantities(remaining.get(batch.id) || 0, batch.expiryDate, now),
      unitCost: batch.unitCost,
      supplier: batch.supplier,
      expiryDate: batch.expiryDate ?? null,
    }))
    .filter((batch) => batch.quantity > 0);

  const total = (pick) => inStock.reduce((sum, batch) => sum + pick(batch), 0);
  const quantity = total((batch) => batch.availableQuantity);
  const expiredQuantity = total((batch) => batch.expiredQuantity);
  const disposedQuantity = transactions.filter(isDisposal).reduce((sum, tx) => sum + tx.quantity, 0);
  const avgUnitCost = calculateAverageCost(transactions);
  // The next date usable stock will expire: expired batches are no longer "about to" expire.
  const expiryDates = inStock.filter((batch) => batch.availableQuantity > 0).map((batch) => batch.expiryDate).filter(Boolean).sort();

  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    unit: item.unit,
    minQty: item.minQty,
    quantity,
    expiredQuantity,
    disposedQuantity,
    expiredValue: round2(expiredQuantity * avgUnitCost),
    status: getStockStatus(quantity, item.minQty),
    // False until the item has an active receipt. A brand-new item is not "out of stock" in
    // the sense of an alert: nothing has run out, it simply has not been stocked yet.
    hasReceivedStock: transactions.some((tx) => tx.type === TRANSACTION_TYPES.INCOMING),
    avgUnitCost,
    stockValue: round2(quantity * avgUnitCost),
    nearestExpiryDate: expiryDates[0] ?? null,
    batches: inStock,
    archived: Boolean(item.archived),
    archivedAt: item.archivedAt ?? null,
  };
};

// ---- Archived items: MOCK BUSINESS LOGIC -----------------------------------------------------
// "Deleting" an item archives it (item.archived = true, item.archivedAt = timestamp). The item
// record, its id, its batches and all of its transactions are kept.
//   - Active inventory (lists, selectors, dashboard, alerts, stock value) = items not archived.
//   - History (transaction lists, Movement History, incoming / outgoing value, stock movement)
//     = every transaction, including those of archived items.
//   - An item can only be archived while its stock is 0 (see archiveInventoryItemApi), so
//     archiving never takes stock or stock value out of the inventory.
export const selectInventory = (db) => db.items.filter((item) => !item.archived).map((item) => selectItem(db, item));
export const selectArchivedInventory = (db) => db.items.filter((item) => item.archived).map((item) => selectItem(db, item));

// An item raises a stock alert when it is low or out of stock, except an item that has never
// received stock (see hasReceivedStock above).
const needsStockAlert = (item) => item.status !== STOCK_STATUS.AVAILABLE && item.hasReceivedStock;

// One row per problem: an item can be low on stock, hold expired stock and have stock close
// to expiry all at once. Expired and expiring-soon are separate rows and never mixed:
//   stock row:          quantity = the item's available stock
//   expired row:        quantity = expired stock awaiting disposal
//   expiring-soon row:  quantity = stock in batches that expire within the warning period
export const selectCriticalInventory = (inventory) =>
  inventory.flatMap((item) => {
    const base = { itemId: item.id, categoryId: item.categoryId, quantity: item.quantity, minQty: item.minQty, unit: item.unit };
    const rows = [];

    if (needsStockAlert(item)) rows.push({ ...base, id: `${item.status}-${item.id}`, status: item.status });

    for (const status of [EXPIRY_STATUS.EXPIRED, EXPIRY_STATUS.EXPIRING_SOON]) {
      const batches = item.batches.filter((batch) => batch.expiryStatus === status);
      if (!batches.length) continue;
      rows.push({
        ...base,
        id: `${status}-${item.id}`,
        status,
        quantity: batches.reduce((sum, batch) => sum + batch.quantity, 0),
        expiryDate: batches.map((batch) => batch.expiryDate).sort()[0],
      });
    }
    return rows;
  });

// Stock alerts follow the item's AVAILABLE stock, so expired stock never hides a shortage.
// Each batch with stock raises at most one expiry alert: "expired" (awaiting disposal, raised
// until the stock is disposed of) or "expiring soon", never both.
const selectAlerts = (db) =>
  selectInventory(db).flatMap((item) => {
    const alerts = [];
    if (needsStockAlert(item)) {
      const type = item.status === STOCK_STATUS.OUT ? NOTIFICATION_TYPES.OUT_OF_STOCK : NOTIFICATION_TYPES.LOW_STOCK;
      alerts.push({ id: `${type}-${item.id}`, type, itemId: item.id, quantity: item.quantity, minQty: item.minQty, batchId: null, expiryDate: null, expiryStatus: null });
    }
    for (const batch of item.batches) {
      const { expiryStatus } = batch;
      if (!expiryStatus) continue;
      alerts.push({
        id: `${NOTIFICATION_TYPES.EXPIRING}-${batch.id}`,
        type: NOTIFICATION_TYPES.EXPIRING,
        itemId: item.id,
        quantity: batch.quantity,
        minQty: null,
        batchId: batch.id,
        expiryDate: batch.expiryDate,
        // 'expired' or 'expiring_soon': an expired batch is never reported as merely expiring.
        expiryStatus,
      });
    }
    return alerts;
  });

// Notifications are the current alerts plus their stored state:
//   db.notificationState[alertId] = { createdAt, readBy: [userId, ...] }
// The alert itself is shared, but read state is per user: `read` is true only for the users
// listed in readBy. An alert that is no longer true (e.g. after restocking) drops out; if it
// comes back later it is unread again for everyone.
// Returns { list, changed } so the caller can persist when the stored state was updated.
export const syncNotifications = (db, userId, now = new Date()) => {
  const alerts = selectAlerts(db);
  const activeIds = new Set(alerts.map((alert) => alert.id));
  let changed = false;

  for (const id of Object.keys(db.notificationState)) {
    if (!activeIds.has(id)) { delete db.notificationState[id]; changed = true; }
  }

  const list = alerts.map((alert) => {
    if (!db.notificationState[alert.id]) {
      db.notificationState[alert.id] = { createdAt: now.toISOString(), readBy: [] };
      changed = true;
    }
    const state = db.notificationState[alert.id];
    return { ...alert, createdAt: state.createdAt, read: state.readBy.includes(userId) };
  });

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { list, changed };
};

// Gives the seeded alerts staggered ages ("20 minutes ago", "1 hour ago", ...).
export const seedNotificationState = (db) => {
  const typeOrder = [NOTIFICATION_TYPES.LOW_STOCK, NOTIFICATION_TYPES.EXPIRING, NOTIFICATION_TYPES.OUT_OF_STOCK];
  const ageMinutes = [20, 60, 120, 240, 1500];
  selectAlerts(db)
    .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
    .forEach((alert, index) => {
      const age = ageMinutes[index] ?? 1500 + index * 60;
      db.notificationState[alert.id] = { createdAt: new Date(Date.now() - age * 60000).toISOString(), readBy: [] };
    });
};

// The public view of a user: never includes the password.
export const selectUser = (db, user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  phone: user.phone ?? '',
  lastActiveAt: user.lastActiveAt ?? null,
  transactionsCount: selectActiveTransactions(db).filter((tx) => tx.recordedBy === user.id).length,
});

export const selectNameMaps = (db) => ({
  itemNames: new Map(db.items.map((item) => [item.id, item.name])),
  categoryNames: new Map(db.categories.map((category) => [category.id, category.name])),
  userNames: new Map(db.users.map((user) => [user.id, user.name])),
  batchNumbers: new Map(db.batches.map((batch) => [batch.id, batch.batchNumber])),
});
