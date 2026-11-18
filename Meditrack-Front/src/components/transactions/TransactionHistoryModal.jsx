import React, { useCallback } from 'react';
import InlineAlert from '../common/InlineAlert';
import Modal from '../common/Modal';
import { TRANSACTION_STATUS, TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from '../../constants/inventory';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTransactionRevisionsApi, REVISION_FIELDS } from '../../services/transactionsApi';
import { EMPTY_VALUE, formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/formatters';

const EMPTY_LIST = [];

const FIELD_LABELS = {
  type: 'Type',
  itemId: 'Item',
  quantity: 'Quantity',
  date: 'Date',
  unitCost: 'Unit Cost',
  batchId: 'Batch',
  recipient: 'Recipient',
  batchNumber: 'Batch No.',
  expiryDate: 'Expiry Date',
  supplier: 'Supplier',
  manufacturerId: 'Manufacturer',
  manufacturingDate: 'Manufacturing Date',
};

// The history of one transaction, newest first: its edits (GET /transactions/:id/revisions) and,
// if it was cancelled, the cancellation. Each entry shows who, when, and every field that
// changed as "old -> new". Records hold raw values (ids, ISO dates, numbers); the `names`
// resolvers turn ids into what the user knows.
//
// Cancelling is not an edit, so the revisions endpoint never lists it. It is read from the
// transaction itself (cancelledAt, cancelledBy) and shown first: a cancelled transaction cannot
// be edited, so the cancellation is always the latest thing that happened to it.
//   names: { itemName, userName, batchNumber, manufacturerName }
const TransactionHistoryModal = ({ transaction, names, onClose }) => {
  const isCancelled = transaction.status === TRANSACTION_STATUS.CANCELLED;
  const loadRevisions = useCallback(() => getTransactionRevisionsApi(transaction.id), [transaction.id]);
  const { data: revisions, loading, error } = useAsyncData(loadRevisions, EMPTY_LIST);

  const display = (field, value) => {
    if (value == null || value === '') return EMPTY_VALUE;
    switch (field) {
      case 'type': return TRANSACTION_TYPE_LABELS[value] ?? value;
      case 'itemId': return names.itemName(value);
      case 'batchId': return names.batchNumber(value);
      case 'manufacturerId': return names.manufacturerName(value) || EMPTY_VALUE;
      case 'quantity': return formatNumber(value);
      case 'unitCost': return formatCurrency(value);
      case 'date':
      case 'expiryDate':
      case 'manufacturingDate': return formatDate(value);
      default: return String(value);
    }
  };

  const subtitle = (
    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
      {names.itemName(transaction.itemId)} · {TRANSACTION_TYPE_LABELS[transaction.type]}
    </p>
  );

  return (
    <Modal
      title="History"
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={(
        <div className="pt-3 flex justify-end border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer">Close</button>
        </div>
      )}
    >
      {loading && <p className="py-6 text-center text-xs font-semibold text-slate-400">Loading history...</p>}
      {!loading && error && <InlineAlert>{error}</InlineAlert>}
      {!loading && !error && revisions.length === 0 && !isCancelled && (
        <p className="py-6 text-center text-xs font-semibold text-slate-400">This transaction has not been edited.</p>
      )}
      {!loading && !error && (revisions.length > 0 || isCancelled) && (
        <ol className="space-y-4">
          {isCancelled && (
            <li>
              <p className="text-xs font-bold text-slate-700 mb-1.5">
                {names.userName(transaction.cancelledBy)}
                <span className="font-semibold text-slate-400"> · {formatDateTime(transaction.cancelledAt)}</span>
              </p>
              <dl className="rounded-xl border border-red-100 bg-red-50/60 text-xs">
                <div className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2">
                  <dt className="font-bold text-slate-500">Status</dt>
                  <dd className="font-semibold text-slate-700">
                    <span className="text-slate-400 line-through decoration-slate-300">{TRANSACTION_STATUS_LABELS[TRANSACTION_STATUS.ACTIVE]}</span>
                    <span className="mx-1.5 text-slate-400" aria-label="changed to">→</span>
                    <span className="text-red-700">{TRANSACTION_STATUS_LABELS[TRANSACTION_STATUS.CANCELLED]}</span>
                  </dd>
                </div>
              </dl>
            </li>
          )}
          {revisions.map((revision) => {
            const changed = REVISION_FIELDS.filter((field) => field in revision.newValues || field in revision.oldValues);
            return (
              <li key={revision.id}>
                <p className="text-xs font-bold text-slate-700 mb-1.5">
                  {names.userName(revision.editedBy)}
                  <span className="font-semibold text-slate-400"> · {formatDateTime(revision.editedAt)}</span>
                </p>
                <dl className="rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 text-xs">
                  {changed.map((field) => (
                    <div key={field} className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2">
                      <dt className="font-bold text-slate-500">{FIELD_LABELS[field]}</dt>
                      <dd className="font-semibold text-slate-700 break-words">
                        <span className="text-slate-400 line-through decoration-slate-300">{display(field, revision.oldValues[field])}</span>
                        <span className="mx-1.5 text-slate-400" aria-label="changed to">→</span>
                        <span className="text-slate-900">{display(field, revision.newValues[field])}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
};

export default TransactionHistoryModal;
