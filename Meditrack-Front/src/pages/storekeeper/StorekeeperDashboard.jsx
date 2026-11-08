import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CalendarX, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '../../components/common/DataState';
import { ImportantAlertsPanel, RecentTransactionsPanel } from '../../components/dashboard/ActivityPanels';
import DashboardHero from '../../components/dashboard/DashboardHero';
import DashboardStats from '../../components/dashboard/DashboardStats';
import { useAuth } from '../../context/AuthContext';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useLookups } from '../../hooks/useLookups';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getCriticalAlertsApi, getDashboardSummaryApi, getRecentTransactionsApi } from '../../services/dashboardApi';
import { getNotificationsApi } from '../../services/notificationsApi';
import { formatNumber } from '../../utils/formatters';
import { EXPIRY_WARNING_DAYS } from '../../utils/stock';

const EMPTY_SUMMARY = { totalItems: 0, availableCount: 0, lowStockCount: 0, outOfStockCount: 0, expiringSoonCount: 0, expiredCount: 0 };
const EMPTY_LIST = [];

const TRANSACTIONS_LIMIT = 6;
const ALERTS_SHOWN = 5;

const INVENTORY_PATH = '/storekeeper/inventory';
const TRANSACTIONS_PATH = '/storekeeper/transactions';
const NOTIFICATIONS_PATH = '/storekeeper/notifications';

const StorekeeperDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearchQuery();
  const lookups = useLookups();

  // Each section is its own request: if one fails, the others are still shown. The alerts are
  // chosen exactly as on the Admin Dashboard: the most severe first (getCriticalAlertsApi), and
  // the badge counts every alert matching the search.
  const sections = useMemo(() => ({
    summary: { load: getDashboardSummaryApi, empty: EMPTY_SUMMARY, label: 'summary' },
    alerts: { load: () => getCriticalAlertsApi({ search, limit: ALERTS_SHOWN }), empty: EMPTY_LIST, label: 'alerts' },
    matchingAlerts: { load: () => getNotificationsApi({ search }), empty: null, label: 'alert count' },
    transactions: { load: () => getRecentTransactionsApi({ search, limit: TRANSACTIONS_LIMIT }), empty: EMPTY_LIST, label: 'recent transactions' },
  }), [search]);

  const { data, loading, error, reload } = useDashboardData(sections);
  const { summary, alerts, matchingAlerts, transactions } = data;
  // Nothing has arrived yet (a later search keeps the previous figures on screen while it loads).
  const firstLoad = loading && summary === EMPTY_SUMMARY;

  const openInventory = () => navigate(INVENTORY_PATH);
  const stats = [
    {
      key: 'available',
      label: 'Available Items',
      value: formatNumber(summary.availableCount),
      hint: `Of ${formatNumber(summary.totalItems)} items, above minimum stock`,
      icon: <CheckCircle2 className="w-5 h-5" />,
      tone: 'forest',
      onClick: openInventory,
      actionLabel: 'Open inventory',
    },
    {
      key: 'low',
      label: 'Low Stock Items',
      value: formatNumber(summary.lowStockCount),
      hint: summary.outOfStockCount > 0 ? `Plus ${formatNumber(summary.outOfStockCount)} out of stock` : 'At or below minimum stock',
      icon: <AlertTriangle className="w-5 h-5" />,
      tone: 'amber',
      onClick: openInventory,
      actionLabel: 'Open inventory',
    },
    {
      key: 'expired',
      label: 'Expired Stock',
      value: formatNumber(summary.expiredCount),
      hint: summary.expiredCount > 0 ? 'Items with expired batches to dispose' : 'No expired batches in stock',
      icon: <CalendarX className="w-5 h-5" />,
      tone: 'expired',
      onClick: openInventory,
      actionLabel: 'Open inventory',
    },
    {
      key: 'expiring',
      label: 'Expiring Soon',
      value: formatNumber(summary.expiringSoonCount),
      hint: `Items with batches expiring within ${EXPIRY_WARNING_DAYS} days`,
      icon: <CalendarClock className="w-5 h-5" />,
      tone: 'amber',
      onClick: openInventory,
      actionLabel: 'Open inventory',
    },
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 bg-dashboard-bg">
      <DashboardHero
        title={`Welcome back, ${user?.name || 'Storekeeper'}`}
        subtitle="Let's keep the inventory up to date."
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      <DashboardStats stats={stats} loading={firstLoad} />

      {/* The same two panels as the Admin Dashboard: Recent Transactions takes about 65% of the
          row on the left, Important Alerts about 35% on the right. Both stretch to the row's
          height, so their edges line up. Below 1024px they stack, Recent Transactions first. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] gap-6">
        <RecentTransactionsPanel
          className="min-w-0"
          transactions={transactions}
          lookups={lookups}
          loading={loading}
          search={search}
          onViewAll={() => navigate(TRANSACTIONS_PATH)}
        />

        <ImportantAlertsPanel
          className="min-w-0"
          alerts={alerts}
          count={matchingAlerts?.length ?? alerts.length}
          lookups={lookups}
          loading={loading}
          search={search}
          onViewAll={() => navigate(NOTIFICATIONS_PATH)}
        />
      </div>
    </main>
  );
};

export default StorekeeperDashboard;
