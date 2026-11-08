import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { getHomePath, ROLES } from '../constants/users';
import Login from '../pages/auth/Login';
import LandingPage from '../pages/landing/LandingPage';
import AdminDashboard from '../pages/admin/AdminDashboard';
import ReportsPage from '../pages/admin/ReportsPage';
import SettingsPage from '../pages/admin/SettingsPage';
import UsersPage from '../pages/admin/UsersPage';
import InventoryPage from '../pages/shared/InventoryPage';
import NotificationsPage from '../pages/shared/NotificationsPage';
import TransactionsPage from '../pages/shared/TransactionsPage';
import ProfilePage from '../pages/storekeeper/ProfilePage';
import StorekeeperDashboard from '../pages/storekeeper/StorekeeperDashboard';
import ProtectedRoute from './ProtectedRoute';
import RoleGuard from './RoleGuard';
import { useAuth } from '../context/AuthContext';

const HomeRedirect = () => {
  const { role } = useAuth();
  return <Navigate to={getHomePath(role)} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route element={<RoleGuard allowedRoles={[ROLES.ADMIN]} />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/inventory" element={<InventoryPage />} />
          <Route path="/admin/transactions" element={<TransactionsPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/notifications" element={<NotificationsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<RoleGuard allowedRoles={[ROLES.STOREKEEPER]} />}>
          <Route path="/storekeeper/dashboard" element={<StorekeeperDashboard />} />
          <Route path="/storekeeper/inventory" element={<InventoryPage />} />
          <Route path="/storekeeper/transactions" element={<TransactionsPage />} />
          <Route path="/storekeeper/notifications" element={<NotificationsPage />} />
          <Route path="/storekeeper/profile" element={<ProfilePage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes>
);

export default AppRoutes;
