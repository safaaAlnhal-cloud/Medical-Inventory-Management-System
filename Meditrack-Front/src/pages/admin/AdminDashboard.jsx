import React, { useMemo } from 'react';
import { AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, CalendarClock, CalendarX, CircleDollarSign, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '../../components/common/DataState';
import DashboardHero from '../../components/dashboard/DashboardHero';
import { ImportantAlertsPanel, RecentTransactionsPanel } from '../../components/dashboard/ActivityPanels';
import DashboardPanel, { PanelMessage } from '../../components/dashboard/DashboardPanel';
import DashboardStats from '../../components/dashboard/DashboardStats';
import { useAuth } from '../../context/AuthContext';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useLookups } from '../../hooks/useLookups';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import {
  getCriticalAlertsApi,
  getDashboardSummaryApi,
  getRecentTransactionsApi,
  getStockMovementApi,
} from '../../services/dashboardApi';
import { getNotificationsApi } from '../../services/notificationsApi';
import { getReportApi } from '../../services/reportsApi';
import { EMPTY_VALUE, formatCurrency, formatMonth, formatNumber } from '../../utils/formatters';
import { EXPIRY_WARNING_DAYS } from '../../utils/stock';

const EMPTY_SUMMARY = { totalItems: 0, availableCount: 0, lowStockCount: 0, outOfStockCount: 0, expiringSoonCount: 0, expiredCount: 0 };
const EMPTY_LIST = [];

const MOVEMENT_MONTHS = 6;
const ALERTS_SHOWN = 5;
// Diverging chart scale: ticks every AXIS_INTERVAL units on both sides of zero, labelled without
// signs (400, 200, 0, 200, 400). It reaches at least MIN_AXIS_MAX and extends by whole intervals
// when a month is busier, so no bar is ever cut off.
const AXIS_INTERVAL = 200;
const MIN_AXIS_MAX = 400;

// Only the totals of these two reports are shown, so one row is requested.
const loadInventoryValue = () => getReportApi('inventory_value', { pageSize: 1 });
const loadMovementTotals = () => getReportApi('movement_history', { pageSize: 1 });
// Every current alert, for the count on the banner's Alerts button (the navbar search does not
// change it; the Important Alerts panel has its own, searched count).
const loadAllAlerts = () => getNotificationsApi();

// Whole-number percentages of a complete distribution that always add up to 100 (largest
// remainder method): each share is rounded down, then the points still missing go to the shares
// with the largest fractions (ties to the earlier share). A zero total gives 0 for every share.
const wholePercentages = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((value) => (value / total) * 100);
  const result = exact.map(Math.floor);
  let missing = 100 - result.reduce((sum, value) => sum + value, 0);
  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (missing > 0) {
        result[index] += 1;
        missing -= 1;
      }
    });
  return result;
};

