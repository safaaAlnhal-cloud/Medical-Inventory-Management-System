import { OUTGOING_REASON_LABELS, OUTGOING_REASONS, TRANSACTION_STATUS, TRANSACTION_TYPES } from '../constants/inventory';
import { parseDate, toISODate } from '../utils/dates';
import { formatDate } from '../utils/formatters';
import { EXPIRY_STATUS, getExpiryStatus } from '../utils/stock';
import { http } from './apiAxios';
import { ApiError } from './apiError';
import { mapBatch } from './inventoryApi';
import { commit, matchesSearch, nextId, requireCurrentUser, transact } from './mock/mockDb';
import { isActiveTransaction, isDisposal, isStockConsistent, selectActiveTransactions, selectItem, selectNameMaps } from './mock/mockSelectors';
import { request } from './request';

// Frontend transaction model:
// { id, type, itemId, batchId, quantity, date, createdAt, recordedBy (userId),
//   unitCost, supplier, expiryDate, manufacturerId, manufacturingDate (incoming only),
//   recipient, reason (outgoing only),
//   status ('active' | 'cancelled'), cancelledAt, cancelledBy (userId) }
// reason:   outgoing only. 'issue' = usable stock given to `recipient`; 'expired_disposal' =
//           expired stock removed from its batch (no recipient). Null on incoming.
// batchId:  the unique id of the batch the stock was received into / issued from.
//           The batch number shown to users is resolved from it (useLookups).
// unitCost: incoming = the purchase price entered by the user;
//           outgoing = the item's Average Cost when the transaction was created (set by the
//           data layer, never sent by the UI, and never recalculated afterwards).
// status:   a cancelled transaction is still listed, but it is excluded from every stock,
//           cost, dashboard and report calculation.
export const mapTransaction = (dto) => ({
  id: dto.id,
  type: dto.type,
  itemId: dto.itemId,
  batchId: dto.batchId,
  quantity: Number(dto.quantity) || 0,
  date: dto.date,
  createdAt: dto.createdAt ?? dto.date,
  recordedBy: dto.recordedBy,
  unitCost: dto.unitCost == null ? null : Number(dto.unitCost),
  supplier: dto.supplier ?? null,
  expiryDate: dto.expiryDate ?? null,
  // Incoming only, both read from the batch it received; null when unknown.
  manufacturerId: dto.manufacturerId ?? null,
  manufacturingDate: dto.manufacturingDate ?? null,
  recipient: dto.recipient ?? null,
  // Outgoing only: 'issue' (usable stock given to a recipient) or 'expired_disposal' (expired
  // stock removed; it has no recipient). An outgoing transaction without one is an issue.
  reason: dto.type === TRANSACTION_TYPES.OUTGOING ? (dto.reason ?? OUTGOING_REASONS.ISSUE) : null,
  status: dto.status ?? TRANSACTION_STATUS.ACTIVE,
  cancelledAt: dto.cancelledAt ?? null,
  cancelledBy: dto.cancelledBy ?? null,
});

const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt);

const listMock = (db, type, { search, itemId, from, to }) => {
  const { itemNames, userNames, batchNumbers } = selectNameMaps(db);
  const manufacturerNames = new Map(db.manufacturers.map((manufacturer) => [manufacturer.id, manufacturer.name]));
  return db.transactions
    .filter((tx) => tx.type === type)
    .filter((tx) => !itemId || tx.itemId === itemId)
    .filter((tx) => (!from || tx.date >= from) && (!to || tx.date <= to))
    .filter((tx) => matchesSearch([itemNames.get(tx.itemId), batchNumbers.get(tx.batchId), tx.supplier, tx.recipient, userNames.get(tx.recordedBy), manufacturerNames.get(tx.manufacturerId), isDisposal(tx) ? OUTGOING_REASON_LABELS[tx.reason] : null], search))
    .sort(byNewest);
};

// ---- Mock-side validation, shared by creating and editing ---------------------------------

