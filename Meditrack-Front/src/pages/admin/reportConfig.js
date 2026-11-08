import { Activity, AlertTriangle, ArrowLeftRight, CheckCircle2, DollarSign, Layers3, Package, TrendingDown, TrendingUp } from 'lucide-react';
import { OUTGOING_REASON_LABELS, OUTGOING_REASONS, TRANSACTION_TYPES } from '../../constants/inventory';
import { EMPTY_VALUE, formatCurrency, formatDate, formatNumber, formatQuantity } from '../../utils/formatters';
import { EXPIRY_STATUS, STATUS_LABELS, STOCK_STATUS } from '../../utils/stock';

// Everything presentational about the reports lives here: tab labels, card titles, chart
// segments, column headings and cell text. The reports service only returns raw values.

export const REPORT_TABS = [
  { id: 'summary', label: 'Inventory Summary', icon: CheckCircle2, allowPdf: true },
  { id: 'movement_history', label: 'Movement History', icon: ArrowLeftRight, allowPdf: true },
  { id: 'critical_items', label: 'Critical Items', icon: AlertTriangle, allowPdf: false },
  { id: 'inventory_value', label: 'Inventory Value', icon: DollarSign, allowPdf: true },
];

const count = (key) => (totals) => formatNumber(totals[key]);
const money = (key) => (totals) => formatCurrency(totals[key]);

// Expired stock awaiting disposal, named next to a row's available quantity when there is any.
const expiredNote = (row) => (row.expiredQuantity > 0 ? ` · ${formatNumber(row.expiredQuantity)} expired, awaiting disposal` : '');

const EXPIRY_ROW_STATUSES = [EXPIRY_STATUS.EXPIRED, EXPIRY_STATUS.EXPIRING_SOON];

const CRITICAL_BADGE_CLASSES = {
  [EXPIRY_STATUS.EXPIRED]: 'bg-rose-100 text-rose-700',
  [STOCK_STATUS.OUT]: 'bg-rose-100 text-rose-700',
  [STOCK_STATUS.LOW]: 'bg-amber-100 text-amber-700',
  [EXPIRY_STATUS.EXPIRING_SOON]: 'bg-yellow-100 text-yellow-800',
};

