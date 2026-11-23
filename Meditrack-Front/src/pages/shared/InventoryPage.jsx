import React, { useCallback, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Filter, Plus, FolderCog, Edit2, Trash2, History } from 'lucide-react';
import { ACTION_BUTTON_TONE, EditIcon, ViewIcon } from '../../components/common/ActionIcons';
import ArchiveHistoryModal from '../../components/inventory/ArchiveHistoryModal';
import BarcodeScanPanel from '../../components/inventory/BarcodeScanPanel';
import ItemDetailsModal from '../../components/inventory/ItemDetailsModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { TableState } from '../../components/common/DataState';
import FormField, { inputClassName } from '../../components/common/FormField';
import InlineAlert from '../../components/common/InlineAlert';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import { UNITS } from '../../constants/inventory';
import { ROLES } from '../../constants/users';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useToast } from '../../context/ToastContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCreateParam } from '../../hooks/useCreateParam';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getErrorMessage, getFieldErrors } from '../../services/apiError';
import { createCategoryApi, deleteCategoryApi, getCategoriesApi, updateCategoryApi } from '../../services/categoriesApi';
import {
  archiveInventoryItemApi,
  createInventoryItemApi,
  getArchivedInventoryItemsApi,
  getInventoryItemsApi,
  ITEM_DETAIL_LIMITS,
  restoreInventoryItemApi,
  updateInventoryItemApi,
} from '../../services/inventoryApi';
import { getManufacturersApi } from '../../services/manufacturersApi';
import { createDisposalTransactionApi } from '../../services/transactionsApi';
import { getUserDirectoryApi } from '../../services/usersApi';
import { toISODate } from '../../utils/dates';
import { EMPTY_VALUE, formatCurrency, formatDate, formatNumber, formatQuantity, formatUnit } from '../../utils/formatters';
import { resolveId, sameId } from '../../utils/ids';
import { STATUS_LABELS, STOCK_STATUS } from '../../utils/stock';

const EMPTY_LIST = [];
const DEFAULT_PAGE_SIZE = 10;
const VIEWS = { ACTIVE: 'active', ARCHIVED: 'archived' };
const STOCK_STATUS_OPTIONS = [STOCK_STATUS.AVAILABLE, STOCK_STATUS.LOW, STOCK_STATUS.OUT];
const STATUS_CLASSES = {
  [STOCK_STATUS.AVAILABLE]: 'text-emerald-700 bg-emerald-50',
  [STOCK_STATUS.LOW]: 'text-amber-700 bg-amber-50',
  [STOCK_STATUS.OUT]: 'text-red-700 bg-red-50',
};
// The six optional details in the item form: [field, label, placeholder, long text].
const DETAIL_FIELDS = [
  ['activeIngredient', 'Active Ingredient', 'e.g. Paracetamol', false],
  ['strength', 'Strength', 'e.g. 500 mg', false],
  ['dosageForm', 'Dosage Form', 'e.g. Tablet', false],
  ['storageConditions', 'Storage Conditions', 'e.g. Store below 25°C', false],
  ['uses', 'Uses', 'e.g. Pain and fever relief', true],
  ['description', 'Description', 'Anything else worth knowing', true],
];
const EMPTY_DETAILS = Object.fromEntries(DETAIL_FIELDS.map(([field]) => [field, '']));
const EMPTY_ITEM_FORM = { name: '', categoryId: '', unit: UNITS[0], minQty: '20', ...EMPTY_DETAILS };
const NO_ERRORS = {};