// `field` names the form field at fault, so the form can show the message under that input.
const invalid = (message, status = 422, field = null) => new ApiError(message, { status, fieldErrors: field ? { [field]: message } : null });

// A real calendar date in YYYY-MM-DD form (2026-02-31 is rejected).
const isValidDate = (value) => {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : null;
  return date !== null && toISODate(date) === value;
};

// Quantity: any number above zero. The forms only offer whole numbers; whether fractional
// quantities must be rejected is a backend decision (see BACKEND_HANDOFF.md).
const requireQuantity = (value) => {
  const quantity = value === '' || value == null ? NaN : Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) throw invalid('Quantity must be greater than zero.', 422, 'quantity');
  return quantity;
};

const requireDate = (value) => {
  if (!value) throw invalid('Transaction date is required.', 422, 'date');
  if (!isValidDate(value)) throw invalid('Transaction date is not a valid date.', 422, 'date');
  return value;
};

const optionalExpiryDate = (value) => {
  if (!value) return null;
  if (!isValidDate(value)) throw invalid('Expiry date is not a valid date.', 422, 'expiryDate');
  return value;
};

const requireUnitCost = (value) => {
  const unitCost = value === '' || value == null ? NaN : Number(value);
  if (!Number.isFinite(unitCost) || unitCost < 0) throw invalid('Unit cost must be zero or more.', 422, 'unitCost');
  return unitCost;
};

const requireBatchNumber = (value) => {
  const batchNumber = String(value ?? '').trim();
  if (!batchNumber) throw invalid('Batch number is required.', 422, 'batchNumber');
  return batchNumber;
};

const requireText = (value, field, message) => {
  const text = String(value ?? '').trim();
  if (!text) throw invalid(message, 422, field);
  return text;
};

// Supplier and manufacturer names: optional, at most 150 characters, inner spaces collapsed.
const MAX_NAME_LENGTH = 150;
const optionalName = (value, field, label) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > MAX_NAME_LENGTH) throw invalid(`${label} may not be longer than ${MAX_NAME_LENGTH} characters.`, 422, field);
  return text || null;
};

// Not in the future, not after the receipt date, not after the expiry date.
const optionalManufacturingDate = (value, date, expiryDate) => {
  if (!value) return null;
  if (!isValidDate(value)) throw invalid('Manufacturing date is not a valid date.', 422, 'manufacturingDate');
  if (value > toISODate() || value > date || (expiryDate && value > expiryDate)) {
    throw invalid('Manufacturing date cannot be in the future, after the transaction date or after the expiry date.', 422, 'manufacturingDate');
  }
  return value;
};

// The same comparison as the backend's Manufacturer::normalize(): letter case, spaces and
// punctuation are ignored, so "PharmaCo", "pharmaco" and "Pharma Co." are one manufacturer.
const normalizeName = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The manufacturer the user typed: an existing one matched by any spelling, a new one
// ({ id: null, name }) that saveManufacturer stores once every rule has passed, or null when
// the field was left empty.
const findManufacturer = (db, value) => {
  const name = optionalName(value, 'manufacturer', 'Manufacturer');
  if (!name) return null;
  const normalized = normalizeName(name);
  if (!normalized) throw invalid('Enter a manufacturer name with letters or numbers.', 422, 'manufacturer');
  return db.manufacturers.find((manufacturer) => normalizeName(manufacturer.name) === normalized) ?? { id: null, name };
};

const saveManufacturer = (db, manufacturer) => {
  if (!manufacturer) return null;
  if (manufacturer.id === null) {
    manufacturer.id = nextId(db.manufacturers);
    db.manufacturers.push(manufacturer);
  }
  return manufacturer.id;
};

// New transactions can only be recorded against an item in the active inventory.
const requireActiveItem = (db, itemId) => {
  const item = db.items.find((candidate) => candidate.id === itemId);
  if (!item) throw invalid('Please choose an item from the inventory.', 422, 'itemId');
  if (item.archived) throw invalid(`"${item.name}" is deactivated. Reactivate it before recording transactions for it.`, 422, 'itemId');
  return item;
};