// Each view defines:
//   usesDateRange: whether the Period filter changes anything in this report. Reports about the
//            inventory as it is now ignore it, so the page disables the filter for them.
//   kpis:    the report's headline figures ({ title, icon, value(totals) }), printed at the top
//            of the PDF export. The page itself no longer shows them as cards.
//   chart:   (report, lookups) => [{ label, value }] donut segments
//   chartValue: formats a segment's value for the chart legend (a count or an amount)
//   columns: the four table headings
//   row:     (row, lookups) => { secondary, quantity, note?, value, badgeClass? } cell text
export const REPORT_VIEWS = {
  summary: {
    centerLabel: 'summary',
    chartValue: formatNumber,
    usesDateRange: false,
    kpis: [
      { title: 'Total Items', icon: Package, value: count('totalItems') },
      { title: 'Available', icon: Layers3, value: count('available') },
      { title: 'Low Stock', icon: Package, value: count('lowStock') },
      { title: 'Out of Stock', icon: Package, value: count('outOfStock') },
    ],
    chart: ({ totals }) => [
      { label: 'Available', value: totals.available },
      { label: 'Low Stock', value: totals.lowStock },
      { label: 'Out of Stock', value: totals.outOfStock },
    ],
    columns: ['ITEM NAME', 'CATEGORY', 'QUANTITY / STATUS', 'TOTAL / VALUE'],
    row: (row, lookups) => ({
      secondary: lookups.categoryName(row.categoryId),
      // The quantity is available stock; expired stock awaiting disposal is named apart.
      quantity: formatQuantity(row.quantity, row.unit),
      note: `${STATUS_LABELS[row.status]}${expiredNote(row)}`,
      value: formatCurrency(row.totalValue),
    }),
  },

  movement_history: {
    centerLabel: 'movement',
    chartValue: formatNumber,
    usesDateRange: true,
    kpis: [
      { title: 'Total Items', icon: Package, value: count('itemsCount') },
      { title: 'Total Transactions', icon: Activity, value: count('transactionsCount') },
      { title: 'Incoming Transactions', icon: TrendingUp, value: count('incomingCount') },
      { title: 'Outgoing Transactions', icon: TrendingDown, value: count('outgoingCount') },
    ],
    // Outgoing counts stock issued for use; expired stock disposals are their own segment.
    chart: ({ totals }) => [
      { label: 'Incoming', value: totals.incomingCount },
      { label: 'Outgoing', value: totals.outgoingCount },
      { label: 'Expired Disposal', value: totals.disposalCount },
    ],
    columns: ['ITEM NAME', 'TRANSACTION TYPE / PARTY', 'QUANTITY & DATE', 'TOTAL / VALUE'],
    row: (row, lookups) => ({
      secondary: row.type === TRANSACTION_TYPES.INCOMING
        ? `Incoming (Supplier: ${row.supplier || EMPTY_VALUE})`
        : row.reason === OUTGOING_REASONS.EXPIRED_DISPOSAL
          ? `Outgoing (${OUTGOING_REASON_LABELS[row.reason]})`
          : `Outgoing (Recipient: ${row.recipient || EMPTY_VALUE})`,
      quantity: `${formatQuantity(row.quantity, lookups.itemUnit(row.itemId))} on ${formatDate(row.date)}`,
      // No value is shown when the cost is missing: a made-up $0.00 would read as a real total.
      value: row.totalValue == null ? EMPTY_VALUE : formatCurrency(row.totalValue),
    }),
  },

  critical_items: {
    centerLabel: 'critical items',
    chartValue: formatNumber,
    usesDateRange: false,
    kpis: [
      { title: 'Total Items', icon: Package, value: count('totalItems') },
      { title: 'Low Stock Count', icon: Package, value: count('lowStock') },
      { title: 'Expired / Near Expire', icon: AlertTriangle, value: (totals) => `${formatNumber(totals.expired)} / ${formatNumber(totals.expiringSoon)}` },
      { title: 'General Warnings', icon: AlertTriangle, value: (totals) => `${formatNumber(totals.alerts)} Alerts` },
    ],
    // `expiring` counts expired and expiring-soon items together, and the label says so.
    chart: ({ totals }) => [
      { label: 'Low Stock', value: totals.lowStock },
      { label: 'Expired / Expiring', value: totals.expiring },
      { label: 'Out of Stock', value: totals.outOfStock },
    ],
    columns: ['ITEM NAME', 'CATEGORY', 'QUANTITY / STATUS', 'STATUS / RISK'],
    row: (row, lookups) => ({
      secondary: lookups.categoryName(row.categoryId),
      // A stock row shows available stock against the minimum; an expiry row shows the
      // quantity in the expired or expiring batches, where a minimum means nothing.
      quantity: EXPIRY_ROW_STATUSES.includes(row.status)
        ? formatQuantity(row.quantity, row.unit)
        : `${formatQuantity(row.quantity, row.unit)} (Min: ${formatNumber(row.minQty)})`,
      note: row.status === EXPIRY_STATUS.EXPIRED ? 'Awaiting disposal' : undefined,
      value: STATUS_LABELS[row.status],
      badgeClass: CRITICAL_BADGE_CLASSES[row.status],
    }),
  },

  inventory_value: {
    centerLabel: 'inventory value',
    chartValue: formatCurrency,
    // Stock value is the current inventory; incoming and outgoing value follow the Period.
    usesDateRange: true,
    kpis: [
      { title: 'Total Items', icon: Package, value: count('totalItems') },
      { title: 'Available Stock Value', icon: Package, value: money('stockValue') },
      { title: 'Incoming Value', icon: TrendingUp, value: money('incomingValue') },
      { title: 'Outgoing Value', icon: TrendingDown, value: money('outgoingValue') },
      // Expired stock is never part of the available value: it is shown on its own, before
      // disposal (still on the shelf) and after (disposed of within the period).
      { title: 'Expired Stock Value (awaiting disposal)', icon: AlertTriangle, value: money('expiredValue') },
      { title: 'Disposed Value', icon: AlertTriangle, value: money('disposedValue') },
    ],
    // Money received against money issued, for the same filters as the table beside it.
    chart: ({ totals }) => [
      { label: 'Incoming Value', value: totals.incomingValue },
      { label: 'Outgoing Value', value: totals.outgoingValue },
    ],
    columns: ['ITEM NAME', 'CATEGORY', 'QUANTITY', 'TOTAL VALUE'],
    row: (row, lookups) => ({
      secondary: lookups.categoryName(row.categoryId),
      quantity: formatQuantity(row.quantity, row.unit),
      note: `Unit Cost: ${formatCurrency(row.unitCost)}${expiredNote(row)}`,
      value: formatCurrency(row.totalValue),
    }),
  },
};
