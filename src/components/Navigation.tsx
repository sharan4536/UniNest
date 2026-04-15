import React from 'react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { getFriendRequests, getUnreadMessagesCount } from '../utils/firebase/firestore';

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

  React.useEffect(() => {
    // Subscribe to pending friend requests
    const unsubscribeRequests = getFriendRequests((requests) => {
      setPendingRequestsCount(requests.length);
    });

    // Subscribe to unread messages across all conversations
    const unsubscribeUnread = getUnreadMessagesCount((count) => {
      setUnreadMessagesCount(count);
    });

    return () => {
      unsubscribeRequests && unsubscribeRequests();
      unsubscribeUnread && unsubscribeUnread();
    };
  }, []);

  const totalBadgeCount = unreadMessagesCount;
  return (
    <>
      {/* Desktop Navigation - Minimal Floating Header */}
      <nav className="hidden md:block fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 w-auto max-w-5xl">
        <div className="glass-panel rounded-full px-6 py-3 flex items-center gap-8 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-[0_8px_32px_0_rgba(31,38,135,0.12)] transition-shadow duration-300">
          <div className="flex items-center gap-3 hover:scale-105 transition-transform duration-300 cursor-pointer" onClick={() => setCurrentPage('home')}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-200/50 text-white">
              <span className="text-lg">🏫</span>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600 tracking-tight">
              UniNest
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-50/50 p-1.5 rounded-full border border-slate-100 shadow-inner">
            {navigationItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => setCurrentPage(item.id)}
                className={`relative rounded-full px-5 py-2 transition-all duration-300 font-medium text-sm flex items-center gap-2 ${currentPage === item.id
                  ? 'bg-white text-sky-600 shadow-[0_2px_10px_rgb(0,0,0,0.06)]'
                  : 'text-slate-500 hover:text-sky-500 hover:bg-white/60'
                  }`}
              >
                <span className="text-lg transition-transform duration-300 group-hover:scale-110">{item.icon}</span>
                <span className="hidden lg:inline font-medium">{item.label}</span>
                {item.id === 'messages' && totalBadgeCount > 0 && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-slate-400 border border-white" />
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-4 pl-4 border-l border-slate-100">

            <div className="flex items-center gap-3 text-right group cursor-pointer" onClick={() => setCurrentPage('profile')}>
              <div className="hidden lg:block transition-all duration-300 group-hover:translate-x-1">
                <p className="text-sm font-semibold text-slate-700">{currentUser?.name || currentUser?.displayName}</p>
              </div>
              <Avatar className="w-10 h-10 ring-2 ring-white shadow-md group-hover:ring-sky-200 transition-all duration-300 group-hover:scale-105">
                <AvatarFallback className="bg-gradient-to-br from-sky-100 to-blue-50 text-sky-600 font-bold">
                  {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full px-4 transition-colors"
            >
              Logout
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Soft Floating Dock */}
      <nav className="md:hidden fixed bottom-6 left-4 right-4 z-50">
        <div className="glass-panel rounded-full p-2 flex justify-between items-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60">
          {navigationItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => setCurrentPage(item.id)}
              className={`flex flex-col items-center justify-center gap-1 h-12 w-12 rounded-full relative transition-all duration-300 ${currentPage === item.id
                ? 'bg-sky-50 text-sky-600 -translate-y-4 shadow-lg shadow-sky-100 ring-4 ring-white scale-110'
                : 'text-slate-400 hover:text-sky-500 hover:bg-sky-50/50'
                }`}
            >
              <span className="text-xl drop-shadow-sm transition-transform duration-300 active:scale-95">{item.icon}</span>
              {item.id === 'messages' && totalBadgeCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white" />
              )}
            </Button>
          ))}
        </div>
      </nav>

      {/* Mobile Header - Ultra Minimal */}
      <div className="md:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-lg px-4 py-3 border-b border-white/50 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md shadow-sky-200/50 text-white">
            <span className="text-sm">🏫</span>
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600">
            UniNest
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50"
          >
            <span className="text-lg">↪️</span>
          </Button>
          <Avatar className="w-8 h-8 ring-2 ring-white shadow-sm" onClick={() => setCurrentPage('profile')}>
            <AvatarFallback className="bg-sky-50 text-sky-600 text-xs font-bold">
              {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </>
  );
}
