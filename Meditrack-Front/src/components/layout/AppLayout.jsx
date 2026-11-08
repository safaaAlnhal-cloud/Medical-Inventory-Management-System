import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NotificationsProvider } from '../../context/NotificationsContext';
import { ToastProvider } from '../../context/ToastContext';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const AppLayout = () => {
  // The mobile sidebar is open only for the path it was opened on, so navigating closes it.
  const [openedOnPath, setOpenedOnPath] = useState(null);
  const { pathname } = useLocation();
  const isSidebarOpen = openedOnPath === pathname;
  const setIsSidebarOpen = (open) => setOpenedOnPath(open ? pathname : null);

  return (
    <ToastProvider>
      <NotificationsProvider>
        <div className="min-h-screen bg-[#f8fafc] flex m-0 p-0 overflow-x-hidden font-['Nunito',sans-serif] text-slate-800 relative">
          {isSidebarOpen && (
            <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-slate-900/60 z-[998] md:hidden transition-opacity" />
          )}

          <div className={`fixed top-0 left-0 h-screen w-64 bg-white z-[999] transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <Sidebar />
          </div>

          <div className="flex-1 flex flex-col min-w-0 md:ml-64 w-full">
            <Navbar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} isSidebarOpen={isSidebarOpen} />
            <Outlet />
          </div>
        </div>
      </NotificationsProvider>
    </ToastProvider>
  );
};

export default AppLayout;
