import React from 'react';
import InlineAlert from './InlineAlert';
import Modal from './Modal';

// `error` is shown under the message when the confirmed action failed, so the user still sees
// what they were asked to confirm.
const ConfirmDialog = ({ title, message, error, confirmLabel = 'Confirm', cancelLabel = 'Cancel', busy = false, onConfirm, onCancel }) => (
  <Modal title={title} onClose={onCancel}>
    <p className="text-xs font-semibold text-slate-600">{message}</p>
    {error && <InlineAlert>{error}</InlineAlert>}
    <div className="pt-1 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm} disabled={busy} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
        {confirmLabel}
      </button>
    </div>
  </Modal>
);

export default ConfirmDialog;
