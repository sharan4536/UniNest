import React from 'react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { getFriendRequests, getUnreadMessagesCount, getUserStatus } from '../utils/firebase/firestore';

type NavItem = { id: string; label: string; icon: string };
const navigationItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'discover', label: 'Discover', icon: '🔍' },
  { id: 'timetable', label: 'Timetable', icon: '📅' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'profile', label: 'Profile', icon: '👤' },
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
                  <span className="text-xl">{item.icon}</span>
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

      {/* Mobile Navigation - Fixed Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-[32px] border-t border-slate-200/50 pb-[env(safe-area-inset-bottom)] pb-1 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] transition-all">
        <div className="flex justify-around items-center px-1 h-[68px]">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className="flex-1 flex flex-col items-center justify-center h-full relative group space-y-1 active:scale-[0.92] transition-transform duration-200"
            >
              <div className={`relative flex items-center justify-center w-12 h-8 rounded-full transition-all duration-300 ${currentPage === item.id ? 'bg-sky-500/15' : 'bg-transparent'}`}>
                <span className={`text-[24px] transition-all duration-300 ${currentPage === item.id ? 'scale-110' : 'scale-100 grayscale opacity-40'}`}>
                  {item.icon}
                </span>
                {item.id === 'messages' && totalBadgeCount > 0 && (
                  <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white/80" />
                )}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide transition-all duration-300 ${currentPage === item.id ? 'text-sky-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile Header - Native iOS Minimal */}
      <div className="md:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-xl px-4 h-14 border-b border-slate-200 flex items-center justify-between pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-bold text-slate-800 tracking-tight">
            UniNest
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-8 h-8 rounded-full shadow-sm ring-1 ring-slate-200 active:opacity-70 transition-opacity" onClick={() => setCurrentPage('profile')}>
              <AvatarFallback className="bg-sky-50 text-sky-600 text-xs font-bold">
                {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {userStatus === 'available' && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
