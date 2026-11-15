import React, { useCallback } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import Modal from '../common/Modal';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getItemArchiveHistoryApi } from '../../services/inventoryApi';
import { EMPTY_VALUE, formatDateTime } from '../../utils/formatters';

const EMPTY_LIST = [];

// Every time an item was deactivated: why, who and when, and when (and by whom) it came back.
// Newest first, as the service returns it. `userNames` is a Map of user id -> name.
const ArchiveHistoryModal = ({ item, userNames, onClose }) => {
  const loadHistory = useCallback(() => getItemArchiveHistoryApi(item.id), [item.id]);
  const { data: records, loading, error, reload } = useAsyncData(loadHistory, EMPTY_LIST);
  const nameOf = (userId) => userNames.get(userId) ?? EMPTY_VALUE;

  return (
    <Modal title="Deactivation History" subtitle={<p className="text-xs text-slate-500 font-semibold mt-0.5">{item.name}</p>} maxWidth="max-w-lg" onClose={onClose}>
      {loading && <p className="text-xs font-semibold text-slate-400 text-center py-6">Loading history...</p>}
      {!loading && error && (
        <div className="text-center space-y-2 py-4">
          <p className="text-xs font-semibold text-red-600">{error}</p>
          <button type="button" onClick={reload} className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">Try again</button>
        </div>
      )}
      {!loading && !error && records.length === 0 && (
        <p className="text-xs font-semibold text-slate-400 text-center py-6">This item has never been deactivated.</p>
      )}
      {!loading && !error && records.length > 0 && (
        <ol className="space-y-3">
          {records.map((record) => (
            <li key={record.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2">
              <p className="text-xs font-bold text-slate-900 break-words">&ldquo;{record.reason}&rdquo;</p>
              <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-red-500 shrink-0" />
                Deactivated by <span className="text-slate-700 font-bold">{nameOf(record.archivedBy)}</span> on {formatDateTime(record.archivedAt)}
              </p>
              <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {record.restoredAt
                  ? <>Reactivated by <span className="text-slate-700 font-bold">{nameOf(record.restoredBy)}</span> on {formatDateTime(record.restoredAt)}</>
                  : <span className="text-amber-700 font-bold">Still deactivated</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
};

export default ArchiveHistoryModal;
