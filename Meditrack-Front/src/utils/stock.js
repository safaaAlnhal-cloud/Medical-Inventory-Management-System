import { daysUntil } from './dates';

// Single source of truth for stock and expiry rules. The backend should apply the same rules
// when it computes dashboard counts, alerts and reports (see BACKEND_HANDOFF.md).
export const STOCK_STATUS = { AVAILABLE: 'available', LOW: 'low_stock', OUT: 'out_of_stock' };
export const EXPIRY_STATUS = { EXPIRED: 'expired', EXPIRING_SOON: 'expiring_soon' };
export const EXPIRY_WARNING_DAYS = 30;

export const STATUS_LABELS = {
  available: 'Available',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
};

export const getStockStatus = (quantity, minQty = 0) => {
  const current = Number(quantity) || 0;
  if (current <= 0) return STOCK_STATUS.OUT;
  if (current <= (Number(minQty) || 0)) return STOCK_STATUS.LOW;
  return STOCK_STATUS.AVAILABLE;
};

export const getExpiryStatus = (expiryDate, now = new Date()) => {
  const days = daysUntil(expiryDate, now);
  if (days === null) return null;
  if (days < 0) return EXPIRY_STATUS.EXPIRED;
  if (days <= EXPIRY_WARNING_DAYS) return EXPIRY_STATUS.EXPIRING_SOON;
  return null;
};
