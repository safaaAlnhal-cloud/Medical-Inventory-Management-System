import React, { useEffect, useRef, useState } from 'react';
import { Bell, UserCircle, Menu, X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SearchBar from '../common/SearchBar';
import { ROLE_TITLES } from '../../constants/users';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { getSearchConfig } from '../../utils/search';

const SEARCH_DEBOUNCE_MS = 300;

// The search input. The text shows immediately while typing, but ?q= (which the pages pass to
// their services) is only updated once typing pauses, so a search is not sent per keystroke.
// Navbar renders it with key={pathname}, so every page starts from its own ?q= value.
const NavbarSearch = ({ placeholder, disabled }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') || '';
  const [text, setText] = useState(urlSearch);
  // The ?q= value this input last read or wrote, to tell its own updates from outside ones.
  const committed = useRef(urlSearch);
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // ?q= was changed by something else (e.g. clicking the current page in the sidebar).
  useEffect(() => {
    if (urlSearch === committed.current) return;
    committed.current = urlSearch;
    window.clearTimeout(timer.current);
    setText(urlSearch);
  }, [urlSearch]);

  const handleSearch = (event) => {
    const value = event.target.value;
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const query = value.trim() ? value : '';
      committed.current = query;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (query) next.set('q', query); else next.delete('q');
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
  };

  return <SearchBar value={text} onChange={handleSearch} placeholder={placeholder} disabled={disabled} />;
};

const Navbar = ({ toggleSidebar, isSidebarOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { unreadCount } = useNotifications();
  const searchConfig = getSearchConfig(location.pathname);

  return (
    <>
      <div className="h-20 w-full flex-shrink-0" aria-hidden="true" />
      <header className="h-20 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-6 fixed top-0 right-0 left-0 md:left-64 z-50">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <button type="button" onClick={toggleSidebar} className="md:hidden w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer flex-shrink-0" aria-label="Toggle Sidebar">
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <NavbarSearch key={location.pathname} placeholder={searchConfig.placeholder} disabled={!searchConfig.enabled} />
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          <button type="button" onClick={() => navigate(`/${role}/notifications`)} aria-label={unreadCount > 0 ? `Open notifications (${unreadCount} unread)` : 'Open notifications'} className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-[#115e54] transition cursor-pointer">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />}
          </button>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-[#115e54] flex items-center justify-center">
              <UserCircle className="w-6 h-6" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[10px] font-semibold text-slate-400">{ROLE_TITLES[role]}</p>
              <p className="text-xs font-bold text-slate-800">{user?.name}</p>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
