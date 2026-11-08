import { NOTIFICATION_TYPES } from '../constants/inventory';
import { formatDate, formatQuantity } from './formatters';
import { EXPIRY_STATUS } from './stock';

// Turns a raw notification into display text. `lookups` (from useLookups) provides
// itemName(id), itemUnit(id) and batchNumber(id).
export const describeNotification = (notification, { itemName, itemUnit, batchNumber }) => {
  const name = itemName(notification.itemId);

  if (notification.type === NOTIFICATION_TYPES.OUT_OF_STOCK) {
    return { tone: 'danger', title: `${name} is out of stock.`, description: 'No units remaining in inventory.' };
  }

  if (notification.type === NOTIFICATION_TYPES.LOW_STOCK) {
    return {
      tone: 'warning',
      title: `${name} is running low.`,
      description: `${formatQuantity(notification.quantity, itemUnit(notification.itemId))} remaining; minimum stock is ${notification.minQty}.`,
    };
  }

  // Whether the batch has already expired is decided by the data layer (expiryStatus).
  const expired = notification.expiryStatus === EXPIRY_STATUS.EXPIRED;
  return {
    tone: expired ? 'danger' : 'warning',
    // Only the batch has expired, not the item: its other batches may still be available.
    title: expired ? `${name} has expired stock awaiting disposal.` : `${name} has stock expiring soon.`,
    description: expired
      ? `Batch ${batchNumber(notification.batchId)} · ${formatQuantity(notification.quantity, itemUnit(notification.itemId))} expired on ${formatDate(notification.expiryDate)}. Record its disposal.`
      : `Batch ${batchNumber(notification.batchId)} · ${formatQuantity(notification.quantity, itemUnit(notification.itemId))} · Expiry date: ${formatDate(notification.expiryDate)}.`,
  };
};
