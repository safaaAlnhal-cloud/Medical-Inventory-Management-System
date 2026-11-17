// Factory barcodes: the same codes, items and manufacturers as the backend's DemoDataSeeder
// (seedBarcodes), so a scan finds the same item in mock mode and with the real API.
// itemId -> inventoryMock.js, manufacturerId -> manufacturersMock.js.
// Paracetamol (item 1) is made by two manufacturers, so it has two barcodes.
export const mockItemBarcodes = [
  { id: 1, itemId: 1, manufacturerId: 1, barcode: '6291100100011' },
  { id: 2, itemId: 1, manufacturerId: 2, barcode: '6291100200018' },
  { id: 3, itemId: 2, manufacturerId: 2, barcode: '6291100200025' },
  { id: 4, itemId: 3, manufacturerId: 3, barcode: '6291100300015' },
  { id: 5, itemId: 4, manufacturerId: 4, barcode: '6291100400012' },
  { id: 6, itemId: 5, manufacturerId: 3, barcode: '6291100300022' },
];
