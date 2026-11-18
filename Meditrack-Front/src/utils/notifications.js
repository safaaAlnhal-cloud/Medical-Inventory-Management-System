import { isAccountAlert, NOTIFICATION_TYPES } from '../constants/inventory';
import { formatDate, formatQuantity } from './formatters';
import { EXPIRY_STATUS } from './stock';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// An account alert: the storekeeper whose account is about to stop working. Seen by the admin
// and by that storekeeper only.
const describeAccountAlert = (notification, userName) => {
  const name = userName(notification.userId);
  const lastDay = formatDate(notification.accountExpiresOn);
  if (notification.type === NOTIFICATION_TYPES.ACCOUNT_EXPIRES_TODAY) {
    return {
      tone: 'danger',
      title: `${name}'s account expires today.`,
      description: `Today (${lastDay}) is the last working day. An administrator can extend it on the Users page.`,
    };
  }
  return {
    tone: 'warning',
    title: `${name}'s account expires in ${plural(notification.daysLeft, 'day')}.`,
    description: `Last working day: ${lastDay}. An administrator can extend it on the Users page.`,
  };
};

// Turns a raw notification into display text. `lookups` (from useLookups) provides
// itemName(id), itemUnit(id), batchNumber(id) and userName(id).
export const describeNotification = (notification, { itemName, itemUnit, batchNumber, userName }) => {
  if (isAccountAlert(notification)) return describeAccountAlert(notification, userName);

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
