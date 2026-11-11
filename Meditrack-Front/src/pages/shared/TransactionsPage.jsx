import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Filter, Calendar, ChevronDown, RotateCcw } from 'lucide-react';
import { ACTION_BUTTON_TONE, DeleteIcon, EditIcon } from '../../components/common/ActionIcons';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { TableState } from '../../components/common/DataState';
import { FieldError } from '../../components/common/FormField';
import InlineAlert from '../../components/common/InlineAlert';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import { OUTGOING_REASON_LABELS, OUTGOING_REASONS, TRANSACTION_STATUS, TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from '../../constants/inventory';
import { useNotifications } from '../../context/NotificationsContext';
import { useToast } from '../../context/ToastContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCreateParam } from '../../hooks/useCreateParam';
import { useLookups } from '../../hooks/useLookups';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getErrorMessage, getFieldErrors } from '../../services/apiError';
import { getInventoryItemsApi } from '../../services/inventoryApi';
import { getManufacturersApi } from '../../services/manufacturersApi';
import {
  cancelTransactionApi,
  createIncomingTransactionApi,
  createOutgoingTransactionApi,
  getIncomingTransactionsApi,
  getOutgoingTransactionsApi,
  getTransactionBatchOptionsApi,
  updateTransactionApi,
} from '../../services/transactionsApi';
import { toISODate } from '../../utils/dates';
import { CURRENCY_SYMBOL, EMPTY_VALUE, formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/formatters';
import { resolveId, sameId } from '../../utils/ids';
import { EXPIRY_STATUS } from '../../utils/stock';

const { INCOMING, OUTGOING } = TRANSACTION_TYPES;
const ADD_TYPES = [INCOMING, OUTGOING];
const EMPTY_LIST = [];
const NO_ERRORS = {};
const DEFAULT_PAGE_SIZE = 8;

const newIncomingForm = () => ({
  itemId: '', quantity: '', unitCost: '', date: toISODate(), expiryDate: '', batchNumber: '', supplier: '', manufacturer: '', manufacturingDate: '',
});
const newOutgoingForm = () => ({ itemId: '', quantity: '', batchId: '', date: toISODate(), recipient: '' });
const isExpired = (batch) => batch.expiryStatus === EXPIRY_STATUS.EXPIRED;

// The edit form holds the fields of both types, so the type itself can be changed.
// The manufacturer is edited by name, like on create.
const newEditForm = (transaction, batchNumber, manufacturerName) => {
  const isIncoming = transaction.type === INCOMING;
  return {
    type: transaction.type,
    itemId: String(transaction.itemId),
    quantity: String(transaction.quantity),
    date: transaction.date,
    unitCost: isIncoming && transaction.unitCost != null ? String(transaction.unitCost) : '',
    expiryDate: transaction.expiryDate || '',
    batchNumber: isIncoming ? batchNumber : '',
    supplier: transaction.supplier || '',
    manufacturer: manufacturerName || '',
    manufacturingDate: transaction.manufacturingDate || '',
    batchId: isIncoming ? '' : String(transaction.batchId),
    recipient: transaction.recipient || '',
  };
};

// Number inputs hold text. An empty input is sent as null, so the service reports the field
// as missing instead of receiving a 0 it would have to guess about.
const toNumber = (text) => (String(text).trim() === '' ? null : Number(text));

const loadNoBatches = () => Promise.resolve(EMPTY_LIST);

const STATUS_CLASSES = {
  [TRANSACTION_STATUS.ACTIVE]: 'text-emerald-700 bg-emerald-50',
  [TRANSACTION_STATUS.CANCELLED]: 'text-red-700 bg-red-50',
};
const actionButtonClass = 'p-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

const fieldLabelClass = 'font-bold text-slate-600 mb-1 block';
const fieldInputClass = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold text-slate-700 focus:outline-none';

const EXPIRY_OPTION_NOTES = { [EXPIRY_STATUS.EXPIRING_SOON]: ', expiring soon' };

// Marks a field the form cannot be saved without.
const Required = () => <span className="text-red-500" aria-hidden="true"> *</span>;
const Optional = () => <span className="font-semibold text-slate-400"> (optional)</span>;

// The fields of an incoming / outgoing transaction, shared by the "add" and "edit" modals.
// `form` holds the input values as strings; `onChange` receives the fields that changed;
// `errors` holds the service's message for each rejected field.
// `manufacturers` ([{ id, name }]) are suggested as the user types: a native <datalist>, so any
// other name can still be typed, and the service creates that manufacturer.
const IncomingFields = ({ form, onChange, items, manufacturers = EMPTY_LIST, errors = NO_ERRORS }) => {
  const manufacturerListId = useId();
  return (
  <>
    <label className="block">
      <span className={fieldLabelClass}>Item Name<Required /></span>
      <select required value={form.itemId} onChange={(e) => onChange({ itemId: e.target.value })} className={`${fieldInputClass} cursor-pointer`}>
        <option value="">Select Item from Inventory</option>
        {items.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
      </select>
      <FieldError message={errors.itemId} />
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className={fieldLabelClass}>Quantity<Required /></span>
        <input type="number" min="1" step="1" required placeholder="100" value={form.quantity} onChange={(e) => onChange({ quantity: e.target.value })} className={fieldInputClass} />
        <FieldError message={errors.quantity} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Unit Cost ({CURRENCY_SYMBOL})<Required /></span>
        <input type="number" min="0" step="0.01" required placeholder="2.00" value={form.unitCost} onChange={(e) => onChange({ unitCost: e.target.value })} className={fieldInputClass} />
        <FieldError message={errors.unitCost} />
      </label>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className={fieldLabelClass}>Transaction Date<Required /></span>
        <input type="date" required value={form.date} onChange={(e) => onChange({ date: e.target.value })} className={`${fieldInputClass} cursor-pointer`} />
        <FieldError message={errors.date} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Expiry Date<Optional /></span>
        <input type="date" value={form.expiryDate} onChange={(e) => onChange({ expiryDate: e.target.value })} className={`${fieldInputClass} cursor-pointer`} />
        <FieldError message={errors.expiryDate} />
      </label>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className={fieldLabelClass}>Batch Number<Required /></span>
        <input type="text" required maxLength={100} placeholder="MS-2025-01" value={form.batchNumber} onChange={(e) => onChange({ batchNumber: e.target.value })} className={fieldInputClass} />
        <FieldError message={errors.batchNumber} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Supplier<Optional /></span>
        <input type="text" maxLength={150} placeholder="e.g. MedSupply" value={form.supplier} onChange={(e) => onChange({ supplier: e.target.value })} className={fieldInputClass} />
        <FieldError message={errors.supplier} />
      </label>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className={fieldLabelClass}>Manufacturer<Optional /></span>
        <input type="text" maxLength={150} list={manufacturerListId} autoComplete="off" placeholder="e.g. Nova Pharma" value={form.manufacturer} onChange={(e) => onChange({ manufacturer: e.target.value })} className={fieldInputClass} />
        <datalist id={manufacturerListId}>
          {manufacturers.map((manufacturer) => (<option key={manufacturer.id} value={manufacturer.name} />))}
        </datalist>
        <FieldError message={errors.manufacturer} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Manufacturing Date<Optional /></span>
        <input type="date" max={form.date || undefined} value={form.manufacturingDate} onChange={(e) => onChange({ manufacturingDate: e.target.value })} className={`${fieldInputClass} cursor-pointer`} />
        <FieldError message={errors.manufacturingDate} />
      </label>
    </div>
  </>
  );
};

// `batches` are the item's batches with stock: [{ id, batchNumber, quantity, expiryDate, expiryStatus }].
// An expired batch is listed but cannot be chosen: expired stock is never issued, only disposed
// of. `keepBatchId` is the batch an edited transaction already uses; it stays selectable so an
// issue recorded before its batch expired can still have its other details corrected.
const OutgoingFields = ({ form, onChange, items, batches, batchesLoading = false, errors = NO_ERRORS, keepBatchId = null }) => {
  const canIssueFrom = (batch) => !isExpired(batch) || sameId(batch.id, keepBatchId);
  const hasBlockedBatch = batches.some((batch) => !canIssueFrom(batch));
  const hasUsableBatch = batches.some(canIssueFrom);
  return (
    <>
      <label className="block">
        <span className={fieldLabelClass}>Item Name</span>
        <select required value={form.itemId} onChange={(e) => onChange({ itemId: e.target.value, batchId: '' })} className={`${fieldInputClass} cursor-pointer`}>
          <option value="">Select Item from Inventory</option>
          {items.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
        </select>
        <FieldError message={errors.itemId} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={fieldLabelClass}>Quantity</span>
          <input type="number" min="1" step="1" required placeholder="30" value={form.quantity} onChange={(e) => onChange({ quantity: e.target.value })} className={fieldInputClass} />
          <FieldError message={errors.quantity} />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Batch No.</span>
          <select required value={form.batchId} onChange={(e) => onChange({ batchId: e.target.value })} className={`${fieldInputClass} cursor-pointer`}>
            <option value="">{!form.itemId ? 'Select an item first' : batchesLoading ? 'Loading batches...' : hasUsableBatch ? 'Select batch' : 'No stock available'}</option>
            {batches.map((batch) => (canIssueFrom(batch) ? (
              <option key={batch.id} value={batch.id}>{batch.batchNumber} ({formatNumber(batch.quantity)} available{EXPIRY_OPTION_NOTES[batch.expiryStatus] || ''})</option>
            ) : (
              <option key={batch.id} value={batch.id} disabled>{batch.batchNumber} (expired {formatDate(batch.expiryDate)}, cannot be issued)</option>
            )))}
          </select>
          <FieldError message={errors.batchId} />
        </label>
      </div>
      {/* Says why a listed batch is greyed out and what to do with it instead. */}
      {hasBlockedBatch && (
        <div role="note" className="p-3 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          Expired batches cannot be issued. Dispose of them from the Inventory page, in the item's batch details.
        </div>
      )}
      <label className="block">
        <span className={fieldLabelClass}>Date</span>
        <input type="date" required value={form.date} onChange={(e) => onChange({ date: e.target.value })} className={`${fieldInputClass} cursor-pointer`} />
        <FieldError message={errors.date} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Recipient / Department</span>
        <input type="text" required placeholder="e.g. Emergency Dept" value={form.recipient} onChange={(e) => onChange({ recipient: e.target.value })} className={fieldInputClass} />
        <FieldError message={errors.recipient} />
      </label>
    </>
  );
};

const TransactionsPage = () => {
  const search = useSearchQuery();
  const { showSuccess } = useToast();
  const { refreshUnreadCount } = useNotifications();
  const { items: lookupItems, itemName, userName, batchNumber, reloadLookups } = useLookups();

  const [activeTab, setActiveTab] = useState(INCOMING);
  const [selectedItemId, setSelectedItemId] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef(null);

  // Which "add" modal is open: null, 'incoming' or 'outgoing'.
  const [openModal, setOpenModal] = useState(null);
  const [incomingForm, setIncomingForm] = useState(newIncomingForm);
  const [outgoingForm, setOutgoingForm] = useState(newOutgoingForm);
  // The service's answer to the last failed save: a general message and/or one per field.
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState(NO_ERRORS);
  const [saving, setSaving] = useState(false);

  // The transaction being edited and the values currently in its form (see newEditForm).
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [transactionToCancel, setTransactionToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const filterItemId = selectedItemId === 'all' ? undefined : resolveId(lookupItems, selectedItemId);

  const loadTransactions = useCallback(() => {
    const filters = {
      search,
      itemId: filterItemId,
      from: fromDate || undefined,
      to: toDate || undefined,
    };
    return activeTab === INCOMING ? getIncomingTransactionsApi(filters) : getOutgoingTransactionsApi(filters);
  }, [activeTab, search, filterItemId, fromDate, toDate]);

  const { data: transactions, loading, error, reload } = useAsyncData(loadTransactions, EMPTY_LIST);

  // The item selectors in the forms come from the active inventory itself, so an item that has
  // never had a transaction can be chosen and an archived item cannot.
  const { data: inventoryItems, reload: reloadInventory } = useAsyncData(getInventoryItemsApi, EMPTY_LIST);

  // Suggestions for the manufacturer input. Reloaded after a receipt, which may add one.
  const { data: manufacturers, reload: reloadManufacturers } = useAsyncData(getManufacturersApi, EMPTY_LIST);
  const manufacturerName = (id) => manufacturers.find((manufacturer) => sameId(manufacturer.id, id))?.name ?? '';

  // Archived items keep their transactions as history. Those rows are listed but read-only.
  const archivedItemIds = useMemo(
    () => new Set(lookupItems.filter((item) => item.archived).map((item) => String(item.id))),
    [lookupItems],
  );
  const isArchivedItem = (itemId) => archivedItemIds.has(String(itemId));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target)) setIsDateDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isIncomingTab = activeTab === INCOMING;
  const displayedTransactions = showAll ? transactions : transactions.slice(0, DEFAULT_PAGE_SIZE);
  const hasActiveFilters = selectedItemId !== 'all' || fromDate || toDate;
  const outgoingBatches = inventoryItems.find((item) => sameId(item.id, outgoingForm.itemId))?.batches ?? EMPTY_LIST;

  const editingId = editingTransaction?.id;
  const editItemId = editForm ? resolveId(inventoryItems, editForm.itemId) : undefined;
  const needsEditBatches = editingId !== undefined && editForm?.type === OUTGOING && editItemId !== undefined;

  // Which batches the edited transaction may issue from, and how much each has for it, is
  // decided by the service (the transaction's own quantity is counted as available again).
  const loadEditBatches = useCallback(
    () => (needsEditBatches ? getTransactionBatchOptionsApi(editingId, { itemId: editItemId }) : loadNoBatches()),
    [needsEditBatches, editingId, editItemId],
  );
  const { data: loadedEditBatches, loading: editBatchesLoading } = useAsyncData(loadEditBatches, EMPTY_LIST);
  const editBatches = editBatchesLoading ? EMPTY_LIST : loadedEditBatches;

  const switchTab = (tab) => {
    setActiveTab(tab);
    setShowAll(false);
  };

  const handleResetFilters = () => {
    setSelectedItemId('all');
    setFromDate('');
    setToDate('');
    setIsDateDropdownOpen(false);
  };

  const clearErrors = () => {
    setFormError('');
    setFieldErrors(NO_ERRORS);
  };

  // A message that already sits under its field is not repeated above the form.
  const showSaveError = (err, fallback) => {
    const errors = getFieldErrors(err);
    setFieldErrors(errors);
    setFormError(Object.keys(errors).length ? '' : getErrorMessage(err, fallback));
  };

  // Every "add" form starts empty with today's date, so values typed into a form that was
  // closed without saving can never be submitted by accident later.
  const openAddModal = useCallback((type) => {
    setFormError('');
    setFieldErrors(NO_ERRORS);
    if (type === INCOMING) setIncomingForm(newIncomingForm()); else setOutgoingForm(newOutgoingForm());
    setOpenModal(type);
  }, []);

  // The dashboard quick actions link here with ?create=incoming or ?create=outgoing.
  useCreateParam(openAddModal, ADD_TYPES);

  // The transaction is stored under the type of the form that was submitted,
  // never under whichever tab happens to be selected.
  const saveTransaction = async (type, payload) => {
    setSaving(true);
    clearErrors();
    try {
      if (type === INCOMING) await createIncomingTransactionApi(payload);
      else await createOutgoingTransactionApi(payload);
      setOpenModal(null);
      showSuccess(type === INCOMING ? 'Incoming stock recorded.' : 'Outgoing stock recorded.');
      if (activeTab === type) reload(); else switchTab(type);
      reloadInventory();
      reloadLookups();
      if (type === INCOMING) reloadManufacturers();
      refreshUnreadCount();
    } catch (err) {
      // The form stays open with everything the user typed, so it can be corrected and resent.
      showSaveError(err, 'Could not save the transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (transaction) => {
    const currentBatchNumber = batchNumber(transaction.batchId);
    setEditForm(newEditForm(transaction, currentBatchNumber === EMPTY_VALUE ? '' : currentBatchNumber, manufacturerName(transaction.manufacturerId)));
    clearErrors();
    setEditingTransaction(transaction);
  };

  const closeEditModal = () => {
    setEditingTransaction(null);
    setEditForm(null);
  };

  // The page only collects the values. Validation, stock and cost effects are the service's job;
  // if it rejects the change nothing was saved and its message is shown in the form.
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const common = { type: editForm.type, itemId: editItemId, quantity: toNumber(editForm.quantity), date: editForm.date };
    const payload = editForm.type === INCOMING
      ? {
        ...common, batchNumber: editForm.batchNumber.trim(), unitCost: toNumber(editForm.unitCost), expiryDate: editForm.expiryDate || null,
        supplier: editForm.supplier.trim() || null, manufacturer: editForm.manufacturer.trim() || null, manufacturingDate: editForm.manufacturingDate || null,
      }
      : { ...common, batchId: resolveId(editBatches, editForm.batchId), recipient: editForm.recipient.trim() };

    setSaving(true);
    clearErrors();
    try {
      const updated = await updateTransactionApi(editingTransaction.id, payload);
      closeEditModal();
      showSuccess('Transaction updated.');
      if (activeTab === updated.type) reload(); else switchTab(updated.type);
      reloadInventory();
      reloadLookups();
      reloadManufacturers();
      refreshUnreadCount();
    } catch (err) {
      showSaveError(err, 'Could not update the transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Cancelling keeps the record. The data layer takes it out of every stock and cost
  // calculation, so the inventory and the alert count are loaded again afterwards.
  const handleCancelTransaction = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      await cancelTransactionApi(transactionToCancel.id);
      setTransactionToCancel(null);
      showSuccess('Transaction cancelled.');
      reload();
      reloadInventory();
      refreshUnreadCount();
    } catch (err) {
      setCancelError(getErrorMessage(err, 'Could not cancel the transaction. Please try again.'));
    } finally {
      setCancelling(false);
    }
  };

  // No user id is sent: the recorder is the signed-in user, which the data layer reads from the token.
  const handleSaveIncoming = (e) => {
    e.preventDefault();
    saveTransaction(INCOMING, {
      itemId: resolveId(inventoryItems, incomingForm.itemId),
      quantity: toNumber(incomingForm.quantity),
      unitCost: toNumber(incomingForm.unitCost),
      date: incomingForm.date,
      expiryDate: incomingForm.expiryDate || null,
      batchNumber: incomingForm.batchNumber.trim(),
      // Optional fields left empty are sent as null, never as "".
      supplier: incomingForm.supplier.trim() || null,
      manufacturer: incomingForm.manufacturer.trim() || null,
      manufacturingDate: incomingForm.manufacturingDate || null,
    });
  };

  const handleSaveOutgoing = (e) => {
    e.preventDefault();
    saveTransaction(OUTGOING, {
      itemId: resolveId(inventoryItems, outgoingForm.itemId),
      quantity: toNumber(outgoingForm.quantity),
      date: outgoingForm.date,
      batchId: resolveId(outgoingBatches, outgoingForm.batchId),
      recipient: outgoingForm.recipient.trim(),
    });
  };

  return (
    <>
      <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        <PageHeader
          title="Transactions"
          subtitle="Record and review incoming and outgoing stock."
          actions={(
            <>
              <button type="button" onClick={() => openAddModal(INCOMING)} className="px-4 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition cursor-pointer">
                <Plus className="w-4 h-4" /> Add Incoming
              </button>
              <button type="button" onClick={() => openAddModal(OUTGOING)} className="px-4 py-2.5 bg-white hover:bg-slate-50 text-[#115e54] border border-[#115e54]/40 text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition cursor-pointer">
                <Plus className="w-4 h-4" /> Add Outgoing
              </button>
            </>
          )}
        />

        <div className="inline-flex bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm w-fit">
          <button type="button" onClick={() => switchTab(INCOMING)} className={`px-6 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${isIncomingTab ? 'bg-[#115e54] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
            Incoming
          </button>
          <button type="button" onClick={() => switchTab(OUTGOING)} className={`px-6 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${!isIncomingTab ? 'bg-[#115e54] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
            Outgoing
          </button>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <div className="relative w-full">
              {/* A history filter: archived items stay in it so their past transactions can be found. */}
              <select aria-label="Filter by item" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer appearance-none">
                <option value="all">All Items</option>
                {lookupItems.map((item) => (<option key={item.id} value={item.id}>{item.name}{item.archived ? ' (deactivated)' : ''}</option>))}
              </select>
              <Filter className="absolute right-4 top-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-full" ref={dateDropdownRef}>
              <button type="button" aria-expanded={isDateDropdownOpen} onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 transition">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{fromDate || toDate ? `${fromDate ? formatDate(fromDate) : 'Start'} → ${toDate ? formatDate(toDate) : 'End'}` : 'Filter by Date Range'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDateDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-xl z-40 space-y-3">
                  <label className="block space-y-1">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">From Date</span>
                    <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer" />
                  </label>
                  <label className="block space-y-1">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">To Date</span>
                    <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer" />
                  </label>
                  {/* The dates filter the list as soon as they are picked; this only closes the panel. */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer">Clear Dates</button>
                    <button type="button" onClick={() => setIsDateDropdownOpen(false)} className="px-3 py-1.5 bg-[#115e54] text-white text-[11px] font-bold rounded-lg cursor-pointer">Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <button type="button" onClick={handleResetFilters} className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0" title="Reset Filters">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px] md:min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3.5 px-3 md:px-6">Item</th>
                  <th className="py-3.5 px-3 md:px-6">Quantity</th>
                  <th className="py-3.5 px-3 md:px-6">Date</th>
                  <th className="py-3.5 px-3 md:px-6">Unit Cost</th>
                  <th className="py-3.5 px-3 md:px-6">{isIncomingTab ? 'Supplier' : 'Recipient'}</th>
                  <th className="py-3.5 px-3 md:px-6">Batch No.</th>
                  <th className="py-3.5 px-3 md:px-6">Recorded By</th>
                  <th className="py-3.5 px-3 md:px-6">Status</th>
                  <th className="py-3.5 px-3 md:px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                <TableState
                  colSpan={9}
                  loading={loading}
                  error={error}
                  onRetry={reload}
                  empty={displayedTransactions.length === 0}
                  loadingMessage="Loading transactions..."
                  emptyMessage="No transactions found matching this filter."
                >
                  {displayedTransactions.map((row) => {
                    const isCancelled = row.status === TRANSACTION_STATUS.CANCELLED;
                    const isArchived = isArchivedItem(row.itemId);
                    // A cancelled transaction stays listed, greyed out. It and the transactions
                    // of an archived item are history and can no longer be changed.
                    const isDisposalRow = row.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL;
                    const locked = isCancelled || isArchived;
                    const lockedReason = isCancelled ? 'This transaction is cancelled' : 'This item is deactivated. Reactivate it to change its transactions';
                    // Disposals are recorded from the Inventory page (an expired batch's Dispose button).
                    // Here they are history: listed and cancellable, but not editable.
                    const editLocked = locked || isDisposalRow;
                    const editLockedReason = locked ? lockedReason : 'A disposal cannot be edited. Cancel it, then dispose of the batch again from Inventory';
                    const muted = isCancelled ? 'opacity-50' : '';
                    const name = itemName(row.itemId);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition">
                        <td className={`py-4 px-3 md:px-6 font-bold text-slate-900 ${muted}`}>
                          {name}
                          {isArchived && <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deactivated item</span>}
                        </td>
                        <td className={`py-4 px-3 md:px-6 font-bold text-slate-900 ${muted}`}>{formatNumber(row.quantity)}</td>
                        <td className={`py-4 px-3 md:px-6 text-slate-600 ${muted}`}>{formatDate(row.date)}</td>
                        <td className={`py-4 px-3 md:px-6 font-bold text-[#115e54] ${muted}`}>{row.unitCost == null ? EMPTY_VALUE : formatCurrency(row.unitCost)}</td>
                        <td className={`py-4 px-3 md:px-6 text-slate-600 ${muted}`}>
                          {isDisposalRow ? (
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold text-red-700 bg-red-50">{OUTGOING_REASON_LABELS[row.reason]}</span>
                          ) : ((isIncomingTab ? row.supplier : row.recipient) || EMPTY_VALUE)}
                        </td>
                        <td className={`py-4 px-3 md:px-6 text-slate-500 ${muted}`}>{batchNumber(row.batchId)}</td>
                        <td className={`py-4 px-3 md:px-6 text-slate-700 font-semibold ${muted}`}>{userName(row.recordedBy)}</td>
                        <td className="py-4 px-3 md:px-6">
                          <span title={isCancelled ? `Cancelled ${formatDateTime(row.cancelledAt)} by ${userName(row.cancelledBy)}` : undefined} className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${STATUS_CLASSES[row.status]}`}>
                            {TRANSACTION_STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td className="py-4 px-3 md:px-6">
                          <div className="flex items-center justify-center gap-2">
                            <button type="button" disabled={editLocked} onClick={() => openEditModal(row)} className={`${actionButtonClass} ${ACTION_BUTTON_TONE}`} title={editLocked ? editLockedReason : 'Edit Transaction'} aria-label={`Edit transaction for ${name}`}>
                              <EditIcon />
                            </button>
                            <button type="button" disabled={locked} onClick={() => { setCancelError(''); setTransactionToCancel(row); }} className={`${actionButtonClass} ${ACTION_BUTTON_TONE}`} title={locked ? lockedReason : 'Cancel Transaction'} aria-label={`Cancel transaction for ${name}`}>
                              <DeleteIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </TableState>
              </tbody>
            </table>
          </div>

          {!loading && transactions.length > DEFAULT_PAGE_SIZE && (
            <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50/50">
              <button type="button" onClick={() => setShowAll(!showAll)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
                {showAll ? 'Show Less' : `View All (${transactions.length})`}
              </button>
            </div>
          )}
        </div>
      </main>

      {openModal === INCOMING && (
        <Modal title="Add Incoming Stock" spacing="space-y-4" onClose={() => setOpenModal(null)}>
          <form onSubmit={handleSaveIncoming} className="space-y-3.5 text-xs">
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <IncomingFields form={incomingForm} onChange={(changes) => setIncomingForm({ ...incomingForm, ...changes })} items={inventoryItems} manufacturers={manufacturers} errors={fieldErrors} />
            <div className="pt-3 flex items-center justify-end gap-2 border-t">
              <button type="button" onClick={() => setOpenModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white font-bold rounded-xl cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save Incoming'}</button>
            </div>
          </form>
        </Modal>
      )}

      {openModal === OUTGOING && (
        <Modal title="Add Outgoing Stock" spacing="space-y-4" onClose={() => setOpenModal(null)}>
          <form onSubmit={handleSaveOutgoing} className="space-y-3.5 text-xs">
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <OutgoingFields form={outgoingForm} onChange={(changes) => setOutgoingForm({ ...outgoingForm, ...changes })} items={inventoryItems} batches={outgoingBatches} errors={fieldErrors} />
            <div className="pt-3 flex items-center justify-end gap-2 border-t">
              <button type="button" onClick={() => setOpenModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white font-bold rounded-xl cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save Outgoing'}</button>
            </div>
          </form>
        </Modal>
      )}

      {editingTransaction && editForm && (
        <Modal
          title="Edit Transaction"
          subtitle={(
            <p className="text-xs text-slate-500 font-semibold mt-0.5">
              Recorded {formatDateTime(editingTransaction.createdAt)} by <span className="text-slate-700 font-bold">{userName(editingTransaction.recordedBy)}</span>
            </p>
          )}
          spacing="space-y-4"
          onClose={closeEditModal}
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <label className="block">
              <span className={fieldLabelClass}>Transaction Type</span>
              <select required value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value, batchId: '' })} className={`${fieldInputClass} cursor-pointer`}>
                <option value={INCOMING}>{TRANSACTION_TYPE_LABELS[INCOMING]}</option>
                <option value={OUTGOING}>{TRANSACTION_TYPE_LABELS[OUTGOING]}</option>
              </select>
              <FieldError message={fieldErrors.type} />
            </label>
            {editForm.type === INCOMING ? (
              <IncomingFields form={editForm} onChange={(changes) => setEditForm({ ...editForm, ...changes })} items={inventoryItems} manufacturers={manufacturers} errors={fieldErrors} />
            ) : (
              <>
                <OutgoingFields form={editForm} onChange={(changes) => setEditForm({ ...editForm, ...changes })} items={inventoryItems} batches={editBatches} batchesLoading={editBatchesLoading} errors={fieldErrors} keepBatchId={editingTransaction.type === OUTGOING ? editingTransaction.batchId : null} />
                <p className="text-[11px] font-semibold text-slate-400">
                  The Unit Cost of an outgoing transaction is taken from the item's Average Cost and is not entered by hand.
                </p>
              </>
            )}
            <div className="pt-3 flex items-center justify-end gap-2 border-t">
              <button type="button" onClick={closeEditModal} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white font-bold rounded-xl cursor-pointer disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}

      {transactionToCancel && (
        <ConfirmDialog
          title="Cancel Transaction"
          message={transactionToCancel.type === INCOMING
            ? `Cancel the incoming transaction of ${formatNumber(transactionToCancel.quantity)} ${itemName(transactionToCancel.itemId)} (batch ${batchNumber(transactionToCancel.batchId)})? The batch will be removed from stock. The record stays in the list, marked as cancelled.`
            : transactionToCancel.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL
              ? `Cancel the disposal of ${formatNumber(transactionToCancel.quantity)} ${itemName(transactionToCancel.itemId)} (batch ${batchNumber(transactionToCancel.batchId)})? The quantity will return to the batch as expired stock awaiting disposal. The record stays in the list, marked as cancelled.`
              : `Cancel the outgoing transaction of ${formatNumber(transactionToCancel.quantity)} ${itemName(transactionToCancel.itemId)} (batch ${batchNumber(transactionToCancel.batchId)})? The quantity will return to the batch. The record stays in the list, marked as cancelled.`}
          error={cancelError}
          confirmLabel="Cancel Transaction"
          cancelLabel="Keep Transaction"
          busy={cancelling}
          onConfirm={handleCancelTransaction}
          onCancel={() => setTransactionToCancel(null)}
        />
      )}
    </>
  );
};

export default TransactionsPage;