// The transactions of an archived item are history: they stay listed and reported, but cannot
// be edited or cancelled, because either would change the stock of an item that is no longer in
// the inventory. Restoring the item makes them editable again.
const assertItemNotArchived = (db, transaction) => {
  const item = db.items.find((candidate) => candidate.id === transaction.itemId);
  if (item?.archived) throw invalid(`This transaction belongs to "${item.name}", which is deactivated. Reactivate the item to change its transactions.`, 409);
};

// The active incoming transaction that received a batch, and the active outgoing transactions
// that issued from it. `exceptId` leaves one transaction out (the one being edited).
const receiptOf = (db, batchId, exceptId) =>
  selectActiveTransactions(db).find((tx) => tx.type === TRANSACTION_TYPES.INCOMING && tx.batchId === batchId && tx.id !== exceptId);
const issuesFrom = (db, batchId, exceptId) =>
  selectActiveTransactions(db).filter((tx) => tx.type === TRANSACTION_TYPES.OUTGOING && tx.batchId === batchId && tx.id !== exceptId);
const totalQuantity = (transactions) => transactions.reduce((sum, tx) => sum + tx.quantity, 0);

// A batch number is unique per item AND manufacturer (two manufacturers may print the same
// number), letter case ignored. Batches with no manufacturer form one group of their own; a
// manufacturer that is new has no batches yet, so nothing can clash with it. A batch whose
// receipt was cancelled no longer exists as stock, so its number can be used again (the usual
// reason to cancel is to re-enter the receipt correctly). `exceptBatchId` is the batch being edited.
const assertBatchNumberFree = (db, itemId, manufacturer, batchNumber, exceptBatchId) => {
  if (manufacturer && manufacturer.id === null) return;
  const manufacturerId = manufacturer?.id ?? null;
  const duplicate = db.batches.some((batch) => batch.id !== exceptBatchId && batch.itemId === itemId
    && (batch.manufacturerId ?? null) === manufacturerId
    && batch.batchNumber.toLowerCase() === batchNumber.toLowerCase() && receiptOf(db, batch.id));
  if (duplicate) throw invalid(`Batch ${batchNumber} already exists for this item from the same manufacturer. Please use a different batch number.`, 409, 'batchNumber');
};

