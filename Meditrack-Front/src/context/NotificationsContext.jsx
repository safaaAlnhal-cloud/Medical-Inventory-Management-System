import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getUnreadNotificationsCountApi } from '../services/notificationsApi';

const NotificationsContext = createContext(null);

// Holds the unread notification count shown as the red dot in the Navbar.
// It refreshes on every navigation, and pages call refreshUnreadCount() after an action
// that can change it (marking as read, recording a transaction, editing an item).
export const NotificationsProvider = ({ children }) => {
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(() => {
    // The badge is a hint only: if the count cannot be loaded it keeps its last value.
    getUnreadNotificationsCountApi().then(setUnreadCount).catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnreadCount();
  }, [pathname, refreshUnreadCount]);

  const value = useMemo(() => ({ unreadCount, refreshUnreadCount }), [unreadCount, refreshUnreadCount]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
};
