import { http } from './apiAxios';
import { fieldError } from './apiError';
import { matchesSearch } from './mock/mockDb';
import { request } from './request';

// Frontend manufacturer model: { id, name }
const mapManufacturer = (dto) => ({ id: dto.id, name: dto.name });

// A manufacturer name is at most 150 characters, so the backend refuses a longer search (422).
const MAX_SEARCH_LENGTH = 150;

// Every manufacturer, alphabetical. With `search`: only the names that contain it (case and
// surrounding spaces ignored), for the manufacturer autocomplete in the Incoming form.
export const getManufacturersApi = async ({ search = '' } = {}) => {
  const dtos = await request({
    api: () => http.get('/manufacturers', { params: { search: search || undefined } }),
    mock: (db) => {
      if (String(search).trim().length > MAX_SEARCH_LENGTH) {
        throw fieldError('search', `The search may not be longer than ${MAX_SEARCH_LENGTH} characters.`);
      }
      return db.manufacturers
        .filter((manufacturer) => matchesSearch([manufacturer.name], search))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  return dtos.map(mapManufacturer);
};
