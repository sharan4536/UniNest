import React from 'react';
import { CalendarDays, Compass, Home, MapPinned, MessageCircle, UserRound } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { getFriendRequests, getUnreadMessagesCount, getUserStatus } from '../utils/firebase/firestore';

type NavItem = { id: string; label: string; mobileLabel: string; icon: React.ComponentType<{ className?: string }> };
const navigationItems: NavItem[] = [
  { id: 'home', label: 'Home', mobileLabel: 'Map', icon: Home },
  { id: 'discover', label: 'Discover', mobileLabel: 'Find', icon: Compass },
  { id: 'timetable', label: 'Timetable', mobileLabel: 'Timetable', icon: CalendarDays },
  { id: 'messages', label: 'Messages', mobileLabel: 'Spaces', icon: MessageCircle },
  { id: 'profile', label: 'Profile', mobileLabel: 'Me', icon: UserRound },
];

export function Navigation({ currentPage, setCurrentPage, onLogout, currentUser }: {
  currentPage: string;
  setCurrentPage: (id: string) => void;
  onLogout: () => void;
  currentUser?: { name?: string; displayName?: string; university?: string } | null;
}) {
  const [pendingRequestsCount, setPendingRequestsCount] = React.useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = React.useState(0);
  const [userStatus, setUserStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Subscribe to pending friend requests
    const unsubscribeRequests = getFriendRequests((requests) => {
      setPendingRequestsCount(requests.length);
    });

    // Subscribe to unread messages across all conversations
    const unsubscribeUnread = getUnreadMessagesCount((count) => {
      setUnreadMessagesCount(count);
    });

    const fetchStatus = async () => {
      try {
        const s = await getUserStatus();
        setUserStatus(s);
      } catch (e) {}
    };
    fetchStatus();
    
    // Refresh status periodically purely for the UI indication 
    const statusInterval = setInterval(fetchStatus, 30000);

    return () => {
      unsubscribeRequests && unsubscribeRequests();
      unsubscribeUnread && unsubscribeUnread();
      clearInterval(statusInterval);
    };
  }, []);

  const totalBadgeCount = unreadMessagesCount || 0;
  const requestBadgeCount = pendingRequestsCount || 0;

  return (
    <>
      {/* Desktop Navigation - App Native Left Sidebar */}
      <nav className="hidden md:flex flex-col w-64 h-full bg-white border-r border-slate-100 z-40 p-5 justify-between shrink-0 shadow-[2px_0_12px_rgba(0,0,0,0.02)]">
        <div>
          {/* Brand/Logo */}
          <div className="flex items-center gap-3 mb-10 px-2 select-none cursor-pointer" onClick={() => setCurrentPage('home')}>
            <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <span className="text-sm">🏫</span>
            </div>
            <span className="text-[17px] font-bold text-slate-800 tracking-tight">
              UniNest
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ms-2">Menu</div>
            {navigationItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => setCurrentPage(item.id)}
                className={`justify-start rounded-xl px-3 py-6 transition-colors duration-200 font-medium text-[15px] flex items-center gap-4 relative overflow-hidden ${currentPage === item.id
                  ? 'bg-sky-50/80 text-sky-600'
                  : 'text-slate-600 hover:text-sky-600 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center justify-center w-6">
                  <item.icon className="h-5 w-5" />
                </div>
                <span>{item.label}</span>
                {item.id === 'messages' && totalBadgeCount > 0 && (
                  <span className="absolute right-3 w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {totalBadgeCount}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* User Profile Area at Bottom */}
        <div className="pt-4 border-t border-slate-100">
          <div 
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer select-none"
            onClick={() => setCurrentPage('profile')}
          >
            <Avatar className="w-10 h-10 ring-1 ring-slate-200">
              <AvatarFallback className="bg-sky-50 text-sky-600 font-bold text-sm">
                {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-800 truncate">{currentUser?.name || currentUser?.displayName}</p>
              <p className="text-[12px] text-slate-400 truncate">View Profile</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={onLogout}
            className="w-full mt-2 justify-start px-3 py-5 text-[14px] font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <span className="w-6 text-center me-4">↪️</span>
            Logout
          </Button>
        </div>
      </nav>

      {/* Mobile Navigation - Shared Bottom Nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="relative w-full rounded-t-[32px] bg-white/80 shadow-[0_-8px_32px_rgba(41,48,48,0.05)] backdrop-blur-[32px]">
          <div className="grid h-24 w-full grid-cols-5 items-start px-2 pt-4">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className="relative flex min-w-0 flex-col items-center justify-start gap-[3px] rounded-2xl px-1 py-1 transition-transform duration-200 active:scale-[0.94]"
              aria-label={item.label}
            >
              <div className={`relative flex h-8 items-center justify-center transition-all duration-300 ${currentPage === item.id ? 'text-sky-800' : 'text-zinc-600/70'}`}>
                <item.icon className={`${item.id === 'timetable' ? 'h-5 w-5' : 'h-4.5 w-4.5'} ${currentPage === item.id ? 'stroke-[2.3]' : ''}`} />
                {item.id === 'messages' && totalBadgeCount > 0 && (
                  <span className="absolute -right-1 top-0 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white/80" />
                )}
                {item.id === 'discover' && requestBadgeCount > 0 && (
                  <span className="absolute -right-1 top-0 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white/80" />
                )}
              </div>
              <span className={`max-w-full truncate text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] transition-all duration-300 ${currentPage === item.id ? 'text-sky-800' : 'text-zinc-600/80'}`}>
                {item.mobileLabel}
              </span>
              {currentPage === item.id && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-sky-800" />
              )}
            </button>
          ))}
          </div>
        </div>
      </nav>

    </>
  );
}
