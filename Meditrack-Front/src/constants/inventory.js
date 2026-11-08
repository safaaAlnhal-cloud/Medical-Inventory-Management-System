export const UNITS = ['box', 'strip', 'bottle', 'vial', 'ampoule', 'piece', 'pack'];

export const TRANSACTION_TYPES = { INCOMING: 'incoming', OUTGOING: 'outgoing' };
export const TRANSACTION_TYPE_LABELS = { incoming: 'Incoming', outgoing: 'Outgoing' };

// Why stock left: an outgoing transaction either issues usable stock to a recipient or records
// the disposal of expired stock. Incoming transactions have no reason.
export const OUTGOING_REASONS = { ISSUE: 'issue', EXPIRED_DISPOSAL: 'expired_disposal' };
export const OUTGOING_REASON_LABELS = { issue: 'Issued', expired_disposal: 'Expired Stock Disposal' };

// A cancelled transaction is kept as a record but no longer counts towards stock or costs.
export const TRANSACTION_STATUS = { ACTIVE: 'active', CANCELLED: 'cancelled' };
export const TRANSACTION_STATUS_LABELS = { active: 'Active', cancelled: 'Cancelled' };

export const NOTIFICATION_TYPES = { LOW_STOCK: 'low_stock', EXPIRING: 'expiring', OUT_OF_STOCK: 'out_of_stock' };
