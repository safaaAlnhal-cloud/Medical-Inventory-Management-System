// Item master data only. Quantities, batches, average cost and expiry are derived from
// the transactions in transactionsMock.js, so there is a single source of truth for stock.
// The optional details are the same as the backend's DemoDataSeeder: medicines have most of
// them, supplies only some or none (a missing detail is shown as empty).
export const mockInventoryItems = [
  {
    id: 1, name: 'Paracetamol 500mg', categoryId: 1, unit: 'box', minQty: 20, archived: false, archivedAt: null,
    activeIngredient: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet',
    storageConditions: 'Store below 25°C in a dry place', uses: 'Relief of mild to moderate pain and fever',
    description: '20 tablets per box',
  },
  {
    id: 2, name: 'Amoxicillin 250mg', categoryId: 1, unit: 'box', minQty: 20, archived: false, archivedAt: null,
    activeIngredient: 'Amoxicillin', strength: '250 mg', dosageForm: 'Capsule',
    storageConditions: 'Store below 25°C', uses: 'Treatment of bacterial infections',
    description: '16 capsules per box',
  },
  {
    id: 3, name: 'Surgical Gloves', categoryId: 2, unit: 'box', minQty: 15, archived: false, archivedAt: null,
    storageConditions: 'Keep away from heat and sunlight', description: 'Latex, size M, 100 gloves per box',
  },
  {
    id: 4, name: 'Saline Solution 0.9%', categoryId: 3, unit: 'bottle', minQty: 30, archived: false, archivedAt: null,
    activeIngredient: 'Sodium chloride', strength: '0.9%', dosageForm: 'Solution for infusion',
    storageConditions: 'Store below 30°C, do not freeze', uses: 'Fluid and electrolyte replacement',
    description: '500 ml bottle',
  },
  {
    id: 5, name: 'Syringes 5ml', categoryId: 2, unit: 'box', minQty: 50, archived: false, archivedAt: null,
    description: 'Sterile, single use, 100 syringes per box',
  },
  { id: 6, name: 'Cotton Rolls', categoryId: 2, unit: 'pack', minQty: 40, archived: false, archivedAt: null },
];
