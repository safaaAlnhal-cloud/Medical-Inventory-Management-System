import { useCallback, useMemo } from 'react';
import { getCategoriesApi } from '../services/categoriesApi';
import { getBatchLookupApi, getInventoryLookupApi } from '../services/inventoryApi';
import { getUserDirectoryApi } from '../services/usersApi';
import { EMPTY_VALUE } from '../utils/formatters';
import { useAsyncData } from './useAsyncData';

const EMPTY_LIST = [];
const toMap = (rows) => new Map(rows.map((row) => [row.id, row]));

// Data models reference other entities by id (itemId, categoryId, batchId, recordedBy).
// This hook loads the small lookup lists and resolves those ids to display names.
export const useLookups = () => {
  const { data: items, reload: reloadItems } = useAsyncData(getInventoryLookupApi, EMPTY_LIST);
  const { data: categories, reload: reloadCategories } = useAsyncData(getCategoriesApi, EMPTY_LIST);
  const { data: users, reload: reloadUsers } = useAsyncData(getUserDirectoryApi, EMPTY_LIST);
  const { data: batches, reload: reloadBatches } = useAsyncData(getBatchLookupApi, EMPTY_LIST);

  const itemsById = useMemo(() => toMap(items), [items]);
  const categoriesById = useMemo(() => toMap(categories), [categories]);
  const usersById = useMemo(() => toMap(users), [users]);
  const batchesById = useMemo(() => toMap(batches), [batches]);

  const itemName = useCallback((id) => itemsById.get(id)?.name ?? EMPTY_VALUE, [itemsById]);
  const itemUnit = useCallback((id) => itemsById.get(id)?.unit ?? null, [itemsById]);
  const categoryName = useCallback((id) => categoriesById.get(id)?.name ?? EMPTY_VALUE, [categoriesById]);
  const userName = useCallback((id) => usersById.get(id)?.name ?? EMPTY_VALUE, [usersById]);
  const batchNumber = useCallback((id) => batchesById.get(id)?.batchNumber ?? EMPTY_VALUE, [batchesById]);

  const reloadLookups = useCallback(() => {
    reloadItems();
    reloadCategories();
    reloadUsers();
    reloadBatches();
  }, [reloadItems, reloadCategories, reloadUsers, reloadBatches]);

  return { items, categories, itemName, itemUnit, categoryName, userName, batchNumber, reloadLookups };
};
