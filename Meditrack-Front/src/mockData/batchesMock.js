import { isoDateFromNow } from './mockDates';

// One record per batch received. `id` is the unique internal identifier used by
// transactions (transaction.batchId); `batchNumber` is only the label shown to users.
// itemId -> inventoryMock.js, manufacturerId -> manufacturersMock.js (null = unknown).
// unitCost is the purchase price the batch was received at. manufacturingDate is always before
// the batch was received (null = unknown). The same values as the backend's DemoDataSeeder.
export const mockBatches = [
  // Older batches, fully consumed.
  { id: 1, itemId: 5, batchNumber: 'SY-501', unitCost: 3.2, supplier: 'MedEquip', expiryDate: isoDateFromNow(400), manufacturerId: 3, manufacturingDate: isoDateFromNow(-300) },
  { id: 2, itemId: 1, batchNumber: 'PC-090', unitCost: 11.5, supplier: 'PharmaCo', expiryDate: isoDateFromNow(200), manufacturerId: 1, manufacturingDate: isoDateFromNow(-500) },
  { id: 3, itemId: 6, batchNumber: 'CR-590', unitCost: 5.5, supplier: 'CareGoods', expiryDate: isoDateFromNow(250), manufacturerId: 5, manufacturingDate: null },
  { id: 4, itemId: 4, batchNumber: 'SS-390', unitCost: 4.2, supplier: 'BioLab', expiryDate: isoDateFromNow(120), manufacturerId: 4, manufacturingDate: isoDateFromNow(-400) },

  // Batches currently in stock. Paracetamol's two batches come from two manufacturers.
  { id: 5, itemId: 1, batchNumber: 'PC-101', unitCost: 12, supplier: 'PharmaCo', expiryDate: isoDateFromNow(430), manufacturerId: 1, manufacturingDate: isoDateFromNow(-300) },
  { id: 6, itemId: 1, batchNumber: 'PC-102', unitCost: 13.25, supplier: 'MedGlobal', expiryDate: isoDateFromNow(520), manufacturerId: 2, manufacturingDate: isoDateFromNow(-200) },
  { id: 7, itemId: 6, batchNumber: 'CR-601', unitCost: 6, supplier: 'CareGoods', expiryDate: isoDateFromNow(300), manufacturerId: 5, manufacturingDate: null },
  { id: 8, itemId: 3, batchNumber: 'SG-301', unitCost: 25, supplier: 'MedEquip', expiryDate: null, manufacturerId: 3, manufacturingDate: null },
  { id: 9, itemId: 2, batchNumber: 'AM-201', unitCost: 8.75, supplier: 'HealthCare', expiryDate: isoDateFromNow(12), manufacturerId: 2, manufacturingDate: isoDateFromNow(-700) },
  { id: 10, itemId: 4, batchNumber: 'SS-401', unitCost: 4.5, supplier: 'BioLab', expiryDate: isoDateFromNow(20), manufacturerId: 4, manufacturingDate: isoDateFromNow(-680) },
];
