import React, { useId, useState } from 'react';
import { CheckCircle2, Link2 } from 'lucide-react';
import ScanInput from './ScanInput';
import { inputClassName, RequiredMark } from '../common/FormField';
import { getErrorMessage, getFieldErrors } from '../../services/apiError';
import { getItemByBarcodeApi, linkBarcodeApi } from '../../services/inventoryApi';
import { sameId } from '../../utils/ids';

const NO_ERRORS = {};

// Scan (or type) a factory barcode to pick an item. BACKEND_HANDOFF.md "Barcodes and manufacturers".
//   onFound({ item, manufacturerId, manufacturerName })
//                   a barcode of an ACTIVE item was found (or just linked)
//   manufacturers   [{ id, name }] for the names and the manufacturer suggestions
//   linkItems       the active items a new barcode may be linked to. When given, an unknown
//                   barcode opens "Link this barcode" (the Incoming form); without it, the
//                   panel only says the barcode is unknown (the Outgoing form).
//   defaultItemId / defaultManufacturer   prefill the link form from what the form already has
//   onLinked()      a barcode was linked (and maybe a manufacturer created): reload them
//   allowArchived   the Inventory page opens a deactivated item too; the forms never take one
const BarcodeScanPanel = ({ onFound, manufacturers, linkItems = null, defaultItemId = '', defaultManufacturer = '', onLinked, allowArchived = false }) => {
  const listId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'ok' | 'error', text }
  // The unknown barcode being linked, and the link form.
  const [unknownCode, setUnknownCode] = useState(null);
  const [linkForm, setLinkForm] = useState({ itemId: '', manufacturer: '' });
  const [linkErrors, setLinkErrors] = useState(NO_ERRORS);

  const nameOf = (id) => manufacturers.find((manufacturer) => sameId(manufacturer.id, id))?.name ?? '';

  const found = (item, manufacturerId, manufacturerName, code) => {
    setMessage({ tone: 'ok', text: `Barcode ${code}: ${item.name}${manufacturerName ? `, ${manufacturerName}` : ''}.` });
    onFound({ item, manufacturerId, manufacturerName });
  };

  const handleScan = async (code) => {
    setBusy(true);
    setMessage(null);
    setUnknownCode(null);
    try {
      const result = await getItemByBarcodeApi(code);
      if (result.item.archived && !allowArchived) {
        setMessage({ tone: 'error', text: `Barcode ${code} belongs to "${result.item.name}", which is deactivated. Reactivate it before recording stock for it.` });
        return;
      }
      found(result.item, result.manufacturerId, nameOf(result.manufacturerId), code);
    } catch (err) {
      if (err?.status !== 404) {
        setMessage({ tone: 'error', text: getErrorMessage(err, 'Could not look the barcode up. Please try again.') });
      } else if (linkItems) {
        // Unknown here: offer to link it, starting from what the form already has.
        setUnknownCode(code);
        setLinkForm({ itemId: String(defaultItemId || ''), manufacturer: defaultManufacturer || '' });
        setLinkErrors(NO_ERRORS);
      } else {
        setMessage({ tone: 'error', text: `No item has barcode ${code}. Link it from the Incoming form or from the item's details on the Inventory page.` });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    const item = linkItems.find((candidate) => sameId(candidate.id, linkForm.itemId));
    if (!item) {
      setLinkErrors({ itemId: 'Choose the item this barcode belongs to.' });
      return;
    }
    setBusy(true);
    setLinkErrors(NO_ERRORS);
    try {
      const updated = await linkBarcodeApi(item.id, { barcode: unknownCode, manufacturer: linkForm.manufacturer });
      const linked = updated.barcodes.find((barcode) => barcode.barcode === unknownCode);
      const code = unknownCode;
      setUnknownCode(null);
      onLinked?.();
      found(updated, linked?.manufacturerId ?? null, linkForm.manufacturer.trim(), code);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setLinkErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: getErrorMessage(err, 'Could not link the barcode. Please try again.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70">
      <ScanInput onScan={handleScan} busy={busy} />

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-[11px] font-bold flex items-start gap-1.5 ${message.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {message.tone === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />} {message.text}
        </p>
      )}

      {unknownCode && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-bold text-amber-700">
            No item has barcode <span className="break-all">{unknownCode}</span> yet. Link it, and the next scan will find it:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="block text-[11px] font-bold text-slate-500 uppercase">Item<RequiredMark /></span>
              <select value={linkForm.itemId} onChange={(e) => setLinkForm({ ...linkForm, itemId: e.target.value })} className={`${inputClassName} cursor-pointer`}>
                <option value="">Select item</option>
                {linkItems.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
              </select>
              {linkErrors.itemId && <span role="alert" className="block text-[11px] font-bold text-red-600">{linkErrors.itemId}</span>}
            </label>
            <label className="block space-y-1">
              <span className="block text-[11px] font-bold text-slate-500 uppercase">Manufacturer<RequiredMark /></span>
              <input type="text" maxLength={150} list={listId} autoComplete="off" placeholder="e.g. PharmaCo" value={linkForm.manufacturer} onChange={(e) => setLinkForm({ ...linkForm, manufacturer: e.target.value })} className={inputClassName} />
              <datalist id={listId}>
                {manufacturers.map((manufacturer) => (<option key={manufacturer.id} value={manufacturer.name} />))}
              </datalist>
              {linkErrors.manufacturer && <span role="alert" className="block text-[11px] font-bold text-red-600">{linkErrors.manufacturer}</span>}
            </label>
          </div>
          {(linkErrors.barcode || linkErrors.form) && <p role="alert" className="text-[11px] font-bold text-red-600">{linkErrors.barcode || linkErrors.form}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setUnknownCode(null)} className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg cursor-pointer">Not now</button>
            <button type="button" disabled={busy} onClick={handleLink} className="px-3 py-1.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> {busy ? 'Linking...' : 'Link this barcode'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanPanel;