// MOCK BUSINESS LOGIC. Everything in createMock is what the backend will do once it exists.
// Every value is validated before anything is stored, with the same rules as an edit
// (updateMock), so a rejected transaction leaves no batch or stock change behind.
//
// `reason` applies to outgoing transactions and decides which stock may leave a batch:
//   issue:            only a batch that has NOT expired. Expired stock is never issued, whatever
//                     the page sent, so it cannot be consumed as usable stock.
//   expired_disposal: only a batch that HAS expired, up to the expired quantity still in it.
// Both take the quantity out of the same batch, so a batch can never be disposed of twice or
// below zero: once its quantity is 0 there is nothing left to issue or dispose of.
const createMock = (db, type, payload, reason = OUTGOING_REASONS.ISSUE) => {
  const item = requireActiveItem(db, payload.itemId);
  const quantity = requireQuantity(payload.quantity);
  const date = requireDate(payload.date);

  const base = {
    id: nextId(db.transactions),
    type,
    itemId: item.id,
    quantity,
    date,
    createdAt: new Date().toISOString(),
    // The recorder is the signed-in user, taken from the token. The request carries no user id.
    recordedBy: requireCurrentUser().id,
    status: TRANSACTION_STATUS.ACTIVE,
    cancelledAt: null,
    cancelledBy: null,
  };

  let transaction;
  if (type === TRANSACTION_TYPES.INCOMING) {
    // Every incoming transaction receives a new batch with its own unique id.
    const batchNumber = requireBatchNumber(payload.batchNumber);
    const unitCost = requireUnitCost(payload.unitCost);
    const expiryDate = optionalExpiryDate(payload.expiryDate);
    const supplier = optionalName(payload.supplier, 'supplier', 'Supplier');
    const manufacturer = findManufacturer(db, payload.manufacturer);
    const manufacturingDate = optionalManufacturingDate(payload.manufacturingDate, date, expiryDate);
    assertBatchNumberFree(db, item.id, manufacturer, batchNumber);

    // Only now, with every rule passed, is a new manufacturer stored: a rejected receipt leaves
    // no manufacturer behind (the backend does the same in one database transaction).
    const manufacturerId = saveManufacturer(db, manufacturer);
    const batch = { id: nextId(db.batches), itemId: item.id, batchNumber, unitCost, supplier, expiryDate, manufacturerId, manufacturingDate };
    db.batches.push(batch);
    transaction = { ...base, batchId: batch.id, unitCost, supplier, expiryDate, manufacturerId, manufacturingDate };
  } else {
    // The item as it stands right now, before this transaction is applied.
    const currentItem = selectItem(db, item);
    const batch = currentItem.batches.find((candidate) => candidate.id === payload.batchId);
    if (!batch) throw invalid('The selected batch has no stock for this item.', 422, 'batchId');
    const disposal = reason === OUTGOING_REASONS.EXPIRED_DISPOSAL;
    const expired = batch.expiryStatus === EXPIRY_STATUS.EXPIRED;
    if (disposal && !expired) throw invalid(`Batch ${batch.batchNumber} has not expired. Only expired stock can be disposed of.`, 422, 'batchId');
    if (!disposal && expired) throw invalid(`Batch ${batch.batchNumber} expired on ${formatDate(batch.expiryDate)} and cannot be issued. Record an expired stock disposal for it instead.`, 422, 'batchId');
    // The limit is this batch's own quantity, never the item's total: available stock for an
    // issue, expired stock awaiting disposal for a disposal.
    if (disposal && quantity > batch.expiredQuantity) throw invalid(`Only ${batch.expiredQuantity} expired in batch ${batch.batchNumber} awaiting disposal.`, 422, 'quantity');
    if (!disposal && quantity > batch.availableQuantity) throw invalid(`Only ${batch.availableQuantity} available in batch ${batch.batchNumber}.`, 422, 'quantity');
    const receipt = receiptOf(db, batch.id);
    if (receipt && date < receipt.date) throw invalid(`The date cannot be earlier than ${formatDate(receipt.date)}, when batch ${batch.batchNumber} was received.`, 422, 'date');
    if (disposal && date <= batch.expiryDate) throw invalid(`The disposal date must be after ${formatDate(batch.expiryDate)}, when batch ${batch.batchNumber} expired.`, 422, 'date');
    // A disposal has no recipient: its reason says where the stock went.
    const recipient = disposal ? null : requireText(payload.recipient, 'recipient', 'Recipient is required.');
    // unitCost is a snapshot of the item's current Average Cost, read from the single
    // Average Cost calculation. It is stored on the transaction, so later changes to the
    // Average Cost never alter it. Issuing or disposing of stock does not change the Average
    // Cost itself, and the batch keeps the purchase price it was received at.
    transaction = { ...base, batchId: batch.id, unitCost: currentItem.avgUnitCost, reason, recipient };
  }

  db.transactions.push(transaction);
  commit();
  return transaction;
};

const findTransaction = (db, id) => {
  const transaction = db.transactions.find((candidate) => candidate.id === id);
  if (!transaction) throw new ApiError('This transaction no longer exists.', { status: 404 });
  return transaction;
};

