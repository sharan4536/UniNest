import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Search, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  getFriends,
  getFriendTimetable,
  loadTimetable,
  type ClassItem,
  type UserProfile,
} from '../utils/firebase/firestore';
import {
  WEEKDAYS,
  computeCommonFreeSlots,
  formatDuration,
  formatTimeLabel,
  getTodayKey,
  suggestBestSlot,
  type DayKey,
  type Slot,
} from '../utils/scheduleCompare';

interface FreeTimeFinderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAY_LABELS: Record<DayKey, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday',
};

export function FreeTimeFinder({ open, onOpenChange }: FreeTimeFinderProps) {
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);
  const [mineTimetable, setMineTimetable] = useState<Record<string, ClassItem[]>>({});
  const [friendTimetable, setFriendTimetable] = useState<Record<string, ClassItem[]>>({});
  const [loading, setLoading] = useState(false);

  // Subscribe to friend list when modal is open
  useEffect(() => {
    if (!open) return;
    const unsub = getFriends((list) => setFriends(list));
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [open]);

  // Load my timetable when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const data = await loadTimetable();
        setMineTimetable(data || {});
      } catch {
        setMineTimetable({});
      }
    })();
  }, [open]);

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFriend(null);
      setFriendTimetable({});
      setQuery('');
    }
  }, [open]);

  // Load friend's timetable when a friend is selected
  useEffect(() => {
    if (!selectedFriend) return;
    setLoading(true);
    (async () => {
      try {
        const t = await getFriendTimetable(selectedFriend.uid);
        setFriendTimetable(t || {});
      } catch (e) {
        console.error('Failed to load friend timetable', e);
        setFriendTimetable({});
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedFriend]);

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => (f.displayName || '').toLowerCase().includes(q));
  }, [friends, query]);

  const freeByDay = useMemo(() => {
    if (!selectedFriend) return null;
    return computeCommonFreeSlots(mineTimetable, friendTimetable);
  }, [selectedFriend, mineTimetable, friendTimetable]);

  const bestSlot = useMemo(() => (freeByDay ? suggestBestSlot(freeByDay) : null), [freeByDay]);
  const todayKey = getTodayKey();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl bg-sky-50/95 ring-1 ring-sky-400/10 backdrop-blur-xl max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-sky-400/10 bg-white/60 backdrop-blur-md">
          <DialogTitle className="text-lg font-extrabold text-slate-800 flex items-center gap-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {selectedFriend ? (
              <button
                type="button"
                onClick={() => setSelectedFriend(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-sky-100"
                aria-label="Back to friend list"
                data-testid="free-time-back-btn"
              >
                <ArrowLeft className="h-4 w-4 text-sky-600" />
              </button>
            ) : (
              <CalendarClock className="h-5 w-5 text-sky-500" />
            )}
            {selectedFriend ? `You & ${selectedFriend.displayName || 'friend'}` : 'Find free time with a friend'}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {selectedFriend
              ? 'Green slots are when you both are free (Mon–Fri, 8 AM – 8 PM).'
              : 'Pick a friend to compare schedules and find common gaps.'}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedFriend ? (
            <>
              <div className="relative flex items-center bg-white/80 rounded-2xl p-3 ring-1 ring-sky-400/10 mb-3 focus-within:ring-sky-400/30 transition">
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input
                  data-testid="free-time-search-input"
                  className="bg-transparent border-none focus:outline-none w-full text-sm text-slate-700 placeholder:text-slate-400"
                  placeholder="Search a friend..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {friends.length === 0 ? (
                <div className="rounded-2xl bg-white/60 ring-1 ring-sky-400/10 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">No friends yet</p>
                  <p className="text-xs text-slate-500 mt-1">Add friends from the Discover tab to compare schedules.</p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No friends match "{query}"</p>
              ) : (
                <ul className="space-y-2">
                  {filteredFriends.map((f) => (
                    <li key={f.uid}>
                      <button
                        type="button"
                        data-testid={`free-time-friend-${f.uid}`}
                        onClick={() => setSelectedFriend(f)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/70 ring-1 ring-sky-400/10 hover:bg-white hover:ring-sky-400/30 transition text-left"
                      >
                        <Avatar className="h-10 w-10 ring-2 ring-sky-400/20">
                          <AvatarImage src={(f as any).photoURL} alt={f.displayName} className="object-cover" />
                          <AvatarFallback className="bg-sky-100 text-sky-700 font-bold">
                            {(f.displayName || 'F').charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{f.displayName || 'Friend'}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {(f as any).major || 'Student'}{(f as any).year ? ` · ${(f as any).year}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-sky-500">Compare</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            // Comparison view
            <div className="space-y-4">
              {loading && (
                <div className="text-sm text-slate-500 text-center py-4">Loading schedules...</div>
              )}

              {!loading && bestSlot && (
                <div
                  data-testid="best-slot-card"
                  className="rounded-2xl bg-gradient-to-br from-sky-400 to-sky-500 p-4 text-white shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)]"
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">
                    <Sparkles className="h-3.5 w-3.5" />
                    Best meeting time
                  </div>
                  <p className="mt-1 text-lg font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {DAY_LABELS[bestSlot.day]} · {formatTimeLabel(bestSlot.slot.start)} – {formatTimeLabel(bestSlot.slot.end)}
                  </p>
                  <p className="text-xs text-white/90 mt-0.5">
                    {formatDuration(bestSlot.slot)} together · longest free window this week
                  </p>
                </div>
              )}

              {!loading && freeByDay && WEEKDAYS.map((day) => {
                const slots = freeByDay[day];
                const isToday = todayKey === day;
                return (
                  <div
                    key={day}
                    data-testid={`free-day-${day}`}
                    className={`rounded-2xl p-4 ring-1 transition ${
                      isToday
                        ? 'bg-white ring-sky-400/40 shadow-[0_4px_6px_-4px_rgba(56,189,248,0.2)]'
                        : 'bg-white/60 ring-sky-400/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3
                        className={`text-sm font-extrabold tracking-tight ${isToday ? 'text-sky-600' : 'text-slate-800'}`}
                        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      >
                        {DAY_LABELS[day]}
                        {isToday && (
                          <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-sky-500 align-middle">Today</span>
                        )}
                      </h3>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {slots.length} slot{slots.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {slots.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No common free window this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {slots.map((s, i) => (
                          <div
                            key={`${day}-${i}`}
                            data-testid={`free-slot-${day}-${i}`}
                            className="flex items-center justify-between rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2.5"
                          >
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
                                You both are free
                              </p>
                              <p className="text-sm font-semibold text-emerald-900 mt-0.5">
                                {formatTimeLabel(s.start)} – {formatTimeLabel(s.end)}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                              {formatDuration(s)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-sky-400/10 bg-white/60 backdrop-blur-md">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold"
            data-testid="free-time-close-btn"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small wrapper that opens FreeTimeFinder on click — can be dropped anywhere. */
export function FindFreeTimeButton({ testId = 'profile-find-free-time-btn' }: { testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 w-full rounded-2xl bg-sky-400 hover:bg-sky-500 text-white text-sm font-bold shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)]"
        data-testid={testId}
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        Find Free Time with Friend
      </Button>
      <FreeTimeFinder open={open} onOpenChange={setOpen} />
    </>
  );
}
