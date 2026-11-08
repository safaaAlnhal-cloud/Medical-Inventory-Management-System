// Item master data only. Quantities, batches, average cost and expiry are derived from
// the transactions in transactionsMock.js, so there is a single source of truth for stock.
export const mockInventoryItems = [
  { id: 1, name: 'Paracetamol 500mg', categoryId: 1, unit: 'box', minQty: 20, archived: false, archivedAt: null },
  { id: 2, name: 'Amoxicillin 250mg', categoryId: 1, unit: 'box', minQty: 20, archived: false, archivedAt: null },
  { id: 3, name: 'Surgical Gloves', categoryId: 2, unit: 'box', minQty: 15, archived: false, archivedAt: null },
  { id: 4, name: 'Saline Solution 0.9%', categoryId: 3, unit: 'bottle', minQty: 30, archived: false, archivedAt: null },
  { id: 5, name: 'Syringes 5ml', categoryId: 2, unit: 'box', minQty: 50, archived: false, archivedAt: null },
  { id: 6, name: 'Cotton Rolls', categoryId: 2, unit: 'pack', minQty: 40, archived: false, archivedAt: null },
];
