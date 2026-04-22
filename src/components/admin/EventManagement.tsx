import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar as CalendarIcon, 
  MapPin, 
  Star, 
  TrendingUp, 
  ShieldCheck,
  Trash2,
  Edit,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { 
  getUpcomingEventsRealtime, 
  updateEventMetadata, 
  deleteEvent, 
  createEvent,
  type CampusEvent 
} from '../../utils/firebase/firestore';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Timestamp } from 'firebase/firestore';
import { auth } from '../../utils/firebase/client';

export function EventManagement() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    clubName: '',
    location: '',
    startTime: '',
    description: '',
    tags: '',
    imageUrl: ''
  });

  useEffect(() => {
    const unsubscribe = getUpcomingEventsRealtime((data) => {
      setEvents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.clubName || !newEvent.startTime) return;

    const eventData: Omit<CampusEvent, 'id' | 'createdAt' | 'stats'> = {
      title: newEvent.title,
      clubName: newEvent.clubName,
      location: newEvent.location,
      startTime: Timestamp.fromDate(new Date(newEvent.startTime)),
      description: newEvent.description,
      tags: newEvent.tags.split(',').map(t => t.trim()),
      imageUrl: newEvent.imageUrl,
      createdBy: auth.currentUser?.uid || 'admin',
    };

    await createEvent(eventData);
    setIsAddDialogOpen(false);
    setNewEvent({ title: '', clubName: '', location: '', startTime: '', description: '', tags: '', imageUrl: '' });
  };

  const handleToggleMetadata = async (eventId: string, key: 'isFeatured' | 'isTrending' | 'isSponsored', currentVal: boolean) => {
    await updateEventMetadata(eventId, { [key]: !currentVal });
    setEvents(events.map(e => e.id === eventId ? { ...e, [key]: !currentVal } : e));
  };

  const handleDelete = async (eventId: string) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      await deleteEvent(eventId);
      setEvents(events.filter(e => e.id !== eventId));
    }
  };

  const filteredEvents = events.filter(e => 
    e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.clubName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            className="pl-10 bg-white border-slate-200 rounded-xl w-full" 
            placeholder="Search events..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2 bg-sky-500 hover:bg-sky-600 w-full sm:w-auto">
              <Plus size={18} />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Add New Campus Event</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateEvent} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input id="title" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g. Tech Symposium 2024" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="club">Club/Organizer</Label>
                <Input id="club" value={newEvent.clubName} onChange={e => setNewEvent({...newEvent, clubName: e.target.value})} placeholder="e.g. Google Developer Student Club" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} placeholder="e.g. Anna Auditorium" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date & Time</Label>
                  <Input id="date" type="datetime-local" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" value={newEvent.tags} onChange={e => setNewEvent({...newEvent, tags: e.target.value})} placeholder="e.g. tech, coding, workshop" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                <Input id="image" value={newEvent.imageUrl} onChange={e => setNewEvent({...newEvent, imageUrl: e.target.value})} placeholder="https://..." />
              </div>
              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 rounded-xl">Create Event</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredEvents.map((event) => (
          <Card key={event.id} className="border-none shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row sm:items-center p-4 gap-4 sm:gap-6">
                <div className="flex items-center gap-4 flex-1">
                  {/* Image/Banner */}
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-slate-100 shrink-0 overflow-hidden relative">
                    {event.imageUrl ? (
                      <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <CalendarIcon size={24} />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 mb-1">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">{event.title}</h3>
                      <div className="flex flex-wrap gap-1">
                        {event.isFeatured && <Badge className="bg-amber-100 text-amber-600 border-none text-[10px] px-1.5 py-0"><Star size={10} className="mr-1 fill-current" /> Featured</Badge>}
                        {event.isTrending && <Badge className="bg-rose-100 text-rose-600 border-none text-[10px] px-1.5 py-0"><TrendingUp size={10} className="mr-1" /> Trending</Badge>}
                        {event.isSponsored && <Badge className="bg-sky-100 text-sky-600 border-none text-[10px] px-1.5 py-0"><ShieldCheck size={10} className="mr-1" /> Sponsored</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-slate-500 mb-2">
                      <span className="flex items-center gap-1"><ShieldCheck size={12} /> {event.clubName}</span>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {event.location}</span>
                        <span className="flex items-center gap-1"><CalendarIcon size={12} /> {event.startTime.toDate().toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {event.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="secondary" className="bg-slate-50 text-slate-500 font-normal text-[10px] px-1.5 py-0">#{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-6">
                  {/* Stats */}
                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Attending</p>
                      <p className="text-base font-bold text-slate-800">{event.stats.attending}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Views</p>
                      <p className="text-base font-bold text-slate-800">{event.stats.views}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                          <MoreVertical size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-100 shadow-xl">
                        <DropdownMenuItem onClick={() => handleToggleMetadata(event.id, 'isFeatured', !!event.isFeatured)}>
                          <Star size={16} className="mr-2" /> {event.isFeatured ? 'Unmark Featured' : 'Mark Featured'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleMetadata(event.id, 'isTrending', !!event.isTrending)}>
                          <TrendingUp size={16} className="mr-2" /> {event.isTrending ? 'Unmark Trending' : 'Mark Trending'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleMetadata(event.id, 'isSponsored', !!event.isSponsored)}>
                          <ShieldCheck size={16} className="mr-2" /> {event.isSponsored ? 'Unmark Sponsored' : 'Mark Sponsored'}
                        </DropdownMenuItem>
                        <div className="h-px bg-slate-100 my-1" />
                        <DropdownMenuItem className="text-sky-600">
                          <Edit size={16} className="mr-2" /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-rose-600" onClick={() => handleDelete(event.id)}>
                          <Trash2 size={16} className="mr-2" /> Delete Event
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredEvents.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <CalendarIcon size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No events found</h3>
            <p className="text-slate-500">Try adjusting your search or create a new event</p>
          </div>
        )}
      </div>
    </div>
  );
}