// MOCK BUSINESS LOGIC. Cancelling never removes the record: it only marks it, and every
// calculation skips cancelled transactions (see mockSelectors.js). Nothing else is rewritten,
// so the Unit Cost stored on other outgoing transactions keeps its historical value.
//   outgoing cancelled: its quantity is back in the batch it was issued from.
//   incoming cancelled: the batch it created is no longer in stock. This is refused while
//                       stock issued from that batch is still active, because the batch would
//                       end up with a negative quantity.
const cancelMock = (db, id) => {
  const transaction = findTransaction(db, id);
  if (!isActiveTransaction(transaction)) throw new ApiError('This transaction has already been cancelled.', { status: 409 });
  assertItemNotArchived(db, transaction);

  if (transaction.type === TRANSACTION_TYPES.INCOMING) {
    const issued = selectActiveTransactions(db)
      .filter((tx) => tx.type === TRANSACTION_TYPES.OUTGOING && tx.batchId === transaction.batchId)
      .reduce((sum, tx) => sum + tx.quantity, 0);
    if (issued > 0) {
      const { batchNumbers } = selectNameMaps(db);
      throw new ApiError(`This incoming transaction cannot be cancelled because ${issued} from batch ${batchNumbers.get(transaction.batchId)} has already been issued. Cancel those outgoing transactions first.`, { status: 409 });
    }
  }

  Object.assign(transaction, {
    status: TRANSACTION_STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
    cancelledBy: requireCurrentUser().id,
  });
  commit();
  return transaction;
};

// The batches of `itemId` that `transaction` could issue from if it were an outgoing
// transaction of that item, with the quantity available to it. The transaction's own current
// effect on stock is left out, so its present batch is offered with its own quantity added back.
const selectBatchOptions = (db, transaction, itemId) =>
  db.batches
    .filter((batch) => batch.itemId === itemId)
    .map((batch) => {
      const receipt = receiptOf(db, batch.id, transaction.id);
      // Stock cannot be issued from a batch that was received after the transaction was recorded.
      if (!receipt || receipt.createdAt > transaction.createdAt) return null;
      const quantity = receipt.quantity - totalQuantity(issuesFrom(db, batch.id, transaction.id));
      return { id: batch.id, batchNumber: batch.batchNumber, quantity, expiryDate: batch.expiryDate ?? null };
    })
    .filter((option) => option && option.quantity > 0);

