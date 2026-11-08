import { ACCESS } from '../constants/users';
import { http } from './apiAxios';
import { ApiError, fieldError } from './apiError';
import { commit, nextId } from './mock/mockDb';
import { request } from './request';

// Frontend category model: { id, name }
const mapCategory = (dto) => ({ id: dto.id, name: dto.name });

const assertNameAvailable = (db, name, exceptId = null) => {
  const taken = db.categories.some((category) => category.id !== exceptId && category.name.toLowerCase() === name.toLowerCase());
  if (taken) throw fieldError('name', 'A category with this name already exists.', 409);
};

const requireName = (name) => {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw fieldError('name', 'Category name is required.');
  return trimmed;
};

const findCategory = (db, id) => {
  const category = db.categories.find((candidate) => candidate.id === id);
  if (!category) throw new ApiError('This category no longer exists.', { status: 404 });
  return category;
};

export const getCategoriesApi = async () => {
  const dtos = await request({
    api: () => http.get('/categories'),
    mock: (db) => db.categories,
  });
  return dtos.map(mapCategory);
};

export const createCategoryApi = async ({ name }) => {
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.post('/categories', { name }),
    mock: (db) => {
      const trimmed = requireName(name);
      assertNameAvailable(db, trimmed);
      const category = { id: nextId(db.categories), name: trimmed };
      db.categories.push(category);
      commit();
      return category;
    },
  });
  return mapCategory(dto);
};

export const updateCategoryApi = async (id, { name }) => {
  const dto = await request({
    access: ACCESS.ADMIN,
    api: () => http.put(`/categories/${id}`, { name }),
    mock: (db) => {
      const category = findCategory(db, id);
      const trimmed = requireName(name);
      assertNameAvailable(db, trimmed, id);
      category.name = trimmed;
      commit();
      return category;
    },
  });
  return mapCategory(dto);
};

// Resolves with nothing on success. Fails with 409 while any item still belongs to the
// category. Archived items count too: they keep their category for reports and for being
// restored, so no item is ever left pointing at a category that no longer exists.
export const deleteCategoryApi = async (id) => {
  await request({
    access: ACCESS.ADMIN,
    api: () => http.delete(`/categories/${id}`),
    mock: (db) => {
      findCategory(db, id);
      const users = db.items.filter((item) => item.categoryId === id);
      if (users.some((item) => !item.archived)) {
        throw new ApiError('Cannot delete this category because it is currently in use by inventory items.', { status: 409 });
      }
      if (users.length) {
        throw new ApiError('Cannot delete this category because deactivated items still belong to it.', { status: 409 });
      }
      db.categories = db.categories.filter((category) => category.id !== id);
      commit();
    },
  });
};
