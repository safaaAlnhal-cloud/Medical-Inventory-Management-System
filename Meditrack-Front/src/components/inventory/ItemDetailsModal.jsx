import React, { useId, useMemo, useState } from 'react';
import { Barcode, Calendar, DollarSign, Factory, Hash, History, Package, Plus, Trash2, Truck, X } from 'lucide-react';
import FormField, { inputClassName } from '../common/FormField';
import InlineAlert from '../common/InlineAlert';
import Modal from '../common/Modal';
import { getErrorMessage, getFieldErrors } from '../../services/apiError';
import { linkBarcodeApi, unlinkBarcodeApi } from '../../services/inventoryApi';
import { EMPTY_VALUE, formatCurrency, formatDate, formatNumber, formatUnit } from '../../utils/formatters';
import { EXPIRY_STATUS, STATUS_LABELS } from '../../utils/stock';

const EMPTY_LIST = [];
// How many batches are shown before "View All" is pressed.
const BATCH_PREVIEW_COUNT = 3;
const BATCH_STATUS_CLASSES = {
  [EXPIRY_STATUS.EXPIRED]: 'text-red-700 bg-red-50',
  [EXPIRY_STATUS.EXPIRING_SOON]: 'text-amber-700 bg-amber-50',
};
const VALID_BATCH_CLASS = 'text-emerald-700 bg-emerald-50';
const EXPIRY_TEXT_CLASSES = {
  [EXPIRY_STATUS.EXPIRED]: 'text-red-600',
  [EXPIRY_STATUS.EXPIRING_SOON]: 'text-amber-600',
};
const isExpiredBatch = (batch) => batch.expiryStatus === EXPIRY_STATUS.EXPIRED;

// The six optional details, in the order they are shown.
const DETAIL_LABELS = [
  ['activeIngredient', 'Active Ingredient'],
  ['strength', 'Strength'],
  ['dosageForm', 'Dosage Form'],
  ['storageConditions', 'Storage Conditions'],
  ['uses', 'Uses'],
  ['description', 'Description'],
];
const EMPTY_BARCODE_FORM = { barcode: '', manufacturer: '' };
const NO_ERRORS = {};

const sectionTitleClass = 'text-[11px] font-extrabold text-slate-400 uppercase tracking-wider';