// Outgoing (below zero) is listed first, then incoming (above zero). The arrows are icons with a
// heavy stroke, in the colour of their bars, so they stay legible at legend size.
const Legend = () => (
  <div className="flex items-center gap-4 text-[11px] font-bold text-muted">
    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#8db9a8] inline-block" />Outgoing<ArrowDown aria-hidden="true" strokeWidth={3.25} className="w-3.5 h-3.5 -ml-0.5 text-[#8db9a8]" /></span>
    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" />Incoming<ArrowUp aria-hidden="true" strokeWidth={3.25} className="w-3.5 h-3.5 -ml-0.5 text-brand" /></span>
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearchQuery();
  const lookups = useLookups();

  // Each section is its own request: if one fails, the others are still shown.
  const sections = useMemo(() => ({
    summary: { load: getDashboardSummaryApi, empty: EMPTY_SUMMARY, label: 'summary' },
    inventoryValue: { load: loadInventoryValue, empty: null, label: 'stock value' },
    movementTotals: { load: loadMovementTotals, empty: null, label: 'transaction totals' },
    allAlerts: { load: loadAllAlerts, empty: null, label: 'alert total' },
    stockMovement: { load: () => getStockMovementApi({ months: MOVEMENT_MONTHS }), empty: EMPTY_LIST, label: 'stock movement' },
    // The panel lists the most severe alerts; its badge counts every alert matching the search.
    alerts: { load: () => getCriticalAlertsApi({ search, limit: ALERTS_SHOWN }), empty: EMPTY_LIST, label: 'critical alerts' },
    matchingAlerts: { load: () => getNotificationsApi({ search }), empty: null, label: 'alert count' },
    transactions: { load: () => getRecentTransactionsApi({ search, limit: 6 }), empty: EMPTY_LIST, label: 'recent transactions' },
  }), [search]);

  const { data, loading, error, reload } = useDashboardData(sections);
  const { summary, inventoryValue, movementTotals, allAlerts, matchingAlerts, stockMovement, alerts, transactions } = data;
  // Nothing has arrived yet (a later search keeps the previous figures on screen while it loads).
  const firstLoad = loading && summary === EMPTY_SUMMARY;

  const valueTotals = inventoryValue?.totals;
  const movement = movementTotals?.totals;
  const alertCount = matchingAlerts?.length ?? alerts.length;

  const stats = [
    {
      key: 'items',
      label: 'Total Items',
      value: formatNumber(summary.totalItems),
      hint: `${formatNumber(summary.availableCount)} above minimum stock`,
      icon: <Package className="w-5 h-5" />,
      tone: 'brand',
      onClick: () => navigate('/admin/inventory'),
      actionLabel: 'Open inventory',
      className: 'lg:col-span-3 xl:col-span-1',
    },
    {
      key: 'value',
      label: 'Stock Value',
      value: valueTotals ? formatCurrency(valueTotals.stockValue) : EMPTY_VALUE,
      hint: valueTotals?.expiredValue > 0 ? `Plus ${formatCurrency(valueTotals.expiredValue)} expired, awaiting disposal` : 'Available stock at average cost',
      icon: <CircleDollarSign className="w-5 h-5" />,
      tone: 'forest',
      onClick: () => navigate('/admin/reports'),
      actionLabel: 'Open reports',
      className: 'lg:col-span-3 xl:col-span-1',
    },
    {
      key: 'low',
      label: 'Low Stock',
      value: formatNumber(summary.lowStockCount),
      hint: summary.outOfStockCount > 0 ? `Plus ${formatNumber(summary.outOfStockCount)} out of stock` : 'At or below minimum stock',
      icon: <AlertTriangle className="w-5 h-5" />,
      tone: 'amber',
      onClick: () => navigate('/admin/inventory'),
      actionLabel: 'Open inventory',
      className: 'lg:col-span-2 xl:col-span-1',
    },
    {
      key: 'expired',
      label: 'Expired Items',
      value: formatNumber(summary.expiredCount),
      hint: summary.expiredCount > 0 ? 'Items with expired batches to dispose' : 'No expired batches in stock',
      icon: <CalendarX className="w-5 h-5" />,
      tone: 'expired',
      onClick: () => navigate('/admin/inventory'),
      actionLabel: 'Open inventory',
      className: 'lg:col-span-2 xl:col-span-1',
    },
    {
      key: 'transactions',
      label: 'Transactions',
      value: movement ? formatNumber(movement.transactionsCount) : EMPTY_VALUE,
      hint: movement ? `${formatNumber(movement.incomingCount)} incoming · ${formatNumber(movement.outgoingCount)} issued · ${formatNumber(movement.disposalCount)} disposed` : 'Active transactions recorded',
      icon: <ArrowLeftRight className="w-5 h-5" />,
      tone: 'sage',
      onClick: () => navigate('/admin/transactions'),
      actionLabel: 'Open transactions',
      className: 'sm:col-span-2 xl:col-span-1',
    },
  ];

  // Available, low and out of stock add up to the active items (see getDashboardSummaryApi).
  const statusSegments = [
    { key: 'available', label: 'Available', value: summary.availableCount, bar: 'bg-brand' },
    { key: 'low', label: 'Low Stock', value: summary.lowStockCount, bar: 'bg-low-stock-accent' },
    { key: 'out', label: 'Out of Stock', value: summary.outOfStockCount, bar: 'bg-out-of-stock' },
  ];
  const statusPercentages = wholePercentages(statusSegments.map((segment) => segment.value));

  // Diverging chart: months run along the bottom and quantities up the side. Each month's
  // incoming quantity rises above the zero line (stock added) and its outgoing quantity drops
  // below it (stock removed: issues and expired disposals). The service returns both as positive
  // totals; outgoing is only drawn as negative, the data itself is not changed.
  // Both halves share one scale, round and at or above the busiest month.
  const maxMovement = Math.max(0, ...stockMovement.flatMap((month) => [month.incoming, month.outgoing]));
  const axisMax = Math.max(MIN_AXIS_MAX, Math.ceil(maxMovement / AXIS_INTERVAL) * AXIS_INTERVAL);
  // Tick values top to bottom: +axisMax ... 0 ... -axisMax (e.g. 400, 200, 0, -200, -400).
  const axisTicks = Array.from({ length: (2 * axisMax) / AXIS_INTERVAL + 1 }, (_, index) => axisMax - index * AXIS_INTERVAL);
  const barHeight = (value) => `${axisMax ? (value / axisMax) * 50 : 0}%`;
  // Distance from the top of the plot: +axisMax at 0%, zero at 50%, -axisMax at 100%.
  const axisTop = (tick) => `${50 - (tick / axisMax) * 50}%`;

  // The banner's buttons. Counts appear once their data has loaded and are never made up.
  const heroActions = [
    {
      key: 'alerts',
      label: 'Alerts need attention',
      Icon: AlertTriangle,
      iconClass: 'text-out-of-stock-text',
      count: allAlerts ? allAlerts.length : undefined,
      ariaLabel: allAlerts ? `Alerts need attention: ${allAlerts.length}. Open notifications` : 'Alerts need attention. Open notifications',
      onClick: () => navigate('/admin/notifications'),
      variant: 'light',
    },
    {
      key: 'transactions',
      label: 'Transactions recorded',
      Icon: ArrowLeftRight,
      count: movement ? movement.transactionsCount : undefined,
      ariaLabel: movement ? `Transactions recorded: ${movement.transactionsCount}. Open transactions` : 'Transactions recorded. Open transactions',
      onClick: () => navigate('/admin/transactions'),
      variant: 'dark',
    },
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 bg-dashboard-bg min-w-0">
      <DashboardHero
        title={`Welcome back, ${user?.name || 'Admin'}`}
        subtitle="Here's what's happening with your inventory today."
        actions={heroActions}
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      <DashboardStats stats={stats} loading={firstLoad} columns="sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5" dense />

      {/* The four panels form one grid on desktop: the wide panels (Transaction Activity, Recent
          Transactions) take three of five columns, the narrow ones (Inventory Status, Important
          Alerts) two. The two panels in a row stretch to that row's height, so each pair has
          aligned edges; each row is as tall as its own content needs. Below 1024px they stack. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <DashboardPanel
          className="lg:col-span-3"
          divider={false}
          title="Transaction Activity"
          subtitle={`Stock in ↑ and out ↓ by month · Last ${MOVEMENT_MONTHS} months`}
          action={<div className="hidden sm:block"><Legend /></div>}
        >
          {maxMovement === 0 ? (
            <PanelMessage>{loading ? 'Loading stock movement...' : 'No movement data recorded yet.'}</PanelMessage>
          ) : (
            <div className="p-5 sm:p-6 flex-1 flex flex-col">
              <div className="sm:hidden mb-4"><Legend /></div>
              {/* The values, for screen readers; the drawing below repeats them visually. */}
              <ul className="sr-only">
                {stockMovement.map((month) => (
                  <li key={month.month}>{`${formatMonth(month.month)}: ${formatNumber(month.incoming)} incoming, ${formatNumber(month.outgoing)} outgoing${month.disposed ? `, ${formatNumber(month.disposed)} expired stock disposed (not charted)` : ''}`}</li>
                ))}
              </ul>
              <div aria-hidden="true" className="flex-1 flex flex-col min-h-56">
                <div className="flex-1 flex gap-3">
                  {/* Quantity axis: positive (incoming) above zero, negative (outgoing) below. */}
                  <div className="relative w-10 shrink-0">
                    {axisTicks.map((tick) => (
                      <span key={tick} style={{ top: axisTop(tick) }} className={`absolute right-0 -translate-y-1/2 text-[10px] font-bold tabular-nums whitespace-nowrap ${tick === 0 ? 'text-ink' : 'text-muted'}`}>
                        {formatNumber(Math.abs(tick))}
                      </span>
                    ))}
                  </div>
                  <div className="relative flex-1 min-w-0">
                    {axisTicks.filter((tick) => tick !== 0).map((tick) => (
                      <span key={tick} style={{ top: axisTop(tick) }} className="absolute inset-x-0 border-t border-chart-grid" />
                    ))}
                    <div className="relative h-full flex justify-between gap-2 px-1 sm:px-3">
                      {stockMovement.map((month) => (
                        <div key={month.month} className="group relative flex-1 rounded-md hover:bg-dashboard-bg/80 transition-colors">
                          <div
                            style={{ height: barHeight(month.incoming) }}
                            title={`${formatMonth(month.month)} · Incoming: ↑ ${formatNumber(month.incoming)}`}
                            className="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-4 sm:w-6 bg-brand rounded-t-md transition-all duration-500 group-hover:brightness-125"
                          />
                          <div
                            style={{ height: barHeight(month.outgoing) }}
                            title={`${formatMonth(month.month)} · Outgoing: ↓ ${formatNumber(month.outgoing)}${month.disposed ? ` · Expired stock disposed (not charted): ${formatNumber(month.disposed)}` : ''}`}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 w-4 sm:w-6 bg-[#8db9a8] rounded-b-md transition-all duration-500 group-hover:brightness-90"
                          />
                        </div>
                      ))}
                    </div>
                    {/* The zero baseline, drawn over the bars so it stays visible. */}
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-brand/70" />
                  </div>
                </div>
                {/* Months along the bottom, oldest first, under their columns. */}
                <div className="flex gap-3 mt-2">
                  <span className="w-10 shrink-0" />
                  <div className="flex-1 min-w-0 flex justify-between gap-2 px-1 sm:px-3">
                    {stockMovement.map((month) => (
                      <span key={month.month} className="flex-1 text-center text-[10px] sm:text-[11px] font-bold text-muted">{formatMonth(month.month)}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel className="lg:col-span-2" divider={false} title="Inventory Status" subtitle="Active items by stock level">
          <div className="p-5 sm:p-6 flex-1 flex flex-col gap-5">
            <div>
              <span className="block text-[11px] font-bold text-muted uppercase tracking-wider">Active items</span>
              <span className="block text-3xl font-extrabold text-ink font-noto-serif leading-tight mt-1">{firstLoad ? EMPTY_VALUE : formatNumber(summary.totalItems)}</span>
            </div>

            <div
              role="img"
              aria-label={statusSegments.map((segment) => `${segment.label}: ${formatNumber(segment.value)}`).join(', ')}
              className="flex h-3 rounded-full overflow-hidden bg-donut-track gap-0.5"
            >
              {summary.totalItems > 0 && statusSegments.filter((segment) => segment.value > 0).map((segment) => (
                <span key={segment.key} title={`${segment.label}: ${formatNumber(segment.value)}`} style={{ width: `${(segment.value / summary.totalItems) * 100}%` }} className={`h-full ${segment.bar} transition-all duration-500`} />
              ))}
            </div>

            <ul className="space-y-3">
              {statusSegments.map((segment, index) => (
                <li key={segment.key} className="flex items-center gap-2.5 text-xs font-bold">
                  <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${segment.bar}`} />
                  <span className="text-muted flex-1">{segment.label}</span>
                  <span className="text-ink">{formatNumber(segment.value)}</span>
                  <span className="text-muted font-semibold w-10 text-right tabular-nums">{statusPercentages[index]}%</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 gap-3 pt-5 border-t border-chart-grid">
              <div className="rounded-xl bg-low-stock-soft border border-low-stock/30 px-3.5 py-3 flex items-start gap-2.5">
                <CalendarClock aria-hidden="true" className="w-4 h-4 text-low-stock-text shrink-0 mt-0.5" />
                <span>
                  <span className="block text-lg font-extrabold text-low-stock-text font-noto-serif leading-none">{formatNumber(summary.expiringSoonCount)}</span>
                  <span className="block text-[11px] font-bold text-low-stock-text mt-1">Expiring in {EXPIRY_WARNING_DAYS} days</span>
                </span>
              </div>
              <div className="rounded-xl bg-expired-soft border border-expired/20 px-3.5 py-3 flex items-start gap-2.5">
                <CalendarX aria-hidden="true" className="w-4 h-4 text-expired-text shrink-0 mt-0.5" />
                <span>
                  <span className="block text-lg font-extrabold text-expired-text font-noto-serif leading-none">{formatNumber(summary.expiredCount)}</span>
                  <span className="block text-[11px] font-bold text-expired-text mt-1">With expired stock</span>
                </span>
              </div>
            </div>
          </div>
        </DashboardPanel>

        <RecentTransactionsPanel
          className="lg:col-span-3"
          transactions={transactions}
          lookups={lookups}
          loading={loading}
          search={search}
          onViewAll={() => navigate('/admin/transactions')}
        />

        <ImportantAlertsPanel
          className="lg:col-span-2"
          alerts={alerts}
          count={alertCount}
          lookups={lookups}
          loading={loading}
          search={search}
          onViewAll={() => navigate('/admin/notifications')}
        />
      </div>
    </main>
  );
};

export default AdminDashboard;
