import React from 'react';
import { AlertCircle, AlertTriangle, CalendarClock, CalendarX, CheckCircle2, ChevronRight } from 'lucide-react';
import { STATUS_LABELS } from '../../utils/stock';

// A titled card: the frame every dashboard section sits in.
//   divider: the thin line under the title area (on by default).
const DashboardPanel = ({ title, subtitle, action, className = '', divider = true, children }) => (
  <section className={`bg-white rounded-2xl border border-card-border shadow-sm overflow-hidden flex flex-col ${className}`}>
    <header className={`px-5 sm:px-6 py-4 ${divider ? 'border-b border-chart-grid' : ''} flex items-center justify-between gap-3`}>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-ink font-noto-serif">{title}</h3>
        {subtitle && <p className="text-xs text-muted font-semibold mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </header>
    {children}
  </section>
);

// The small button on the right of a panel header ("View All").
export const PanelAction = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="px-3.5 py-1.5 bg-dashboard-bg border border-card-border text-muted hover:bg-sage-soft hover:text-brand text-xs font-bold rounded-xl transition cursor-pointer inline-flex items-center gap-1">
    {children}
    <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
  </button>
);

// Centered text for a panel that is loading or has nothing to show.
export const PanelMessage = ({ children }) => (
  <div className="flex-1 flex items-center justify-center px-6 py-12 text-center text-xs font-bold text-muted">{children}</div>
);

// How each stock or expiry status looks in alerts and badges (colour tokens: index.css).
// Every category has its own colour: muted red for out of stock, burgundy for expired stock, amber
// for the two warnings, which are told apart by their icon.
const STATUS_STYLES = {
  available: { Icon: CheckCircle2, tile: 'bg-incoming-soft text-incoming-text', badge: 'bg-incoming-soft text-incoming-text border-incoming/30' },
  low_stock: { Icon: AlertTriangle, tile: 'bg-low-stock-soft text-low-stock-text', badge: 'bg-low-stock-soft text-low-stock-text border-low-stock/40' },
  expiring_soon: { Icon: CalendarClock, tile: 'bg-low-stock-soft text-low-stock-text', badge: 'bg-low-stock-soft text-low-stock-text border-low-stock/40' },
  out_of_stock: { Icon: AlertCircle, tile: 'bg-danger-soft text-out-of-stock-text', badge: 'bg-danger-soft text-out-of-stock-text border-out-of-stock/30' },
  expired: { Icon: CalendarX, tile: 'bg-expired-soft text-expired-text', badge: 'bg-expired-soft text-expired-text border-expired/20' },
};
const UNKNOWN_STATUS = { Icon: AlertCircle, tile: 'bg-sage-soft text-muted', badge: 'bg-dashboard-bg text-muted border-card-border' };

export const StatusBadge = ({ status }) => (
  <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${(STATUS_STYLES[status] ?? UNKNOWN_STATUS).badge}`}>
    {STATUS_LABELS[status] ?? status}
  </span>
);

// One row of an alert list, coloured by its `status`. `onClick` opens the related page.
// `compact` is for a narrow column: the badge sits under the text instead of beside it.
// `fill` lets the row take an equal share of a list stretched to its panel's height, with its
// content centred in that share.
export const AlertRow = ({ title, description, status, onClick, actionLabel, compact = false, fill = false }) => {
  const { Icon, tile } = STATUS_STYLES[status] ?? UNKNOWN_STATUS;
  return (
    <li className={fill ? 'flex-1 flex' : undefined}>
      <button type="button" onClick={onClick} aria-label={`${title} ${actionLabel}`} className={`group w-full text-left px-5 sm:px-6 py-3.5 flex gap-3.5 hover:bg-dashboard-bg/80 transition cursor-pointer focus:outline-none focus-visible:bg-dashboard-bg ${compact && !fill ? 'items-start' : 'items-center'}`}>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tile}`}>
          <Icon aria-hidden="true" className="w-4.5 h-4.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-ink leading-snug">{title}</span>
          <span className="block text-[11px] text-muted font-semibold mt-0.5 leading-snug">{description}</span>
          {compact && <span className="block mt-2"><StatusBadge status={status} /></span>}
        </span>
        {!compact && <StatusBadge status={status} />}
        <ChevronRight aria-hidden="true" className={`w-4 h-4 text-mint group-hover:text-brand transition-colors shrink-0 hidden sm:block ${compact && !fill ? 'mt-2.5' : ''}`} />
      </button>
    </li>
  );
};

export default DashboardPanel;
