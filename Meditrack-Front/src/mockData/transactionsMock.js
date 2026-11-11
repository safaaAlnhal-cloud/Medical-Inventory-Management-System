import { toISODate } from '../utils/dates';
import { mockBatches } from './batchesMock';
import { daysAgo, minutesAgo } from './mockDates';

const stamp = (when) => ({ date: toISODate(when), createdAt: when.toISOString(), status: 'active', cancelledAt: null, cancelledBy: null });
const batchById = (batchId) => mockBatches.find((batch) => batch.id === batchId);

// Receiving a batch. The item, purchase price, supplier, dates and manufacturer come from the
// batch record.
const incoming = (id, when, batchId, quantity, recordedBy) => {
  const batch = batchById(batchId);
  return {
    id, type: 'incoming', itemId: batch.itemId, batchId, quantity, unitCost: batch.unitCost, supplier: batch.supplier,
    expiryDate: batch.expiryDate, manufacturerId: batch.manufacturerId, manufacturingDate: batch.manufacturingDate, recordedBy, ...stamp(when),
  };
};

// Issuing from a batch. unitCost is the item's Average Cost at the time it was recorded.
// It is stored, not recalculated, so later price changes do not rewrite history.
const outgoing = (id, when, batchId, quantity, unitCost, recipient, recordedBy) =>
  ({ id, type: 'outgoing', itemId: batchById(batchId).itemId, batchId, quantity, unitCost, recipient, recordedBy, ...stamp(when) });

// batchId -> batchesMock.js, recordedBy -> usersMock.js.
// Current stock after replaying these: Paracetamol 500, Amoxicillin 15, Gloves 8,
// Saline 120, Syringes 0, Cotton Rolls 300.
export const mockTransactions = [
  // Older batches, fully consumed (they feed the 6-month stock movement chart).
  incoming(1, daysAgo(150, 9, 30), 1, 180, 1),
  outgoing(2, daysAgo(140, 11, 0), 1, 70, 3.2, 'Emergency Department', 2),
  incoming(3, daysAgo(120, 10, 15), 2, 220, 1),
  outgoing(4, daysAgo(110, 14, 0), 2, 120, 11.5, 'Outpatient Clinic', 2),
  outgoing(5, daysAgo(95, 9, 45), 1, 60, 3.2, 'Surgery Ward', 3),
  incoming(6, daysAgo(90, 13, 20), 3, 200, 5),
  outgoing(7, daysAgo(75, 10, 30), 3, 200, 5.5, 'Emergency Department', 2),
  outgoing(8, daysAgo(70, 15, 10), 2, 100, 11.5, 'Pediatrics Ward', 3),
  incoming(9, daysAgo(60, 9, 0), 4, 240, 1),
  outgoing(10, daysAgo(50, 12, 40), 4, 130, 4.2, 'Surgery Ward', 2),
  outgoing(11, daysAgo(45, 11, 25), 1, 50, 3.2, 'Outpatient Clinic', 5),
  outgoing(12, daysAgo(35, 16, 0), 4, 110, 4.2, 'Emergency Department', 2),

  // Batches currently in stock.
  incoming(13, daysAgo(40, 10, 0), 5, 300, 1),
  incoming(14, daysAgo(20, 11, 30), 6, 200, 1),
  incoming(15, daysAgo(12, 9, 15), 7, 300, 3),
  incoming(16, daysAgo(10, 14, 45), 8, 20, 5),
  incoming(17, daysAgo(7, 10, 20), 9, 25, 1),
  incoming(18, daysAgo(6, 9, 40), 10, 135, 1),
  outgoing(19, daysAgo(4, 13, 5), 10, 15, 4.5, 'Surgery Ward', 2),
  outgoing(20, daysAgo(1, 11, 5), 9, 10, 8.75, 'Outpatient Clinic', 2),
  outgoing(21, minutesAgo(95), 8, 12, 25, 'Emergency Department', 2),
];
