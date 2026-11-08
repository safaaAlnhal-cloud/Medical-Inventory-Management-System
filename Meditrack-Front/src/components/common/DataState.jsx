import React from 'react';

const CARD_CLASS = 'bg-white p-12 rounded-2xl border border-slate-200/80 text-center text-slate-400 text-xs font-bold shadow-sm';

const RetryButton = ({ onRetry }) => (
  <button type="button" onClick={onRetry} className="ml-2 text-[#115e54] hover:underline cursor-pointer">
    Try again
  </button>
);

export const LoadingState = ({ message = 'Loading...' }) => <div className={CARD_CLASS}>{message}</div>;

export const EmptyState = ({ message }) => <div className={CARD_CLASS}>{message}</div>;

export const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className={`${CARD_CLASS} text-red-600`}>
    {message}
    {onRetry && <RetryButton onRetry={onRetry} />}
  </div>
);

// Body of a data table: shows a full-width loading / error / empty row, or the rows themselves.
export const TableState = ({ colSpan, loading, error, onRetry, empty, loadingMessage = 'Loading...', emptyMessage = 'No records found.', children }) => {
  if (!loading && !error && !empty) return children;
  return (
    <tr>
      <td colSpan={colSpan} className={`py-12 text-center font-bold ${error && !loading ? 'text-red-600' : 'text-slate-400'}`}>
        {loading ? loadingMessage : error || emptyMessage}
        {!loading && error && onRetry && <RetryButton onRetry={onRetry} />}
      </td>
    </tr>
  );
};
