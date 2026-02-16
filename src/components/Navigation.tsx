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

  const totalBadgeCount = pendingRequestsCount + unreadMessagesCount;
  return (
    <>
      {/* Desktop Navigation - Top Bar */}
      <nav className="hidden md:block sticky top-0 z-40 border-b" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C6ECFF' }}>
                <span className="text-lg">🏫</span>
              </div>
              <span className="text-xl font-medium">UniNest</span>
            </div>
            
            <div className="flex items-center gap-1">
              {navigationItems.map((item) => (
                <Button
                  key={item.id}
                  variant={currentPage === item.id ? "default" : "ghost"}
                  onClick={() => setCurrentPage(item.id)}
                  className="flex items-center gap-2"
                  style={{
                    backgroundColor: currentPage === item.id ? '#C6ECFF' : 'transparent',
                    color: currentPage === item.id ? '#000' : undefined
                  }}
                >
                  <span>{item.icon}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                  {item.id === 'messages' && totalBadgeCount > 0 && (
                    <Badge variant="destructive" className="w-5 h-5 p-0 text-xs flex items-center justify-center ml-1">
                      {totalBadgeCount}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-sm">
                    {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium">{currentUser?.name || currentUser?.displayName}</p>
                  <p className="text-xs opacity-75">{currentUser?.university}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="text-xs"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="grid grid-cols-6 gap-1 p-2">
          {navigationItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => setCurrentPage(item.id)}
              className={`flex flex-col items-center gap-1 h-12 p-1 relative ${
                currentPage === item.id ? 'bg-opacity-20' : ''
              }`}
              style={{
                backgroundColor: currentPage === item.id ? '#C6ECFF' : 'transparent',
              }}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
              {item.id === 'messages' && totalBadgeCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 w-4 h-4 p-0 text-xs flex items-center justify-center"
                >
                  {totalBadgeCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </nav>

      {/* Mobile Header */}
      <div className="md:hidden sticky top-0 z-30 border-b p-4" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C6ECFF' }}>
              <span className="text-lg">🏫</span>
            </div>
            <span className="text-xl font-medium">UniNest</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-sm">
                {(currentUser?.name || currentUser?.displayName || 'U')?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="text-xs"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
