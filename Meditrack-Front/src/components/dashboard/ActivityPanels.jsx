import React from 'react';
import { NOTIFICATION_TYPES } from '../../constants/inventory';
import { formatNumber } from '../../utils/formatters';
import { describeNotification } from '../../utils/notifications';
import DashboardPanel, { AlertRow, PanelAction, PanelMessage } from './DashboardPanel';
import RecentTransactionsTable from './RecentTransactionsTable';

// The Recent Transactions and Important Alerts panels, shared by the Admin and Storekeeper
// dashboards. Each dashboard loads the data its role may see and passes it in, together with
// where its "View all" buttons lead. `lookups` comes from useLookups().

// A stock alert carries its status as its type; an expiry alert carries it as expiryStatus.
const alertStatus = (alert) => (alert.type === NOTIFICATION_TYPES.EXPIRING ? alert.expiryStatus : alert.type);

export const RecentTransactionsPanel = ({ transactions, lookups, loading, search, onViewAll, className = '' }) => (
  <DashboardPanel
    className={className}
    title="Recent Transactions"
    subtitle="Latest supply movements and dispatches"
    action={<PanelAction onClick={onViewAll}>View all</PanelAction>}
  >
    <RecentTransactionsTable
      transactions={transactions}
      lookups={lookups}
      loading={loading && transactions.length === 0}
      emptyMessage={search ? 'No transactions match your search.' : 'No recent transactions recorded yet.'}
    />
  </DashboardPanel>
);

//   alerts: the alerts to list (Notification model); count: how many alerts match in total
export const ImportantAlertsPanel = ({ alerts, count, lookups, loading, search, onViewAll, className = '' }) => (
  <DashboardPanel
    className={className}
    title={(
      <span className="inline-flex items-center gap-2">
        Important Alerts
        {count > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-danger-soft text-out-of-stock-text border border-out-of-stock/30 text-[11px] font-bold font-nunito">{formatNumber(count)}</span>
        )}
      </span>
    )}
    subtitle="Expired, low and expiring stock"
    action={<PanelAction onClick={onViewAll}>View all</PanelAction>}
  >
    {alerts.length === 0 ? (
      <PanelMessage>
        {loading ? 'Loading alerts...' : search ? 'No alerts match your search.' : 'No critical alerts. Everything is clear!'}
      </PanelMessage>
    ) : (
      // On desktop the list fills the panel: the alerts share its height evenly.
      <ul className="flex-1 flex flex-col divide-y divide-chart-grid">
        {alerts.map((alert) => {
          const { title, description } = describeNotification(alert, lookups);
          return (
            <AlertRow key={alert.id} title={title} description={description} status={alertStatus(alert)} onClick={onViewAll} actionLabel="Open notifications" compact fill />
          );
        })}
      </ul>
    )}
  </DashboardPanel>
);