// Everything about one item: its details and factory barcodes at the top, then its batches in
// stock (each expired batch with its own Dispose button). Replaces the old batch modal.
//   item              the item as the service returned it (the page passes the fresh copy)
//   categoryName      the item's category name
//   manufacturers     every manufacturer [{ id, name }], for names and the input suggestions
//   onDispose(batch)  asks the page to confirm disposing of an expired batch
//   onShowHistory()   opens the deactivation history (offered when the item has one)
//   onChanged()       a barcode was added or removed: the page reloads its data
const ItemDetailsModal = ({ item, categoryName, manufacturers, onClose, onDispose, onShowHistory, onChanged }) => {
  const listId = useId();
  const [showAllBatches, setShowAllBatches] = useState(false);
  const [barcodeForm, setBarcodeForm] = useState(EMPTY_BARCODE_FORM);
  const [barcodeErrors, setBarcodeErrors] = useState(NO_ERRORS);
  const [barcodeError, setBarcodeError] = useState('');
  const [savingBarcode, setSavingBarcode] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const manufacturerNames = useMemo(() => new Map(manufacturers.map((manufacturer) => [manufacturer.id, manufacturer.name])), [manufacturers]);
  const manufacturerName = (id) => manufacturerNames.get(id) ?? EMPTY_VALUE;
  const details = DETAIL_LABELS.filter(([field]) => item[field]);

  // Expired batches first, so the ones that need action are never hidden behind "View All".
  const batches = useMemo(() => {
    const all = item.batches ?? EMPTY_LIST;
    return [...all.filter(isExpiredBatch), ...all.filter((batch) => !isExpiredBatch(batch))];
  }, [item]);
  const visibleBatches = showAllBatches ? batches : batches.slice(0, BATCH_PREVIEW_COUNT);
  const hiddenBatchCount = batches.length - visibleBatches.length;

  const handleLinkBarcode = async (e) => {
    e.preventDefault();
    setSavingBarcode(true);
    setBarcodeErrors(NO_ERRORS);
    setBarcodeError('');
    try {
      await linkBarcodeApi(item.id, barcodeForm);
      setBarcodeForm(EMPTY_BARCODE_FORM);
      onChanged();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setBarcodeErrors(fieldErrors);
      setBarcodeError(Object.keys(fieldErrors).length ? '' : getErrorMessage(err, 'Could not add the barcode. Please try again.'));
    } finally {
      setSavingBarcode(false);
    }
  };

  const handleUnlinkBarcode = async (barcode) => {
    setRemovingId(barcode.id);
    setBarcodeError('');
    try {
      await unlinkBarcodeApi(item.id, barcode.id);
      onChanged();
    } catch (err) {
      setBarcodeError(getErrorMessage(err, 'Could not remove the barcode. Please try again.'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal
      maxWidth="max-w-2xl"
      spacing="space-y-6"
      titleClassName="text-lg font-extrabold text-[#115e54] font-noto-serif"
      title={item.name}
      subtitle={(
        <p className="text-xs text-slate-500 font-semibold mt-0.5">
          Category: <span className="text-slate-700 font-bold">{categoryName}</span> | Available: <span className="text-slate-900 font-bold">{formatNumber(item.quantity)} {formatUnit(item.unit)}</span>
          {item.expiredQuantity > 0 && <> | Expired, awaiting disposal: <span className="text-red-600 font-bold">{formatNumber(item.expiredQuantity)}</span></>}
          {item.disposedQuantity > 0 && <> | Disposed: <span className="text-slate-700 font-bold">{formatNumber(item.disposedQuantity)}</span></>}
          {item.archived && <> | <span className="text-red-600 font-bold">Deactivated</span></>}
        </p>
      )}
      onClose={onClose}
      footer={(
        <div className="pt-2 flex justify-end gap-2">
          {item.archiveHistoryCount > 0 && (
            <button type="button" onClick={onShowHistory} className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5">
              <History className="w-4 h-4" /> Deactivation History ({item.archiveHistoryCount})
            </button>
          )}
          <button type="button" onClick={onClose} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
            Close
          </button>
        </div>
      )}
    >
      {/* With a footer, Modal wraps the content in its scrolling area, so its own spacing does not
         reach these sections: they are spaced, and divided by a faint line, here. */}
      <div className="divide-y divide-slate-100 [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        {/* ---- Details ---- */}
        <section className="space-y-3">
          <h4 className={sectionTitleClass}>Item Details</h4>
          {details.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">No details recorded. Edit the item to add them.</p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {details.map(([field, label]) => (
                <div key={field} className={`p-3 bg-slate-50 rounded-xl border border-slate-100 ${field === 'uses' || field === 'description' ? 'sm:col-span-2' : ''}`}>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">{label}</dt>
                  <dd className="text-xs font-semibold text-slate-800 whitespace-pre-line break-words">{item[field]}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* ---- Barcodes ---- */}
        <section className="space-y-3">
          <h4 className={sectionTitleClass}>Factory Barcodes{item.barcodes.length > 0 ? ` (${item.barcodes.length})` : ''}</h4>
          <p className="text-[11px] font-semibold text-slate-500">
            Every barcode of this item must stand for the same pack ({formatUnit(item.unit)}). A different pack size is a different item.
          </p>
          {barcodeError && <InlineAlert>{barcodeError}</InlineAlert>}

          {item.barcodes.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">No barcodes linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {item.barcodes.map((barcode) => (
                <li key={barcode.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5 font-bold text-slate-900 break-all"><Barcode className="w-4 h-4 text-slate-400 shrink-0" /> {barcode.barcode}</span>
                    <span className="flex items-center gap-1.5"><Factory className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {manufacturerName(barcode.manufacturerId)}</span>
                  </div>
                  {/* A deactivated item's barcodes cannot change until it is reactivated. */}
                  {!item.archived && (
                    <button type="button" disabled={removingId !== null} onClick={() => handleUnlinkBarcode(barcode)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50 shrink-0" aria-label={`Remove barcode ${barcode.barcode}`} title="Remove barcode">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!item.archived && (
            <form onSubmit={handleLinkBarcode} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
              <FormField label="Barcode" error={barcodeErrors.barcode}>
                <input type="text" required maxLength={64} placeholder="Scan or type the barcode" value={barcodeForm.barcode} onChange={(e) => setBarcodeForm({ ...barcodeForm, barcode: e.target.value })} className={inputClassName} />
              </FormField>
              <FormField label="Manufacturer" error={barcodeErrors.manufacturer}>
                <input type="text" required maxLength={150} list={listId} placeholder="e.g. PharmaCo" value={barcodeForm.manufacturer} onChange={(e) => setBarcodeForm({ ...barcodeForm, manufacturer: e.target.value })} className={inputClassName} />
              </FormField>
              {/* The browser suggests the existing names; a new name creates the manufacturer. */}
              <datalist id={listId}>
                {manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.name} />)}
              </datalist>
              <button type="submit" disabled={savingBarcode} className="sm:mt-5 px-4 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> {savingBarcode ? 'Adding...' : 'Add'}
              </button>
            </form>
          )}
        </section>

        {/* ---- Batches ---- */}
        <section className="space-y-3">
          <h4 className={sectionTitleClass}>Batches in Stock{batches.length > 0 ? ` (${batches.length})` : ''}</h4>

          {batches.length === 0 ? (
            <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs font-semibold">
              No batches in stock for this item yet.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleBatches.map((batch) => (
                <div key={batch.id} className="card-hover bg-slate-50 hover:bg-slate-100/60 transition p-4 rounded-2xl border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 bg-[#115e54]/10 text-[#115e54] rounded-lg text-xs font-bold flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" /> {batch.batchNumber}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                        <Factory className="w-3.5 h-3.5 text-slate-400" /> {manufacturerName(batch.manufacturerId)}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-slate-400" /> {batch.supplier || EMPTY_VALUE}
                      </span>
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${BATCH_STATUS_CLASSES[batch.expiryStatus] ?? VALID_BATCH_CLASS}`}>
                        {batch.expiryStatus ? STATUS_LABELS[batch.expiryStatus] : 'Valid'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
                      <span className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-slate-400" /> Qty: <strong className="text-slate-900">{formatNumber(batch.quantity)}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Unit Cost: <strong className="text-emerald-700">{formatCurrency(batch.unitCost)}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Made: <strong className="text-slate-700">{formatDate(batch.manufacturingDate)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/60 shadow-2xs">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <div className="text-right">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Expiry Date</span>
                        <span className={`text-xs font-bold ${EXPIRY_TEXT_CLASSES[batch.expiryStatus] ?? 'text-slate-700'}`}>{formatDate(batch.expiryDate)}</span>
                      </div>
                    </div>
                    {/* Only an expired batch can be disposed of, and each one has its own button. */}
                    {isExpiredBatch(batch) && (
                      <button type="button" onClick={() => onDispose(batch)} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5" aria-label={`Dispose of expired batch ${batch.batchNumber}`}>
                        <Trash2 className="w-3.5 h-3.5" /> Dispose
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Only offered when some batches are not on screen; it reveals the rest in place. */}
          {hiddenBatchCount > 0 && (
            <div className="flex justify-center pt-1">
              <button type="button" onClick={() => setShowAllBatches(true)} className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl shadow-sm transition cursor-pointer">
                View All ({batches.length} batches)
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default ItemDetailsModal;
