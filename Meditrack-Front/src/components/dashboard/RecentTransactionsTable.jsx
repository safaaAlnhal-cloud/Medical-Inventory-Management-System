import React from 'react';
import { formatDateTime, formatQuantity } from '../../utils/formatters';
import { TableState } from '../common/DataState';
import { describeTransaction } from './transactionDisplay';

// Compact cells whose text wraps, so all five columns fit the card without a horizontal
// scrollbar. The outer cells line up with the panel header's padding.
const CELL = 'py-3 px-2.5 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 align-middle';

// `lookups` comes from useLookups().
const RecentTransactionsTable = ({ transactions, lookups, loading, error, onRetry, emptyMessage }) => (
  // Scrolling is only a fallback for very narrow phones; from 400px up the table fits its card.
  // When the panel beside it is taller, the table stretches to the card's height and the spare
  // space is shared among the rows (the header row keeps its height), so no empty gap is left
  // under the last row. Stacked on smaller screens there is no spare space and nothing changes.
  <div className="flex-1 flex flex-col overflow-x-auto">
    <table className="w-full flex-1 text-left border-collapse min-w-[400px] sm:min-w-0">
      <thead>
        <tr className="h-11 bg-dashboard-bg/70 text-[10px] sm:text-[11px] font-bold text-muted uppercase tracking-wider border-b border-chart-grid">
          <th className={`${CELL} w-[28%]`}>Item</th>
          <th className={CELL}>Type</th>
          <th className={CELL}>Quantity</th>
          <th className={CELL}>Date</th>
          <th className={`${CELL} w-[18%]`}>By</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-chart-grid text-[11px] sm:text-xs font-semibold">
        <TableState colSpan={5} loading={loading} error={error} onRetry={onRetry} empty={transactions.length === 0} loadingMessage="Loading transactions..." emptyMessage={emptyMessage}>
          {transactions.map((transaction) => {
            const { label, sign, Icon, badge, quantity } = describeTransaction(transaction);
            return (
              <tr key={transaction.id} className="hover:bg-dashboard-bg/60 transition">
                <td className={`${CELL} font-bold text-ink break-words`}>{lookups.itemName(transaction.itemId)}</td>
                <td className={CELL}>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold leading-tight ${badge}`}>
                    <Icon aria-hidden="true" className="w-3 h-3 shrink-0" />
                    {label}
                  </span>
                </td>
                <td className={`${CELL} font-bold whitespace-nowrap ${quantity}`}>
                  {sign}{formatQuantity(transaction.quantity, lookups.itemUnit(transaction.itemId))}
                </td>
                <td className={`${CELL} text-muted`}>{formatDateTime(transaction.createdAt)}</td>
                <td className={`${CELL} text-ink break-words`}>{lookups.userName(transaction.recordedBy)}</td>
              </tr>
            );
          })}
        </TableState>
      </tbody>
    </table>
  </div>
);

export default RecentTransactionsTable;