const InventoryPage = () => {
  const { role } = useAuth();
  const search = useSearchQuery();
  const { showSuccess, showError } = useToast();
  const { refreshUnreadCount } = useNotifications();

  // The page shows either the active inventory or the deactivated items; both come from services.
  // "Deactivated" is the wording users see for an archived item (item.archived / archivedAt).
  const [view, setView] = useState(VIEWS.ACTIVE);
  const isArchivedView = view === VIEWS.ARCHIVED;

  const loadItems = useCallback(
    () => (isArchivedView ? getArchivedInventoryItemsApi({ search }) : getInventoryItemsApi({ search })),
    [isArchivedView, search],
  );
  const { data: items, loading, error, reload: reloadItems } = useAsyncData(loadItems, EMPTY_LIST);
  const { data: categories, error: categoriesError, reload: reloadCategories } = useAsyncData(getCategoriesApi, EMPTY_LIST);
  // Names for the ids on items: who deactivated an item, and who made a batch or a barcode.
  const { data: manufacturers, reload: reloadManufacturers } = useAsyncData(getManufacturersApi, EMPTY_LIST);
  const { data: users } = useAsyncData(getUserDirectoryApi, EMPTY_LIST);
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showAllItems, setShowAllItems] = useState(false);

  // Item add / edit modal: null (closed), { item: null } (add) or { item } (edit).
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [itemError, setItemError] = useState('');
  const [itemFieldErrors, setItemFieldErrors] = useState(NO_ERRORS);
  const [savingItem, setSavingItem] = useState(false);

  // The Item Details modal: the item being viewed. Only the id is kept: the item itself is
  // always read from the loaded list, so the modal shows fresh figures and barcodes as soon as
  // the list is reloaded (for example after a disposal or a new barcode).
  const [viewingItemId, setViewingItemId] = useState(null);
  // The item whose deactivation history is open, or null.
  const [historyItem, setHistoryItem] = useState(null);

  // The expired batch whose disposal is being confirmed: { item, batch }, or null.
  const [batchToDispose, setBatchToDispose] = useState(null);
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState('');
  const [itemToArchive, setItemToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  // Deactivating needs a reason (1-500 characters); its own error shows under the text box.
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveReasonError, setArchiveReasonError] = useState('');
  const [restoringId, setRestoringId] = useState(null);

  // Category management modal (admin only).
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [confirmingCategoryId, setConfirmingCategoryId] = useState(null);
  const [categoryError, setCategoryError] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const defaultCategoryId = categories[0] ? String(categories[0].id) : '';
  const categoryLabel = (id) => categories.find((category) => sameId(category.id, id))?.name ?? EMPTY_VALUE;

  const switchView = (next) => {
    setView(next);
    setShowAllItems(false);
  };

  const openAddModal = useCallback(() => {
    setItemForm(EMPTY_ITEM_FORM);
    setItemError('');
    setItemFieldErrors(NO_ERRORS);
    setItemModal({ item: null });
  }, []);

  useCreateParam(openAddModal);

  const closeDetailsModal = () => setViewingItemId(null);
  const viewingItem = viewingItemId === null ? null : items.find((item) => sameId(item.id, viewingItemId)) ?? null;

  // A scanned barcode opens its item. A deactivated item is listed in the other view, so the
  // page switches to it first; the modal shows once that list has loaded.
  const handleScanFound = ({ item }) => {
    const view = item.archived ? VIEWS.ARCHIVED : VIEWS.ACTIVE;
    if (view !== (isArchivedView ? VIEWS.ARCHIVED : VIEWS.ACTIVE)) switchView(view);
    setSelectedCategory('all');
    setSelectedStatus('all');
    setViewingItemId(item.id);
  };

  // A barcode was added or removed in the details modal: a new manufacturer may exist too.
  const handleItemChanged = () => {
    reloadItems();
    reloadManufacturers();
  };

  // Disposing from a batch row removes everything that batch has left, today. The service
  // records it as an "Expired Stock Disposal" transaction and enforces every rule (the batch
  // must be expired, the quantity cannot exceed what is left); the page only asks and reports.
  // This is the only place a disposal is started; it then appears in the transaction history.
  const handleDisposeBatch = async () => {
    const { item, batch } = batchToDispose;
    setDisposing(true);
    setDisposeError('');
    try {
      await createDisposalTransactionApi({ itemId: item.id, batchId: batch.id, quantity: batch.expiredQuantity, date: toISODate() });
      setBatchToDispose(null);
      showSuccess(`Disposal of ${formatQuantity(batch.expiredQuantity, item.unit)} from batch ${batch.batchNumber} recorded.`);
      reloadItems();
      refreshUnreadCount();
    } catch (err) {
      setDisposeError(getErrorMessage(err, 'Could not record the disposal. Please try again.'));
    } finally {
      setDisposing(false);
    }
  };

  const openEditModal = (item) => {
    setItemForm({
      name: item.name, categoryId: String(item.categoryId), unit: item.unit, minQty: String(item.minQty),
      // A detail that is not set (null) shows as an empty box.
      ...Object.fromEntries(DETAIL_FIELDS.map(([field]) => [field, item[field] ?? ''])),
    });
    setItemError('');
    setItemFieldErrors(NO_ERRORS);
    setItemModal({ item });
  };

  // While a new view is loading, `items` still holds the other view's rows: they are not shown.
  const filteredItems = loading ? EMPTY_LIST : items.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || sameId(item.categoryId, selectedCategory);
    const matchesStatus = isArchivedView || selectedStatus === 'all' || item.status === selectedStatus;
    return matchesCategory && matchesStatus;
  });
  const displayedItems = showAllItems ? filteredItems : filteredItems.slice(0, DEFAULT_PAGE_SIZE);

  const handleSaveItem = async (e) => {
    e.preventDefault();
    const payload = {
      name: itemForm.name.trim(),
      categoryId: resolveId(categories, itemForm.categoryId || defaultCategoryId),
      unit: itemForm.unit,
      minQty: itemForm.minQty === '' ? null : Number(itemForm.minQty),
      // Always sent, so clearing a box clears the detail (an empty one is stored as "not set").
      ...Object.fromEntries(DETAIL_FIELDS.map(([field]) => [field, itemForm[field]])),
    };

    setSavingItem(true);
    setItemError('');
    setItemFieldErrors(NO_ERRORS);
    try {
      if (itemModal.item) {
        await updateInventoryItemApi(itemModal.item.id, payload);
        showSuccess('Item updated successfully.');
      } else {
        await createInventoryItemApi(payload);
        showSuccess('Item added successfully.');
        // A new item is an active item: make sure the list it appears in is the one on screen.
        if (isArchivedView) switchView(VIEWS.ACTIVE);
      }
      setItemModal(null);
      reloadItems();
      refreshUnreadCount();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setItemFieldErrors(fieldErrors);
      // A message that already sits under its field is not repeated above the form.
      setItemError(Object.keys(fieldErrors).length ? '' : getErrorMessage(err, 'Could not save the item. Please try again.'));
    } finally {
      setSavingItem(false);
    }
  };

  const handleArchiveItem = async () => {
    setArchiving(true);
    setArchiveError('');
    setArchiveReasonError('');
    try {
      await archiveInventoryItemApi(itemToArchive.id, { reason: archiveReason });
      showSuccess(`"${itemToArchive.name}" was deactivated. You can reactivate it from the Deactivated view.`);
      setItemToArchive(null);
      reloadItems();
      refreshUnreadCount();
    } catch (err) {
      const { reason } = getFieldErrors(err);
      // A reason error sits under the text box; any other error above the buttons.
      setArchiveReasonError(reason ?? '');
      setArchiveError(reason ? '' : getErrorMessage(err, 'Could not deactivate the item. Please try again.'));
    } finally {
      setArchiving(false);
    }
  };

  const handleRestoreItem = async (item) => {
    setRestoringId(item.id);
    try {
      await restoreInventoryItemApi(item.id);
      showSuccess(`"${item.name}" was reactivated and is back in the active inventory.`);
      reloadItems();
      refreshUnreadCount();
    } catch (err) {
      showError(getErrorMessage(err, 'Could not reactivate the item. Please try again.'));
    } finally {
      setRestoringId(null);
    }
  };

  const resetCategoryForm = () => {
    setCategoryName('');
    setEditingCategoryId(null);
    setConfirmingCategoryId(null);
    setCategoryError('');
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    resetCategoryForm();
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setCategoryError('Category name is required.');
      return;
    }

    setSavingCategory(true);
    setCategoryError('');
    try {
      if (editingCategoryId !== null) await updateCategoryApi(editingCategoryId, { name });
      else await createCategoryApi({ name });
      resetCategoryForm();
      reloadCategories();
    } catch (err) {
      setCategoryError(getErrorMessage(err, 'Could not save the category. Please try again.'));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    setCategoryError('');
    setSavingCategory(true);
    try {
      await deleteCategoryApi(category.id);
      if (sameId(category.id, selectedCategory)) setSelectedCategory('all');
      resetCategoryForm();
      reloadCategories();
    } catch (err) {
      setConfirmingCategoryId(null);
      setCategoryError(getErrorMessage(err, 'Could not delete the category. Please try again.'));
    } finally {
      setSavingCategory(false);
    }
  };

  const viewButtonClass = (active) => `px-6 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${active ? 'bg-[#115e54] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`;

  return (
    <>
      <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        <PageHeader
          title="Inventory"
          subtitle="Manage medications and track batch history."
          actions={(
            <>
              {role === ROLES.ADMIN && (
                <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer">
                  <FolderCog className="w-4 h-4" /> Manage Categories
                </button>
              )}
              <button type="button" onClick={openAddModal} className="px-4 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </>
          )}
        />

        {categoriesError && <InlineAlert>{categoriesError}</InlineAlert>}

        <div className="inline-flex bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm w-fit">
          <button type="button" aria-pressed={!isArchivedView} onClick={() => switchView(VIEWS.ACTIVE)} className={viewButtonClass(!isArchivedView)}>
            Active
          </button>
          <button type="button" aria-pressed={isArchivedView} onClick={() => switchView(VIEWS.ARCHIVED)} className={viewButtonClass(isArchivedView)}>
            Deactivated
          </button>
        </div>

        {/* Scan a box: its item's details open, in the Active or the Deactivated view. */}
        <BarcodeScanPanel manufacturers={manufacturers} allowArchived onFound={handleScanFound} />

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <select aria-label="Filter by category" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54] cursor-pointer">
              <option value="all">All Categories</option>
              {categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
            </select>
            <Filter className="absolute right-4 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            {/* Deactivated items hold no stock, so the stock status filter does not apply to them. */}
            <select aria-label="Filter by status" value={isArchivedView ? 'all' : selectedStatus} disabled={isArchivedView} title={isArchivedView ? 'Stock status does not apply to deactivated items' : undefined} onChange={(e) => setSelectedStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              <option value="all">All Status</option>
              {STOCK_STATUS_OPTIONS.map((status) => (<option key={status} value={status}>{STATUS_LABELS[status]}</option>))}
            </select>
            <Filter className="absolute right-4 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px] md:min-w-[750px]">
              <thead>
                {isArchivedView ? (
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-3 md:px-6">Item Name</th>
                    <th className="py-3.5 px-3 md:px-6">Category</th>
                    <th className="py-3.5 px-3 md:px-6">Unit</th>
                    <th className="py-3.5 px-3 md:px-6">Last Avg. Price</th>
                    <th className="py-3.5 px-3 md:px-6">Deactivated On</th>
                    <th className="py-3.5 px-3 md:px-6">Reason</th>
                    <th className="py-3.5 px-3 md:px-6 text-center">Actions</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-3 md:px-6">Item Name</th>
                    <th className="py-3.5 px-3 md:px-6">Category</th>
                    <th className="py-3.5 px-3 md:px-6" title="Stock that is valid and can be issued">Available Qty</th>
                    <th className="py-3.5 px-3 md:px-6">Unit</th>
                    <th className="py-3.5 px-3 md:px-6">Avg. Price</th>
                    <th className="py-3.5 px-3 md:px-6" title="The next date available stock expires">Next Expiry</th>
                    <th className="py-3.5 px-3 md:px-6">Status</th>
                    <th className="py-3.5 px-3 md:px-6 text-center">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                <TableState
                  colSpan={isArchivedView ? 7 : 8}
                  loading={loading}
                  error={error}
                  onRetry={reloadItems}
                  empty={displayedItems.length === 0}
                  loadingMessage={isArchivedView ? 'Loading deactivated items...' : 'Loading inventory data...'}
                  emptyMessage={isArchivedView ? (search || selectedCategory !== 'all' ? 'No deactivated items match your filter criteria.' : 'No items have been deactivated.') : 'No items match your filter criteria.'}
                >
                  {displayedItems.map((item) => (isArchivedView ? (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-3 md:px-6 font-bold text-slate-900">{item.name}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-600">{categoryLabel(item.categoryId)}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-600">{formatUnit(item.unit)}</td>
                      <td className="py-4 px-3 md:px-6 font-bold text-emerald-700">{formatCurrency(item.avgUnitCost)}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-500">{formatDate(item.archivedAt)}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-600 max-w-56">
                        {/* Why, and by whom. An item deactivated before reasons existed has none. */}
                        <span className="block line-clamp-2 break-words" title={item.archiveReason ?? undefined}>{item.archiveReason ?? EMPTY_VALUE}</span>
                        {item.archivedBy !== null && <span className="block text-[10px] font-bold text-slate-400">by {userNames.get(item.archivedBy) ?? EMPTY_VALUE}</span>}
                      </td>
                      <td className="py-4 px-3 md:px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => setViewingItemId(item.id)} className={`p-1.5 rounded-lg ${ACTION_BUTTON_TONE} transition cursor-pointer`} title="View Details" aria-label={`View details of ${item.name}`}>
                            <ViewIcon />
                          </button>
                          {item.archiveHistoryCount > 0 && (
                            <button type="button" onClick={() => setHistoryItem(item)} className={`p-1.5 rounded-lg ${ACTION_BUTTON_TONE} transition cursor-pointer`} title="Deactivation History" aria-label={`Deactivation history of ${item.name}`}>
                              <History className="w-4 h-4" />
                            </button>
                          )}
                          <button type="button" disabled={restoringId !== null} onClick={() => handleRestoreItem(item)} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed" aria-label={`Reactivate ${item.name}`}>
                            <ArchiveRestore className="w-4 h-4" /> {sameId(restoringId, item.id) ? 'Reactivating...' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-3 md:px-6 font-bold text-slate-900">{item.name}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-600">{categoryLabel(item.categoryId)}</td>
                      <td className="py-4 px-3 md:px-6 font-bold text-slate-900">
                        {/* Available stock. Expired stock is not part of it and is named apart. */}
                        {formatNumber(item.quantity)}
                        {item.expiredQuantity > 0 && <span className="block text-[10px] font-bold text-red-600 whitespace-nowrap">Expired: {formatQuantity(item.expiredQuantity, item.unit)}</span>}
                      </td>
                      <td className="py-4 px-3 md:px-6 text-slate-600">{formatUnit(item.unit)}</td>
                      <td className="py-4 px-3 md:px-6 font-bold text-emerald-700">{formatCurrency(item.avgUnitCost)}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-500">{formatDate(item.nearestExpiryDate)}</td>
                      <td className="py-4 px-3 md:px-6"><span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${STATUS_CLASSES[item.status]}`}>{STATUS_LABELS[item.status]}</span></td>
                      <td className="py-4 px-3 md:px-6">
                        <div className="flex items-center justify-center gap-2 text-xs font-bold">
                          <button type="button" onClick={() => setViewingItemId(item.id)} className={`p-1.5 rounded-lg ${ACTION_BUTTON_TONE} transition cursor-pointer`} title="View Details" aria-label={`View details of ${item.name}`}>
                            <ViewIcon />
                          </button>
                          <button type="button" onClick={() => openEditModal(item)} className={`p-1.5 rounded-lg ${ACTION_BUTTON_TONE} transition cursor-pointer`} title="Edit Item" aria-label={`Edit ${item.name}`}>
                            <EditIcon />
                          </button>
                          <button type="button" onClick={() => { setArchiveError(''); setArchiveReason(''); setArchiveReasonError(''); setItemToArchive(item); }} className={`p-1.5 rounded-lg ${ACTION_BUTTON_TONE} transition cursor-pointer`} title="Deactivate Item" aria-label={`Deactivate ${item.name}`}>
                            <Archive className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </TableState>
              </tbody>
            </table>
          </div>

          {!loading && filteredItems.length > DEFAULT_PAGE_SIZE && (
            <div className="p-4 bg-slate-50/60 border-t border-slate-100 flex justify-center">
              <button type="button" onClick={() => setShowAllItems((prev) => !prev)} className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl shadow-sm transition cursor-pointer flex items-center gap-2">
                {showAllItems ? 'Show Less' : `View All (${filteredItems.length} items)`}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Hidden while a disposal is being confirmed or the history is open, so only one dialog shows at a time. */}
      {viewingItem && !batchToDispose && !historyItem && (
        <ItemDetailsModal
          item={viewingItem}
          categoryName={categoryLabel(viewingItem.categoryId)}
          manufacturers={manufacturers}
          onClose={closeDetailsModal}
          onDispose={(batch) => { setDisposeError(''); setBatchToDispose({ item: viewingItem, batch }); }}
          onShowHistory={() => setHistoryItem(viewingItem)}
          onChanged={handleItemChanged}
        />
      )}

      {historyItem && <ArchiveHistoryModal item={historyItem} userNames={userNames} onClose={() => setHistoryItem(null)} />}

      {isCategoryModalOpen && role === ROLES.ADMIN && (
        <Modal title="Manage Categories" titleClassName="text-base font-bold text-slate-900 font-noto-serif" onClose={closeCategoryModal}>
          {categoryError && <InlineAlert>{categoryError}</InlineAlert>}
          <form onSubmit={handleSaveCategory} className="flex gap-2">
            <input type="text" aria-label="Category name" placeholder="Enter category name..." value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54]" />
            <button type="submit" disabled={savingCategory} className="px-4 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">{editingCategoryId !== null ? 'Update' : 'Add'}</button>
          </form>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Existing Categories</span>
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="min-w-0 break-words">{category.name}</span>
                {/* Deleting asks once more in place, so one stray click cannot remove a category. */}
                {sameId(confirmingCategoryId, category.id) ? (
                  <div className="flex items-center gap-2 text-[11px] font-bold shrink-0">
                    <span className="text-slate-500">Delete?</span>
                    <button type="button" disabled={savingCategory} onClick={() => handleDeleteCategory(category)} className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg cursor-pointer transition disabled:opacity-50">Delete</button>
                    <button type="button" onClick={() => setConfirmingCategoryId(null)} className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer transition">Keep</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" aria-label={`Rename ${category.name}`} onClick={() => { setCategoryName(category.name); setEditingCategoryId(category.id); setConfirmingCategoryId(null); setCategoryError(''); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg cursor-pointer transition"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label={`Delete ${category.name}`} onClick={() => { setConfirmingCategoryId(category.id); setCategoryError(''); }} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {itemModal && (
        <Modal title={itemModal.item ? 'Edit Item' : 'Add New Item'} titleClassName="text-base font-bold text-slate-900 font-noto-serif" maxWidth="max-w-lg" onClose={() => setItemModal(null)}>
          <form onSubmit={handleSaveItem} className="space-y-4">
            {itemError && <InlineAlert>{itemError}</InlineAlert>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Item Name" required error={itemFieldErrors.name}>
                <input type="text" required placeholder="e.g. Paracetamol 500mg" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className={inputClassName} />
              </FormField>
              <FormField label="Category" required error={itemFieldErrors.categoryId}>
                <select required value={itemForm.categoryId || defaultCategoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} className={inputClassName}>
                  {categories.length === 0 && <option value="">No categories yet</option>}
                  {categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
                </select>
              </FormField>
              <FormField label="Unit" required error={itemFieldErrors.unit}>
                <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className={inputClassName}>
                  {UNITS.map((unit) => (<option key={unit} value={unit}>{formatUnit(unit)}</option>))}
                </select>
              </FormField>
              <FormField label="Min Quantity (Alert)" required error={itemFieldErrors.minQty}>
                <input type="number" min="0" step="1" required value={itemForm.minQty} onChange={(e) => setItemForm({ ...itemForm, minQty: e.target.value })} className={inputClassName} />
              </FormField>
            </div>
            {/* Optional, because the inventory also holds supplies (gloves, cotton), not only medicines. */}
            <details className="group" open={DETAIL_FIELDS.some(([field]) => itemForm[field])}>
              <summary className="text-[11px] font-bold text-[#115e54] uppercase cursor-pointer select-none">Item details (optional)</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                {DETAIL_FIELDS.map(([field, label, placeholder, long]) => (
                  <div key={field} className={long ? 'sm:col-span-2' : ''}>
                    <FormField label={label} optional error={itemFieldErrors[field]}>
                      {long ? (
                        <textarea rows={2} maxLength={ITEM_DETAIL_LIMITS[field]} placeholder={placeholder} value={itemForm[field]} onChange={(e) => setItemForm({ ...itemForm, [field]: e.target.value })} className={`${inputClassName} resize-none`} />
                      ) : (
                        <input type="text" maxLength={ITEM_DETAIL_LIMITS[field]} placeholder={placeholder} value={itemForm[field]} onChange={(e) => setItemForm({ ...itemForm, [field]: e.target.value })} className={inputClassName} />
                      )}
                    </FormField>
                  </div>
                ))}
              </div>
            </details>
            <div className="pt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setItemModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">Cancel</button>
              <button type="submit" disabled={savingItem} className="px-5 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">{itemModal.item ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </form>
        </Modal>
      )}

      {batchToDispose && (
        <ConfirmDialog
          title="Dispose Expired Batch"
          message={`Dispose of ${formatQuantity(batchToDispose.batch.expiredQuantity, batchToDispose.item.unit)} of "${batchToDispose.item.name}" from batch ${batchToDispose.batch.batchNumber}, which expired on ${formatDate(batchToDispose.batch.expiryDate)}? This records an Expired Stock Disposal transaction dated today and removes the whole remaining quantity of this batch. Other batches are not affected.`}
          error={disposeError}
          confirmLabel={disposing ? 'Recording...' : 'Dispose'}
          busy={disposing}
          onConfirm={handleDisposeBatch}
          onCancel={() => setBatchToDispose(null)}
        />
      )}

      {itemToArchive && (
        <ConfirmDialog
          title="Deactivate Item"
          message={`"${itemToArchive.name}" will be deactivated, not permanently deleted. It leaves the active inventory and the item lists for new transactions, while its transactions, batches and report history are all kept. You can reactivate it at any time from the Deactivated view.`}
          error={archiveError}
          confirmLabel="Deactivate Item"
          busy={archiving}
          onConfirm={handleArchiveItem}
          onCancel={() => setItemToArchive(null)}
        >
          <FormField label="Reason" required error={archiveReasonError}>
            <textarea
              rows={3}
              maxLength={500}
              placeholder="e.g. Discontinued by the supplier"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className={`${inputClassName} resize-none`}
            />
          </FormField>
        </ConfirmDialog>
      )}
    </>
  );
};

export default InventoryPage;
