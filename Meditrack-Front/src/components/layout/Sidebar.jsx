// src/components/layout/Sidebar.jsx

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

import AdminQuickActions from './AdminQuickActions';
import StorekeeperQuickActions from './StorekeeperQuickActions';

import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  TrendingUp,
  Bell,
  Settings,
  User,
  LogOut,
} from 'lucide-react';

const Sidebar = () => {
  const navigate = useNavigate();
  const { logout, role } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navLinkClass = ({ isActive }) =>
    `
      flex
      items-center
      gap-3.5
      px-3.5
      py-3
      rounded-xl
      transition
      ${
        isActive
          ? 'bg-white/10 text-white font-bold'
          : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
      }
    `;

  return (
    <aside
      className="
        w-64
        bg-[#0a3832]
        text-white
        flex
        flex-col
        justify-between
        h-screen
        p-6
        select-none
        font-['Nunito',sans-serif]
        m-0
        border-r
        border-[#0a3832]
        overflow-y-auto
      "
    >
      {/* TOP */}
      <div>
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 -ml-1">
          <div
            aria-hidden="true"
            className="
              w-9
              h-9
              rounded-xl
              bg-[#0f4e43]
              flex
              items-center
              justify-center
              text-white
              shadow-sm
              flex-shrink-0
            "
          >
            <svg
              className="w-4.5 h-4.5 fill-current"
              viewBox="0 0 24 24"
            >
              <path d="M19 6h-3V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3Zm-9-2h4v2h-4V4Zm6 9h-3v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1 0-2h3V8a1 1 0 0 1 2 0v3h3a1 1 0 0 1 0 2Z" />
            </svg>
          </div>

          <span className="text-xl font-bold text-white tracking-tight font-noto-serif">
            MediTrack
          </span>
        </div>

        {/* Quick Actions */}
        {role === 'admin' ? <AdminQuickActions /> : <StorekeeperQuickActions />}

        {/* Navigation */}
        <nav className="space-y-1 text-xs font-semibold">
          {role === 'admin' ? (
            <>
              <NavLink to="/admin/dashboard" className={navLinkClass}>
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </NavLink>

              <NavLink to="/admin/inventory" className={navLinkClass}>
                <Package className="w-4 h-4" />
                Inventory
              </NavLink>

              <NavLink to="/admin/transactions" className={navLinkClass}>
                <ArrowLeftRight className="w-4 h-4" />
                Transactions
              </NavLink>

              <NavLink to="/admin/users" className={navLinkClass}>
                <Users className="w-4 h-4" />
                Users
              </NavLink>

              <NavLink to="/admin/reports" className={navLinkClass}>
                <TrendingUp className="w-4 h-4" />
                Reports
              </NavLink>

              <NavLink to="/admin/notifications" className={navLinkClass}>
                <Bell className="w-4 h-4" />
                Notifications
              </NavLink>

              <NavLink to="/admin/settings" className={navLinkClass}>
                <Settings className="w-4 h-4" />
                Settings
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/storekeeper/dashboard" className={navLinkClass}>
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </NavLink>

              <NavLink to="/storekeeper/inventory" className={navLinkClass}>
                <Package className="w-4 h-4" />
                Inventory
              </NavLink>

              <NavLink to="/storekeeper/transactions" className={navLinkClass}>
                <ArrowLeftRight className="w-4 h-4" />
                Transactions
              </NavLink>

              <NavLink to="/storekeeper/notifications" className={navLinkClass}>
                <Bell className="w-4 h-4" />
                Notifications
              </NavLink>

              <NavLink to="/storekeeper/profile" className={navLinkClass}>
                <User className="w-4 h-4" />
                Profile
              </NavLink>
            </>
          )}
        </nav>
      </div>

      {/* LOGOUT */}
      <div className="pt-4 border-t border-emerald-900/60">
        <button
          type="button"
          onClick={handleLogout}
          className="
            w-full
            flex
            items-center
            gap-3
            px-3.5
            py-2.5
            rounded-xl
            text-red-300
            hover:bg-red-500/10
            hover:text-red-200
            transition
            text-xs
            font-bold
            cursor-pointer
          "
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;