// MOCK BUSINESS LOGIC. Editing replaces every editable field of a transaction, and of the
// batch it received, in one step. It runs inside transact(), so `db` is a copy: any rule that
// fails throws and the real data is left exactly as it was.
//
// Nothing is stored for stock or Average Cost: both are recalculated from the active
// transactions (mockSelectors.js), so once the transaction and batch records are right, every
// derived value (stock, batches, Average Cost, dashboard, alerts, reports) is right as well.
// The Unit Cost stored on OTHER outgoing transactions is never touched.
//
//   stays incoming:        the batch record follows (item, number, cost, supplier, expiry).
//                          While stock issued from the batch is active, the item cannot
//                          change, the quantity cannot drop below what was issued, and the
//                          date cannot move past the first issue.
//   stays outgoing:        may move to another batch or item; the batch must have been
//                          received before this transaction and hold enough stock.
//   incoming -> outgoing:  the batch it received leaves stock (refused while stock issued
//                          from it is active); the transaction then issues from another batch.
//   outgoing -> incoming:  its quantity returns to the batch it was issued from, and it
//                          receives a new batch.
//
// Unit Cost of the edited transaction: incoming = the price entered. Outgoing = its stored
// snapshot, which is kept unless the item changed or it used to be incoming; then it is the
// new item's current Average Cost, exactly as for a newly recorded outgoing transaction.
const updateMock = (db, id, payload) => {
  const transaction = findTransaction(db, id);
  if (!isActiveTransaction(transaction)) throw invalid('A cancelled transaction cannot be edited.', 409);
  assertItemNotArchived(db, transaction);
  // A disposal is an audit record of one expired batch. It is corrected by cancelling it and
  // recording it again, never by turning it into another kind of transaction.
  if (isDisposal(transaction)) throw invalid('An expired stock disposal cannot be edited. If it is wrong, cancel it and record it again.', 409);

  const { type } = payload;
  if (!Object.values(TRANSACTION_TYPES).includes(type)) throw invalid('Please choose a valid transaction type.', 422, 'type');
  const item = requireActiveItem(db, payload.itemId);
  const quantity = requireQuantity(payload.quantity);
  const date = requireDate(payload.date);

  const wasIncoming = transaction.type === TRANSACTION_TYPES.INCOMING;
  const itemChanged = item.id !== transaction.itemId;
  // Stock already issued from the batch this transaction received.
  const ownIssues = wasIncoming ? issuesFrom(db, transaction.batchId) : [];
  const issued = totalQuantity(ownIssues);
  const ownBatchNumber = selectNameMaps(db).batchNumbers.get(transaction.batchId);

  if (type === TRANSACTION_TYPES.INCOMING) {
    const batchNumber = requireBatchNumber(payload.batchNumber);
    const unitCost = requireUnitCost(payload.unitCost);
    const expiryDate = optionalExpiryDate(payload.expiryDate);
    const supplier = optionalName(payload.supplier, 'supplier', 'Supplier');
    const manufacturer = findManufacturer(db, payload.manufacturer);
    const manufacturingDate = optionalManufacturingDate(payload.manufacturingDate, date, expiryDate);

    if (issued > 0) {
      if (itemChanged) throw invalid(`The item cannot be changed because ${issued} from batch ${ownBatchNumber} has already been issued. Cancel those outgoing transactions first.`, 409, 'itemId');
      if (quantity < issued) throw invalid(`The quantity cannot be less than ${issued}, which has already been issued from batch ${ownBatchNumber}.`, 409, 'quantity');
      const firstIssueDate = ownIssues.map((tx) => tx.date).sort()[0];
      if (date > firstIssueDate) throw invalid(`The date cannot be later than ${formatDate(firstIssueDate)}, when stock from batch ${ownBatchNumber} was first issued.`, 422, 'date');
    }

    let batch;
    if (wasIncoming) {
      batch = db.batches.find((candidate) => candidate.id === transaction.batchId);
      assertBatchNumberFree(db, item.id, manufacturer, batchNumber, batch.id);
    } else {
      assertBatchNumberFree(db, item.id, manufacturer, batchNumber);
    }
    // `db` is a copy (transact), so a later failure also drops a manufacturer stored here.
    const manufacturerId = saveManufacturer(db, manufacturer);
    const batchFields = { itemId: item.id, batchNumber, unitCost, supplier, expiryDate, manufacturerId, manufacturingDate };
    if (wasIncoming) {
      Object.assign(batch, batchFields);
    } else {
      batch = { id: nextId(db.batches), ...batchFields };
      db.batches.push(batch);
    }
    delete transaction.recipient;
    delete transaction.reason;
    Object.assign(transaction, { type, itemId: item.id, batchId: batch.id, quantity, date, unitCost, supplier, expiryDate, manufacturerId, manufacturingDate });
  } else {
    if (issued > 0) throw invalid(`This transaction cannot be changed to outgoing because ${issued} from batch ${ownBatchNumber}, which it received, has already been issued. Cancel those outgoing transactions first.`, 409);

    const batch = db.batches.find((candidate) => candidate.id === payload.batchId && candidate.itemId === item.id);
    const receipt = batch && receiptOf(db, batch.id, transaction.id);
    if (!receipt) throw invalid('The selected batch has no stock for this item.', 422, 'batchId');
    if (receipt.createdAt > transaction.createdAt) throw invalid(`Batch ${batch.batchNumber} was received after this transaction was recorded, so the transaction cannot issue stock from it.`, 422, 'batchId');
    const available = receipt.quantity - totalQuantity(issuesFrom(db, batch.id, transaction.id));
    if (quantity > available) throw invalid(`Only ${available} available in batch ${batch.batchNumber}.`, 422, 'quantity');
    if (date < receipt.date) throw invalid(`The date cannot be earlier than ${formatDate(receipt.date)}, when batch ${batch.batchNumber} was received.`, 422, 'date');
    // An issue recorded before its batch expired stays editable (its recipient or date can be
    // corrected), but an edit can never take more stock out of a batch that has expired since,
    // nor move the transaction onto an expired batch.
    if (getExpiryStatus(batch.expiryDate) === EXPIRY_STATUS.EXPIRED) {
      const sameBatch = !wasIncoming && batch.id === transaction.batchId;
      if (!sameBatch) throw invalid(`Batch ${batch.batchNumber} expired on ${formatDate(batch.expiryDate)} and cannot be issued.`, 422, 'batchId');
      if (quantity > transaction.quantity) throw invalid(`Batch ${batch.batchNumber} expired on ${formatDate(batch.expiryDate)}. No more stock can be issued from it.`, 422, 'quantity');
    }
    const recipient = requireText(payload.recipient, 'recipient', 'Recipient is required.');

    delete transaction.supplier;
    delete transaction.expiryDate;
    delete transaction.manufacturerId;
    delete transaction.manufacturingDate;
    Object.assign(transaction, { type, itemId: item.id, batchId: batch.id, quantity, date, recipient, reason: OUTGOING_REASONS.ISSUE });
    if (wasIncoming || itemChanged) transaction.unitCost = selectItem(db, item).avgUnitCost;
  }

  // Safety net behind the specific messages above: nothing inconsistent is ever saved.
  if (!isStockConsistent(db)) throw invalid('This change would leave the stock records inconsistent, so it was not saved.', 409);
  return transaction;
};

