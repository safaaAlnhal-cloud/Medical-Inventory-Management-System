import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, AlertOctagon, UserX } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/DataState';
import PageHeader from '../../components/common/PageHeader';
import { isAccountAlert, NOTIFICATION_TYPES } from '../../constants/inventory';
import { useNotifications } from '../../context/NotificationsContext';
import { useToast } from '../../context/ToastContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useLookups } from '../../hooks/useLookups';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getErrorMessage } from '../../services/apiError';
import { getNotificationsApi, markAllNotificationsReadApi, markNotificationReadApi } from '../../services/notificationsApi';
import { formatRelativeTime } from '../../utils/formatters';
import { describeNotification } from '../../utils/notifications';

const EMPTY_LIST = [];
const TABS = [
  { id: 'all', label: 'All' },
  { id: NOTIFICATION_TYPES.LOW_STOCK, label: 'Low Stock' },
  { id: NOTIFICATION_TYPES.EXPIRING, label: 'Expiry' },
  { id: NOTIFICATION_TYPES.OUT_OF_STOCK, label: 'Out of Stock' },
  // Both account alert types: only the admin and the account's owner receive them.
  { id: 'accounts', label: 'Accounts' },
];

// The tab a notification belongs to: its type, or "accounts" for the two account types.
const tabOf = (notification) => (isAccountAlert(notification) ? 'accounts' : notification.type);

const NotificationIcon = ({ tone, account }) => (account ? (
  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${tone === 'danger' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
    <UserX className={`w-5 h-5 ${tone === 'danger' ? 'text-rose-500' : 'text-amber-500'}`} />
  </div>
) : tone === 'danger' ? (
  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
    <AlertOctagon className="w-5 h-5 text-rose-500" />
  </div>
) : (
  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
    <AlertTriangle className="w-5 h-5 text-amber-500" />
  </div>
));

const NotificationsPage = () => {
  const search = useSearchQuery();
  const lookups = useLookups();
  const { showError } = useToast();
  const { refreshUnreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState('all');

  const loadNotifications = useCallback(() => getNotificationsApi({ search }), [search]);
  const { data: notifications, loading, error, reload, setData } = useAsyncData(loadNotifications, EMPTY_LIST);

  // Tab counts always reflect the notifications currently loaded.
  const counts = useMemo(() => {
    const result = { all: notifications.length };
    for (const notification of notifications) result[tabOf(notification)] = (result[tabOf(notification)] || 0) + 1;
    return result;
  }, [notifications]);

  const visibleNotifications = activeTab === 'all' ? notifications : notifications.filter((notification) => tabOf(notification) === activeTab);
  const hasUnread = notifications.some((notification) => !notification.read);

  const handleMarkAsRead = async (id) => {
    try {
      const updated = await markNotificationReadApi(id);
      setData((current) => current.map((notification) => (notification.id === id ? updated : notification)));
      refreshUnreadCount();
    } catch (err) {
      showError(getErrorMessage(err, 'Could not update the notification.'));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsReadApi();
      setData((current) => current.map((notification) => ({ ...notification, read: true })));
      refreshUnreadCount();
    } catch (err) {
      showError(getErrorMessage(err, 'Could not update the notifications.'));
    }
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
      <PageHeader
        title="Notifications & Alerts"
        subtitle="Stay on top of stock shortages, expiry risks and expiring accounts."
        actions={(
          <button type="button" onClick={handleMarkAllAsRead} disabled={!hasUnread} className="text-xs font-bold text-[#115e54] hover:underline transition cursor-pointer disabled:text-slate-400 disabled:no-underline disabled:cursor-default">
            Mark all as read
          </button>
        )}
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[#115e54] text-white shadow-sm'
                : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{tab.label}</span>
            {!loading && (
              <span className={`px-2 py-0.5 rounded-lg text-[10px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {counts[tab.id] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <LoadingState message="Loading notifications..." />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : visibleNotifications.length === 0 ? (
          <EmptyState message={search ? 'No notifications match your search.' : 'No notifications found in this category.'} />
        ) : (
          visibleNotifications.map((notification) => {
            const { tone, title, description } = describeNotification(notification, lookups);
            return (
              <div
                key={notification.id}
                className={`card-hover bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4 transition hover:border-slate-300 ${notification.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <NotificationIcon tone={tone} account={isAccountAlert(notification)} />
                  <div className="min-w-0">
                    <h4 className="text-xs font-extrabold text-slate-900 mb-0.5 truncate flex items-center gap-2">
                      {!notification.read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="Unread" />}
                      <span className="truncate">{title}</span>
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold">{description}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] text-slate-400 font-semibold">{formatRelativeTime(notification.createdAt)}</span>
                  {!notification.read && (
                    <button type="button" onClick={() => handleMarkAsRead(notification.id)} className="text-[11px] font-bold text-[#115e54] hover:underline cursor-pointer">
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
};

export default NotificationsPage;
