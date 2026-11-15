import { fieldError } from '../apiError';
import { nextId } from './mockDb';

// MOCK ONLY. The same manufacturer matching as the backend's ManufacturerService::resolve(), for
// the barcode link (transactionsApi.js has its own copy for the Incoming form).
// Letter case, spaces and punctuation are ignored: "PharmaCo", "pharmaco" and "Pharma Co." are
// one manufacturer, kept under the spelling first entered.
const normalizeName = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const MAX_NAME_LENGTH = 150;

// The manufacturer named `value` (required): an existing one, or a new one added to db.
// Call it only once every other rule has passed, so a refused request adds nothing.
export const resolveManufacturer = (db, value) => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw fieldError('manufacturer', 'Enter the manufacturer of this barcode.');
  if (name.length > MAX_NAME_LENGTH) throw fieldError('manufacturer', `Manufacturer may not be longer than ${MAX_NAME_LENGTH} characters.`);
  const normalized = normalizeName(name);
  if (!normalized) throw fieldError('manufacturer', 'Enter a manufacturer name with letters or numbers.');

  const existing = db.manufacturers.find((manufacturer) => normalizeName(manufacturer.name) === normalized);
  if (existing) return existing;
  const created = { id: nextId(db.manufacturers), name };
  db.manufacturers.push(created);
  return created;
};