const listTransactions = async (type, { search = '', itemId, from, to } = {}) => {
  const dtos = await request({
    api: () => http.get(`/transactions/${type}`, { params: { search: search || undefined, itemId, from, to } }),
    mock: (db) => listMock(db, type, { search, itemId, from, to }),
  });
  return dtos.map(mapTransaction);
};

const createTransaction = async (type, payload) => {
  const dto = await request({
    api: () => http.post(`/transactions/${type}`, payload),
    mock: (db) => createMock(db, type, payload),
  });
  return mapTransaction(dto);
};

// Filters: { search, itemId, from, to } (from/to are ISO dates, inclusive).
// Cancelled transactions are included; each one carries status 'cancelled'.
export const getIncomingTransactionsApi = (filters) => listTransactions(TRANSACTION_TYPES.INCOMING, filters);
export const getOutgoingTransactionsApi = (filters) => listTransactions(TRANSACTION_TYPES.OUTGOING, filters);

// The recorder is always the signed-in user (from the token); no user id is sent.
// Payload: { itemId, batchNumber, quantity, unitCost, date, expiryDate, supplier, manufacturer,
//   manufacturingDate }. expiryDate, supplier, manufacturer (a name) and manufacturingDate are
//   optional (null). A manufacturer name that matches no existing one, in any spelling, creates it.
// Creates a new batch; the saved transaction comes back with that batch's batchId and manufacturerId.
export const createIncomingTransactionApi = (payload) => createTransaction(TRANSACTION_TYPES.INCOMING, payload);

// Payload: { itemId, batchId, quantity, date, recipient }
// The saved transaction comes back with unitCost filled in from the item's Average Cost.
// Fails with 422 if the batch has expired: expired stock can only leave through a disposal.
export const createOutgoingTransactionApi = (payload) => createTransaction(TRANSACTION_TYPES.OUTGOING, payload);

// Records the disposal of expired stock from one batch. Payload: { itemId, batchId, quantity, date }
// The result is an outgoing transaction with reason 'expired_disposal' and no recipient, so it
// appears in the outgoing list, Movement History and the reports as a disposal, never as usage.
// Fails with 422 if the batch has not expired, if `quantity` is more than the expired quantity
// still in the batch, or if `date` is not after the batch's expiry date.
export const createDisposalTransactionApi = async (payload) => {
  const dto = await request({
    api: () => http.post('/transactions/disposal', payload),
    mock: (db) => createMock(db, TRANSACTION_TYPES.OUTGOING, payload, OUTGOING_REASONS.EXPIRED_DISPOSAL),
  });
  return mapTransaction(dto);
};

