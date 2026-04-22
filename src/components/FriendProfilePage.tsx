import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Clock3,
  Globe2,
  Info,
  Lock,
  MapPin,
  Sparkles,
  MessageSquare,
  UserPlus,
  Calendar,
  Compass,
  Star,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent } from './ui/card';
import { MutualFreeTime } from './MutualFreeTime';
import { formatEmailToName } from '../utils/nameUtils';
import { 
  getFriendTimetable, 
  type ClassItem, 
  getEnhancedFriendProfile, 
  type EnhancedFriendProfile, 
  getProfile, 
  loadTimetable, 
  createConversation,
  getFriends,
  type UserProfile
} from '../utils/firebase/firestore';
import { WEEKDAYS, getTodayKey, type DayKey, computeCommonFreeSlots, formatTimeLabel, isBothFreeNow } from '../utils/scheduleCompare';

type FriendUser = {
  id?: string;
  name: string;
  displayName?: string;
  major?: string;
  year?: string;
  university?: string;
  email?: string;
  bio?: string;
  interests?: string[];
  clubs?: string[];
  sharedCourses?: string[];
  timetable?: Array<{ day: string; time: string; title: string; where?: string }>;
  course?: string;
  studyGroup?: string | null;
  photoURL?: string;
};

type TabKey = 'interests' | 'clubs' | 'schedule' | 'mutual';

const tabLabels: Array<{ id: TabKey; label: string }> = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'mutual', label: 'Mutual' },
  { id: 'interests', label: 'Interests' },
  { id: 'clubs', label: 'Clubs' },
];

