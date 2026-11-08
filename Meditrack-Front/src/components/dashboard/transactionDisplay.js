import { ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';
import { OUTGOING_REASONS, TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from '../../constants/inventory';

// How a transaction is shown on the dashboards: stock received (green), stock issued (slate)
// or expired stock disposed of (burgundy). The colours are the dashboard tokens in index.css.
export const describeTransaction = (transaction) => {
  if (transaction.type === TRANSACTION_TYPES.INCOMING) {
    return { label: TRANSACTION_TYPE_LABELS.incoming, sign: '+', Icon: ArrowDownLeft, badge: 'bg-txn-in-soft text-txn-in-text border border-txn-in-border', quantity: 'text-txn-in-text' };
  }
  if (transaction.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL) {
    return { label: 'Expired Disposal', sign: '-', Icon: Trash2, badge: 'bg-expired-soft text-expired-text border border-expired/20', quantity: 'text-expired-text' };
  }
  return { label: TRANSACTION_TYPE_LABELS.outgoing, sign: '-', Icon: ArrowUpRight, badge: 'bg-txn-out-soft text-txn-out-text border border-txn-out-border', quantity: 'text-txn-out-text' };
};