// Replaces every editable field of a transaction. Payload:
//   { type, itemId, quantity, date }
//   + incoming: { batchNumber, unitCost, expiryDate, supplier, manufacturer, manufacturingDate }
//   + outgoing: { batchId, recipient }     (no unitCost: the data layer sets it)
// Resolves with the saved transaction. If any rule fails nothing is saved (see updateMock).
export const updateTransactionApi = async (id, payload) => {
  const dto = await request({
    api: () => http.put(`/transactions/${id}`, payload),
    mock: () => transact((draft) => updateMock(draft, id, payload)),
  });
  return mapTransaction(dto);
};

// The batches an existing transaction could issue from as an outgoing transaction of `itemId`:
// [{ id, batchNumber, quantity (available to this transaction), expiryDate, expiryStatus }].
// Used by the edit form, so the UI never works out stock itself.
export const getTransactionBatchOptionsApi = async (id, { itemId } = {}) => {
  const dtos = await request({
    delay: 100,
    api: () => http.get(`/transactions/${id}/batch-options`, { params: { itemId } }),
    mock: (db) => selectBatchOptions(db, findTransaction(db, id), itemId),
  });
  return dtos.map((dto) => {
    const { id, batchNumber, quantity, expiryDate, expiryStatus } = mapBatch(dto);
    return { id, batchNumber, quantity, expiryDate, expiryStatus };
  });
};

// MOCK BUSINESS LOGIC. The batches of an item that hold stock, in the order the Outgoing form
// lists them (the backend's TransactionService::batchOptions):
//   1. usable batches of `manufacturerId`, when one is chosen
//   2. the other usable batches
//   3. expired batches (quantity 0): listed so the form can say why they cannot be issued
// Within each group the nearest expiry comes first (first expiry, first out); batches that
// never expire come after them.
const selectItemBatchOptions = (db, itemId, manufacturerId) => {
  const item = db.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new ApiError('The requested record was not found.', { status: 404 });
  if (item.archived) return [];

  const manufacturerOf = new Map(db.batches.map((batch) => [batch.id, batch.manufacturerId ?? null]));
  const group = (batch) => {
    if (batch.expiryStatus === EXPIRY_STATUS.EXPIRED) return 2;
    return manufacturerId != null && batch.manufacturerId === manufacturerId ? 0 : 1;
  };
  return selectItem(db, item).batches
    .map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      quantity: batch.availableQuantity,
      expiryDate: batch.expiryDate,
      expiryStatus: batch.expiryStatus,
      manufacturerId: manufacturerOf.get(batch.id),
    }))
    .sort((a, b) => group(a) - group(b)
      || (a.expiryDate === null) - (b.expiryDate === null)
      || (a.expiryDate ?? '').localeCompare(b.expiryDate ?? '')
      || a.id - b.id);
};

// The batch list of the Outgoing form: [{ id, batchNumber, quantity, expiryDate, expiryStatus,
// manufacturerId }]. `quantity` is what can be issued (0 for an expired batch). With
// `manufacturerId`, that manufacturer's batches come first; the order is the service's, so the
// form never sorts. An archived item has none.
export const getItemBatchOptionsApi = async (itemId, { manufacturerId } = {}) => {
  const dtos = await request({
    delay: 100,
    api: () => http.get(`/inventory/${itemId}/batch-options`, { params: { manufacturerId: manufacturerId ?? undefined } }),
    mock: (db) => selectItemBatchOptions(db, itemId, manufacturerId ?? null),
  });
  return dtos.map((dto) => ({
    id: dto.id,
    batchNumber: dto.batchNumber,
    quantity: Number(dto.quantity) || 0,
    expiryDate: dto.expiryDate ?? null,
    expiryStatus: dto.expiryStatus ?? null,
    manufacturerId: dto.manufacturerId ?? null,
  }));
};

// Marks the transaction as cancelled (it is never deleted) and resolves with the updated record.
// Fails with 409 if it is already cancelled, or if it is an incoming transaction whose batch
// has stock issued from it.
export const cancelTransactionApi = async (id) => {
  const dto = await request({
    api: () => http.patch(`/transactions/${id}/cancel`),
    mock: (db) => cancelMock(db, id),
  });
  return mapTransaction(dto);
};
