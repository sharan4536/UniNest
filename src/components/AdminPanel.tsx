import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Megaphone, 
  Bell, 
  BarChart3, 
  Users, 
  Settings,
  Plus,
  Search,
  TrendingUp,
  MapPin,
  Eye,
  MousePointer2,
  DollarSign,
  Menu,
  X,
  Radio
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  getDashboardStats, 
  type DashboardStats,
  getAllAdsRealtime,
  getUpcomingEventsRealtime,
  getAllNotificationsRealtime,
  type Advertisement,
  type CampusEvent,
  type AdminNotification
} from '../utils/firebase/firestore';
import { EventManagement } from './admin/EventManagement';
import { AdManagement } from './admin/AdManagement';
import { NotificationManagement } from './admin/NotificationManagement';
import { UserManagement } from './admin/UserManagement';
import { PulseManagement } from './admin/PulseManagement';

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      const data = await getDashboardStats();
      setStats(data);
      setLoading(false);
    }
    fetchStats();

    // Refresh stats when major data changes
    const unsubEvents = getUpcomingEventsRealtime(() => fetchStats());
    const unsubAds = getAllAdsRealtime(() => fetchStats());
    const unsubNotifs = getAllNotificationsRealtime(() => fetchStats());

    return () => {
      unsubEvents();
      unsubAds();
      unsubNotifs();
    };
  }, []);

  const SidebarItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsMobileMenuOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        activeTab === id 
          ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' 
          : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 2} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col p-6 gap-8 transition-transform duration-300 lg:relative lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <Settings size={20} />
            </div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">Admin Console</span>
          </div>
          <button 
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem id="overview" label="Dashboard" icon={LayoutDashboard} />
          <SidebarItem id="events" label="Events" icon={Calendar} />
          <SidebarItem id="ads" label="Advertisements" icon={Megaphone} />
          <SidebarItem id="notifications" label="Notifications" icon={Bell} />
          <SidebarItem id="pulses" label="User Pulses" icon={Radio} />
          <SidebarItem id="analytics" label="Analytics" icon={BarChart3} />
          <SidebarItem id="users" label="User Management" icon={Users} />
        </nav>

        <div className="mt-auto p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">System Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-slate-700">All systems operational</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <header className="flex flex-col gap-4 mb-8 lg:flex-row lg:justify-between lg:items-center">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 capitalize">{activeTab}</h1>
              <p className="text-sm text-slate-500">Manage your campus ecosystem</p>
            </div>
            <button 
              className="lg:hidden p-2 bg-white border border-slate-100 rounded-xl text-slate-600 shadow-sm"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input className="pl-10 w-full bg-white border-slate-200 rounded-xl" placeholder="Search anything..." />
            </div>
            <Button className="rounded-xl gap-2 bg-sky-500 hover:bg-sky-600 w-full sm:w-auto">
              <Plus size={18} />
              Create New
            </Button>
          </div>
        </header>

        {activeTab === 'overview' && stats && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard 
                title="Total Users" 
                value={stats.totalUsers.toLocaleString()} 
                icon={Users} 
                trend="+12%" 
                color="blue"
              />
              <StatCard 
                title="Active Ads" 
                value={stats.activeAds.toString()} 
                icon={Megaphone} 
                trend="+5" 
                color="orange"
              />
              <StatCard 
                title="Ad Impressions" 
                value={stats.totalImpressions.toLocaleString()} 
                icon={Eye} 
                trend="+1.2k" 
                color="purple"
              />
              <StatCard 
                title="Revenue (Est)" 
                value={`$${(stats.totalClicks * 0.5).toFixed(2)}`} 
                icon={DollarSign} 
                trend="+18%" 
                color="emerald"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Recent Activity */}
              <Card className="lg:col-span-2 border-none shadow-sm rounded-3xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-50">
                  <CardTitle className="text-lg">Real-time Performance</CardTitle>
                  <CardDescription>Engagement across all features in the last 24h</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[300px] flex items-center justify-center text-slate-400 italic">
                    [Analytics Chart Placeholder]
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions / Recent Events */}
              <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-50">
                  <CardTitle className="text-lg">Recent Alerts</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <AlertItem title="Ad Campaign Expiring" desc="Campus Cafe promo ends in 2h" time="10m ago" type="warning" />
                  <AlertItem title="New Event Request" desc="GDSC Workshop needs approval" time="45m ago" type="info" />
                  <AlertItem title="System Update" desc="Push notification gateway updated" time="3h ago" type="success" />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'events' && <EventManagement />}
        {activeTab === 'ads' && <AdManagement />}
        {activeTab === 'notifications' && <NotificationManagement />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'pulses' && <PulseManagement />}

        {/* Tab Contents for other sections will go here */}
        {['analytics'].includes(activeTab) && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
            <Settings size={48} className="mb-4 animate-spin-slow" />
            <h3 className="text-xl font-medium">Coming Soon</h3>
            <p>We are building the {activeTab} management module.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <Card className="border-none shadow-sm rounded-3xl transition-transform hover:scale-[1.02]">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-2xl ${colors[color]}`}>
            <Icon size={24} />
          </div>
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-none font-bold">
            {trend}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertItem({ title, desc, time, type }: any) {
  const typeColors: any = {
    warning: 'bg-amber-500',
    info: 'bg-sky-500',
    success: 'bg-emerald-500',
  };

  return (
    <div className="flex gap-4 items-start">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${typeColors[type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
        <p className="text-xs text-slate-500 line-clamp-1">{desc}</p>
        <span className="text-[10px] text-slate-400 mt-1 block">{time}</span>
      </div>
    </div>
  );
}
