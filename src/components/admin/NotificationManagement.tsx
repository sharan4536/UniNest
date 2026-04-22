import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Bell, 
  Send, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  Trash2,
  Calendar as CalendarIcon,
  Filter,
  Megaphone
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  getAllNotificationsRealtime, 
  createAdminNotification,
  type AdminNotification 
} from '../../utils/firebase/firestore';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { auth } from '../../utils/firebase/client';

export function NotificationManagement() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newNotif, setNewNotif] = useState({
    title: '',
    message: '',
    type: 'announcement' as 'announcement' | 'event' | 'promotion',
    redirectLink: ''
  });

  useEffect(() => {
    const unsubscribe = getAllNotificationsRealtime((data) => {
      setNotifications(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotif.title || !newNotif.message) return;

    const notifData: Omit<AdminNotification, 'id' | 'createdAt'> = {
      title: newNotif.title,
      message: newNotif.message,
      type: newNotif.type,
      redirectLink: newNotif.redirectLink,
      status: 'sent',
      sentAt: (require('firebase/firestore') as any).Timestamp.now(),
      createdBy: auth.currentUser?.uid || 'admin'
    };

    await createAdminNotification(notifData);
    setIsAddDialogOpen(false);
    setNewNotif({ title: '', message: '', type: 'announcement', redirectLink: '' });
  };

  const filteredNotifications = notifications.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    n.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            className="pl-10 bg-white border-slate-200 rounded-xl w-full" 
            placeholder="Search notifications..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Button variant="outline" className="flex-1 sm:flex-none rounded-xl gap-2 border-slate-200">
            <Filter size={18} />
            Filter
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex-[2] sm:flex-none rounded-xl gap-2 bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-100">
                <Send size={18} />
                <span className="hidden xs:inline">Send Broadcast</span>
                <span className="xs:hidden">Send</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-3xl">
              <DialogHeader>
                <DialogTitle>Send Global Broadcast</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSendBroadcast} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Notification Title</Label>
                  <Input id="title" value={newNotif.title} onChange={e => setNewNotif({...newNotif, title: e.target.value})} placeholder="e.g. Campus Holiday Tomorrow" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message Content</Label>
                  <textarea 
                    id="message" 
                    className="w-full h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    value={newNotif.message} 
                    onChange={e => setNewNotif({...newNotif, message: e.target.value})} 
                    placeholder="Enter the message for all users..." 
                    required 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Category</Label>
                    <select 
                      id="type" 
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      value={newNotif.type}
                      onChange={e => setNewNotif({...newNotif, type: e.target.value as any})}
                    >
                      <option value="announcement">Announcement</option>
                      <option value="event">Event Alert</option>
                      <option value="promotion">Promotion</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="link">Redirect Link</Label>
                    <Input id="link" value={newNotif.redirectLink} onChange={e => setNewNotif({...newNotif, redirectLink: e.target.value})} placeholder="Optional URL" />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 rounded-xl">Push to All Users</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredNotifications.map((notif) => (
          <Card key={notif.id} className="border-none shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row sm:items-center p-4 sm:p-5 gap-4 sm:gap-6">
                <div className="flex items-center gap-4 flex-1">
                  {/* Type Icon */}
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${
                    notif.type === 'event' ? 'bg-amber-50 text-amber-500' :
                    notif.type === 'announcement' ? 'bg-sky-50 text-sky-500' :
                    'bg-emerald-50 text-emerald-500'
                  }`}>
                    {notif.type === 'event' ? <CalendarIcon size={20} /> :
                    notif.type === 'announcement' ? <Bell size={20} /> :
                    <Megaphone size={20} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">{notif.title}</h3>
                      <Badge className={`text-[9px] uppercase font-bold tracking-widest border-none px-1.5 py-0 ${
                        notif.status === 'sent' ? 'bg-emerald-50 text-emerald-600' :
                        notif.status === 'scheduled' ? 'bg-sky-50 text-sky-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {notif.status}
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 line-clamp-1 mb-1.5">{notif.message}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] sm:text-xs text-slate-400 font-medium">
                      <span className="flex items-center gap-1.5"><Users size={12} /> {notif.targetGroups ? 'Targeted' : 'All Users'}</span>
                      <span className="flex items-center gap-1.5"><Clock size={12} /> {notif.sentAt ? notif.sentAt.toDate().toLocaleDateString() : 'Not sent'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-6">
                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    {notif.status === 'sent' ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[11px] sm:text-sm">
                        <CheckCircle2 size={16} />
                        Delivered
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sky-600 font-bold text-[11px] sm:text-sm">
                        <Clock size={16} />
                        Scheduled
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-slate-400">
                          <MoreVertical size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-100 shadow-xl">
                        <DropdownMenuItem>
                          <Plus size={16} className="mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Clock size={16} className="mr-2" /> Reschedule
                        </DropdownMenuItem>
                        <div className="h-px bg-slate-100 my-1" />
                        <DropdownMenuItem className="text-rose-600">
                          <Trash2 size={16} className="mr-2" /> Delete Record
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredNotifications.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Bell size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No notifications sent yet</h3>
            <p className="text-slate-500">Reach your users instantly with push notifications</p>
          </div>
        )}
      </div>
    </div>
  );
}
