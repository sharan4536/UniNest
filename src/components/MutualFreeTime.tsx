import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Calendar, 
  Clock, 
  MessageSquare, 
  CalendarPlus, 
  AlertCircle,
  Clock3
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  WEEKDAYS, 
  DayKey, 
  Slot, 
  computeCommonFreeSlots, 
  computeBusyTogetherSlots,
  formatTimeLabel, 
  formatDuration, 
  getTodayKey,
  parseTimeToMinutes
} from '../utils/scheduleCompare';
import { ClassItem } from '../utils/firebase/firestore';

interface MutualFreeTimeProps {
  currentUserTimetable: Record<string, ClassItem[]>;
  friendTimetable: Record<string, ClassItem[]>;
  onPlanHangout?: () => void;
  onStartChat?: () => void;
  friendName?: string;
}

const DAY_LABELS: Record<DayKey, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday',
};

export function MutualFreeTime({ 
  currentUserTimetable, 
  friendTimetable, 
  onPlanHangout, 
  onStartChat,
  friendName = 'Friend'
}: MutualFreeTimeProps) {
  const [view, setView] = useState<'today' | 'week'>('today');
  const todayKey = getTodayKey();

  const hasSchedules = useMemo(() => {
    const hasMySchedule = Object.values(currentUserTimetable || {}).some(day => day && day.length > 0);
    const hasFriendSchedule = Object.values(friendTimetable || {}).some(day => day && day.length > 0);
    return { me: hasMySchedule, friend: hasFriendSchedule };
  }, [currentUserTimetable, friendTimetable]);

  const freeByDay = useMemo(() => {
    if (!hasSchedules.me || !hasSchedules.friend) return null;
    return computeCommonFreeSlots(currentUserTimetable, friendTimetable);
  }, [currentUserTimetable, friendTimetable, hasSchedules]);

  const daysToShow = view === 'today' ? (todayKey ? [todayKey] : []) : WEEKDAYS;

  const renderSlot = (day: DayKey, slot: Slot) => {
    const startMins = parseTimeToMinutes(slot.start);
    const endMins = parseTimeToMinutes(slot.end);
    const durationMins = endMins - startMins;
    const isBestTime = durationMins >= 120;

    return (
      <div 
        key={`${day}-${slot.start}-free`}
        className={`relative flex items-center justify-between p-4 rounded-2xl transition-all ${
          isBestTime 
            ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 ring-1 ring-emerald-200 shadow-sm' 
            : 'bg-white ring-1 ring-slate-100 hover:ring-emerald-200 shadow-sm'
        }`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0 ${
                isBestTime ? 'bg-emerald-500 text-white border-none' : 'text-emerald-600 border-emerald-200'
              }`}>
                {isBestTime ? 'Best Time to Meet' : 'Mutual Free Time'}
              </Badge>
              {isBestTime && <Sparkles className="h-3 w-3 text-emerald-500 animate-pulse" />}
            </div>
            {view === 'week' && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-auto">{DAY_LABELS[day]}</span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <h4 className="text-lg font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {formatTimeLabel(slot.start)} – {formatTimeLabel(slot.end)}
            </h4>
            <span className="text-xs text-slate-500 font-medium">({formatDuration(slot)})</span>
          </div>
        </div>

        <Button 
          size="sm" 
          className="rounded-full h-8 px-4 text-xs font-bold bg-sky-500 hover:bg-sky-600 shadow-sm transition-transform active:scale-95 ml-4"
          onClick={onPlanHangout}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
          Plan
        </Button>
      </div>
    );
  };

  if (!hasSchedules.me || !hasSchedules.friend) {
    return (
      <Card className="border-dashed border-sky-200 bg-sky-50/50 shadow-none rounded-[2rem]">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock3 className="h-6 w-6 text-sky-500" />
          </div>
          <h3 className="text-slate-800 font-extrabold mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {!hasSchedules.me ? "Missing Your Timetable" : `Missing ${friendName}'s Timetable`}
          </h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed max-w-[240px] mx-auto">
            {!hasSchedules.me 
              ? "Update your timetable to see when you're both free!" 
              : `Ask ${friendName} to upload their timetable to compare schedules.`}
          </p>
          {!hasSchedules.me && (
            <Button variant="default" className="rounded-full px-6 bg-sky-500 hover:bg-sky-600 shadow-md" size="sm">
              Update Timetable
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const allSlots: {day: DayKey, slot: Slot}[] = [];
  daysToShow.forEach(day => {
    (freeByDay?.[day] || []).forEach(slot => allSlots.push({day, slot}));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Mutual Free Time
        </h3>
        <div className="flex bg-slate-100 p-1 rounded-full ring-1 ring-slate-200/50">
          <button
            onClick={() => setView('today')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              view === 'today' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              view === 'week' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            This Week
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {allSlots.length > 0 ? (
          allSlots
            .sort((a, b) => {
              // First by day
              if (a.day !== b.day) return WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day);
              // Then by time
              return parseTimeToMinutes(a.slot.start) - parseTimeToMinutes(b.slot.start);
            })
            .map(({day, slot}) => renderSlot(day, slot))
        ) : (
          <div className="text-center py-12 bg-white/50 rounded-3xl ring-1 ring-slate-100 border-dashed border-2 border-slate-100">
            <p className="text-3xl mb-3">😕</p>
            <p className="text-slate-800 font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>No common free slots found</p>
            <p className="text-sm text-slate-500 mt-1">Try checking another day!</p>
          </div>
        )}
      </div>

      <div className="pt-2">
        <Button 
          variant="outline" 
          className="w-full rounded-2xl h-14 border-sky-200 text-sky-600 hover:bg-sky-50 font-extrabold shadow-sm transition-all hover:shadow-md"
          onClick={onStartChat}
        >
          <MessageSquare className="h-5 w-5 mr-2" />
          Start Chat with {friendName}
        </Button>
      </div>
    </div>
  );
}