export function FriendProfilePage({ user, onBack, onMessage }: { user: FriendUser; onBack: () => void; onMessage?: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [latestTimetable, setLatestTimetable] = useState<Array<{ day: string; time: string; title: string; where?: string }>>(user.timetable || []);
  const [enhanced, setEnhanced] = useState<EnhancedFriendProfile | null>(null);
  const [profileDoc, setProfileDoc] = useState<any>(null);
  const [friendTimetable, setFriendTimetable] = useState<Record<string, ClassItem[]>>({});
  const [currentUserTimetable, setCurrentUserTimetable] = useState<Record<string, ClassItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState<boolean>(false);

  useEffect(() => {
    const loadAllData = async () => {
      if (!user.id) return;
      setLoading(true);
      try {
        const [rawTimetable, enhancedProfile, profile, myTimetable] = await Promise.all([
          getFriendTimetable(user.id),
          getEnhancedFriendProfile(user.id),
          getProfile(user.id),
          loadTimetable()
        ]);

        setFriendTimetable(rawTimetable || {});
        setEnhanced(enhancedProfile || null);
        setProfileDoc(profile || null);
        setCurrentUserTimetable(myTimetable || {});

        const arr: Array<{ day: string; time: string; title: string; where?: string }> = [];
        Object.entries(rawTimetable || {}).forEach(([day, classes]) => {
          (classes as ClassItem[]).forEach((c) => {
            arr.push({
              day,
              time: c.time,
              title: c.title || c.course,
              where: c.location || c.academicBlock
            });
          });
        });
        if (arr.length > 0) setLatestTimetable(arr);
      } catch (e) {
        console.warn('Failed to load friend data', e);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [user.id]);

  useEffect(() => {
    if (!user.id) return;
    const unsubscribe = getFriends((friendsList) => {
      setIsFriend(friendsList.some(f => f.uid === user.id));
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user.id]);

  const displayName = formatEmailToName(profileDoc?.name || user.name || user.displayName);
  const displayMajor = profileDoc?.major ?? enhanced?.major ?? user.major ?? 'Major';
  const displayYear = profileDoc?.year ?? enhanced?.year ?? user.year ?? 'Year';
  const displayUniversity = profileDoc?.university ?? enhanced?.university ?? user.university ?? 'University';
  const displayBio = profileDoc?.bio ?? enhanced?.bio ?? user.bio ?? 'Passionate about building, exploring ideas, and finding creative people on campus.';
  const displayInterests = (profileDoc?.interests ?? enhanced?.interests ?? user.interests ?? []).filter(Boolean);
  const displayClubs = (profileDoc?.clubs ?? enhanced?.clubs ?? user.clubs ?? []).filter(Boolean);
  const photoURL = profileDoc?.photoURL || (user as any).photoURL;

  // Timetable processing
  const scheduleItems = useMemo(() => {
    return latestTimetable.map((item, idx) => ({
      key: `item-${idx}`,
      day: item.day,
      time: item.time,
      title: item.title,
      place: item.where || 'TBD',
    }));
  }, [latestTimetable]);

  const scheduleByDay = useMemo(() => {
    const parseStart = (maybeTime?: string) => {
      if (!maybeTime) return 24 * 60;
      const m12 = maybeTime.match(/^([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$/i);
      if (m12) {
        let hh = parseInt(m12[1], 10);
        const mm = parseInt(m12[2], 10);
        const ap = m12[3].toUpperCase();
        if (ap === 'AM' && hh === 12) hh = 0;
        if (ap === 'PM' && hh !== 12) hh += 12;
        return hh * 60 + mm;
      }
      return 24 * 60;
    };

    const grouped = {} as Record<DayKey, typeof scheduleItems>;
    WEEKDAYS.forEach(day => grouped[day] = []);
    scheduleItems.forEach(item => {
      const key = (item.day || '').slice(0, 3).toUpperCase() as DayKey;
      if (grouped[key]) grouped[key].push(item);
    });
    WEEKDAYS.forEach(day => {
      grouped[day] = [...grouped[day]].sort((a, b) => parseStart(a.time) - parseStart(b.time));
    });
    return grouped;
  }, [scheduleItems]);

  const bothFreeNow = useMemo(() => {
    return isBothFreeNow(currentUserTimetable, friendTimetable);
  }, [currentUserTimetable, friendTimetable]);

  const todayKey = getTodayKey();

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Syncing profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-sky-50 text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Ambient blurs */}
      <div aria-hidden className="pointer-events-none absolute -top-48 left-[55%] w-48 h-48 bg-sky-400/10 rounded-full blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-[900px] -left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl" />

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-sky-400/10 bg-white/60 px-5 py-3 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white ring-2 ring-sky-400/20 text-sky-600 hover:bg-sky-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="text-lg font-bold tracking-tight text-sky-400" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Friend Profile
        </div>

        <div className="w-9" /> {/* Spacer */}
      </header>

      <section className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="rounded-[2rem] bg-white/70 px-5 py-6 shadow-[0_10px_40px_rgba(56,189,248,0.08)] ring-1 ring-sky-400/10 backdrop-blur-[12px] sm:px-7 sm:py-8">
          <header className="flex flex-col items-center text-center">
            <div className="group relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-sky-400 to-sky-200 opacity-30 blur-sm transition-opacity" />
              <Avatar className="relative h-24 w-24 border-4 border-white shadow-xl">
                <AvatarImage src={photoURL} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-sky-100 text-2xl font-bold text-sky-700">
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {bothFreeNow && (
                <div className="absolute -top-1 -right-1 z-20">
                  <Badge className="bg-emerald-500 text-white border-2 border-white shadow-lg px-2 py-0.5 rounded-full text-[10px] font-bold">
                    Free Now
                  </Badge>
                </div>
              )}
            </div>

            <div className="mt-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {displayName}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">{displayMajor} • Year {displayYear}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
              {enhanced?.mutualFriends !== undefined && (
                <span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-600 ring-1 ring-sky-400/20">{enhanced.mutualFriends} mutual friends</span>
              )}
              <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-sky-400/10">
                {displayUniversity}
              </span>
            </div>

            <div className="mt-5 w-full flex gap-3 max-w-sm">
              <Button
                onClick={async () => {
                  if (user.id) {
                    await createConversation(user.id);
                    if (onMessage) onMessage();
                  }
                }}
                className="h-11 flex-1 rounded-2xl bg-sky-400 text-sm font-bold text-white shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)] hover:bg-sky-500"
              >
                <MessageSquare className="mr-2 h-4 w-4" /> Message
              </Button>
              {isFriend ? (
                <div className="flex-1 flex items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 font-bold text-sm border border-emerald-100 shadow-sm">
                  <Star className="mr-1.5 h-3.5 w-3.5 fill-current" /> Friends
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-2xl border-sky-400/20 bg-white text-sm font-bold text-sky-600 hover:bg-sky-50"
                  onClick={async () => {
                    if (user.id) {
                      const { sendFriendRequest } = await import('../utils/firebase/firestore');
                      await sendFriendRequest(user.id);
                    }
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" /> Add Friend
                </Button>
              )}
            </div>
          </header>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
            <InfoChip icon={Globe2} label="Campus" value={displayUniversity} />
            <InfoChip icon={MapPin} label="Major" value={displayMajor} />
            <InfoChip icon={Sparkles} label="Year" value={displayYear} />
          </div>

          <nav className="mt-6">
            <div className="flex items-center justify-between rounded-2xl bg-white/60 p-1 ring-1 ring-sky-400/10 overflow-x-auto no-scrollbar">
              {tabLabels.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[80px] rounded-xl px-2 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-sky-400 text-white shadow-[0_4px_6px_-4px_rgba(56,189,248,0.3)]'
                      : 'text-slate-600 hover:bg-sky-50'
                  }`}
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <section className="mt-6">
            {activeTab === 'schedule' && (
              <div className="space-y-4">
                {Object.keys(scheduleByDay).length === 0 ? (
                  <div className="rounded-[1.25rem] bg-white/60 ring-1 ring-sky-400/10 p-4 text-center">
                    <p className="text-sm font-semibold text-slate-800">No schedule shared</p>
                  </div>
                ) : (
                  WEEKDAYS.map((day) => {
                    const items = scheduleByDay[day];
                    const isToday = todayKey === day;
                    return (
                      <div
                        key={day}
                        className={`rounded-[1.25rem] p-4 ring-1 transition ${
                          isToday ? 'bg-white ring-sky-400/40 shadow-sm' : 'bg-white/60 ring-sky-400/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className={`text-sm font-extrabold tracking-tight ${isToday ? 'text-sky-600' : 'text-slate-800'}`}>
                            {day} {isToday && <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-sky-500 align-middle">Today</span>}
                          </h3>
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No classes.</p>
                        ) : (
                          <div className="space-y-3">
                            {items.map((item, i) => (
                              <div key={i} className="flex gap-3">
                                <div className="mt-1 h-4 w-4 shrink-0 rounded-full border-[3px] border-white bg-sky-400 shadow-sm" />
                                <div className="flex-1">
                                  <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.title}</h4>
                                  <div className="mt-1 flex items-center gap-3 text-slate-500">
                                    <span className="text-[11px] font-medium flex items-center gap-1"><Clock3 className="h-3 w-3" /> {item.time}</span>
                                    <span className="text-[11px] font-medium flex items-center gap-1"><MapPin className="h-3 w-3" /> {item.place}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'mutual' && (
              <MutualFreeTime 
                currentUserTimetable={currentUserTimetable}
                friendTimetable={friendTimetable}
                friendName={displayName}
                onStartChat={async () => {
                  if (user.id) {
                    await createConversation(user.id);
                    if (onMessage) onMessage();
                  }
                }}
                onPlanHangout={() => {
                  // This could open a calendar or event creation sheet
                  // For now, let's keep it simple or just show a message
                  alert("Hangout planner coming soon!");
                }}
              />
            )}

            {activeTab === 'interests' && (
              <div className="space-y-4">
                <div className="p-4 bg-white/60 rounded-2xl ring-1 ring-sky-400/10">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">About</h3>
                  <p className="text-sm leading-relaxed text-slate-600 italic">"{displayBio}"</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayInterests.map((interest: string, i: number) => (
                    <span key={i} className="rounded-full bg-sky-400/10 px-3 py-1.5 text-sm font-medium text-sky-600 ring-1 ring-sky-400/20">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'clubs' && (
              <div className="space-y-3">
                {displayClubs.length > 0 ? (
                  displayClubs.map((club: string, i: number) => (
                    <div key={i} className="rounded-[1.25rem] bg-white/60 ring-1 ring-sky-400/10 p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                        <Compass className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-800">{club}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400 italic">No clubs joined yet.</div>
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-[1.5rem] bg-white/60 p-3 ring-1 ring-sky-400/10 transition-colors hover:bg-white">
      <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/10 text-sky-500">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="mt-0.5 text-xs font-bold text-slate-700 truncate w-full text-center px-1">{value}</span>
    </div>
  );
}
