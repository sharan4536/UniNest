import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { getFriendTimetable, type ClassItem, getEnhancedFriendProfile, type EnhancedFriendProfile, getProfile, loadTimetable, createConversation } from '../utils/firebase/firestore';

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
  clubs?: string[]; // extended
  sharedCourses?: string[];
  timetable?: Array<{ day: string; time: string; title: string; where?: string }>; // extended
  course?: string; // coursemate specific
  studyGroup?: string | null; // coursemate specific
};

export function FriendProfilePage({ user, onBack, onMessage }: { user: FriendUser; onBack: () => void; onMessage?: () => void }) {
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="mb-4">No profile selected.</div>
            <Button onClick={onBack} className="w-full bg-primary/20 text-primary hover:bg-primary/30">
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Load the latest timetable for the friend to avoid stale data
  const [latestTimetable, setLatestTimetable] = useState<Array<{ day: string; time: string; title: string; where?: string }>>(user.timetable || []);
  const [enhanced, setEnhanced] = useState<EnhancedFriendProfile | null>(null);
  const [profileDoc, setProfileDoc] = useState<any>(null);
  const [friendTimetable, setFriendTimetable] = useState<Record<string, ClassItem[]>>({});
  const [currentUserTimetable, setCurrentUserTimetable] = useState<Record<string, ClassItem[]>>({});

  // Reference time grid to compute free slots
  const timeSlots = [
    '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
  ];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    const loadLatest = async () => {
      try {
        if (!user.id) return;
        const raw = await getFriendTimetable(user.id);
        setFriendTimetable(raw || {});
        const arr: Array<{ day: string; time: string; title: string; where?: string }> = [];
        Object.entries(raw).forEach(([day, classes]) => {
          (classes as ClassItem[]).forEach((c) => {
            arr.push({
              day,
              time: c.time,
              title: c.title || c.course,
              where: c.location || c.academicBlock
            });
          });
        });
        // Only overwrite if we actually loaded timetable entries.
        // This prevents clearing a previously provided timetable (e.g., passed in via navigation)
        if (arr.length > 0) {
          setLatestTimetable(arr);
        }
      } catch (e) {
        console.warn('Failed to load latest friend timetable', e);
      }
    };
    loadLatest();
  }, [user.id]);

  // Load enhanced profile details to display all available information
  useEffect(() => {
    const loadEnhanced = async () => {
      try {
        if (!user.id) return;
        const e = await getEnhancedFriendProfile(user.id);
        setEnhanced(e || null);
        try {
          const p = await getProfile(user.id);
          setProfileDoc(p || null);
        } catch { }
      } catch (err) {
        console.warn('Failed to load enhanced friend profile', err);
      }
    };
    loadEnhanced();
  }, [user.id]);

  // Load current user's timetable to compare
  useEffect(() => {
    const loadMyTimetable = async () => {
      try {
        const myTimetable = await loadTimetable();
        setCurrentUserTimetable(myTimetable || {});
      } catch (e) {
        console.warn('Failed to load current user timetable', e);
      }
    };
    loadMyTimetable();
  }, []);

  const displayName = (profileDoc?.name || user.name || user.displayName || 'User');
  const displayMajor = (profileDoc?.major ?? enhanced?.major ?? user.major ?? 'Major');
  const displayYear = (profileDoc?.year ?? enhanced?.year ?? user.year ?? 'Year');
  const displayUniversity = (profileDoc?.university ?? enhanced?.university ?? user.university ?? 'University');
  const displayEmail = (enhanced?.email ?? user.email ?? undefined);
  const displayBio = (profileDoc?.bio ?? enhanced?.bio ?? user.bio ?? undefined);
  const displayInterests = (profileDoc?.interests ?? enhanced?.interests ?? user.interests ?? []).filter(Boolean);
  const displayClubs = (profileDoc?.clubs ?? enhanced?.clubs ?? user.clubs ?? []).filter(Boolean);
  const displaySharedCourses = (user.sharedCourses ?? enhanced?.sharedCourses ?? []).filter(Boolean);
  const displayTimetable = (latestTimetable && latestTimetable.length > 0)
    ? latestTimetable
    : ((enhanced?.timetable ?? user.timetable ?? []).filter(Boolean));

  // Build a usable timetable source (prefer Firestore structure; fallback to enhanced array)
  const sourceTimetable = React.useMemo((): Record<string, ClassItem[]> => {
    if (Object.keys(friendTimetable).length > 0) return friendTimetable;
    const t: Record<string, ClassItem[]> = {};
    displayTimetable.forEach((s) => {
      const day = s.day;
      const entry: ClassItem = {
        id: Math.floor(Math.random() * 1000000),
        course: s.title || 'Class',
        title: s.title || 'Class',
        time: s.time,
        duration: 1,
        location: s.where || '',
      } as ClassItem;
      t[day] = [...(t[day] || []), entry];
    });
    return t;
  }, [friendTimetable, displayTimetable]);

  // Helper to calculate free slots for any timetable
  const calculateFreeSlots = (timetable: Record<string, ClassItem[]>) => {
    const result: Record<string, string[]> = {};
    days.forEach((day) => {
      const classes = (timetable[day] || []) as ClassItem[];
      const occupied = new Set<number>();
      classes.forEach((cls) => {
        const startIdx = timeSlots.indexOf(cls.time);
        if (startIdx !== -1) {
          const span = Math.max(1, Math.ceil(cls.duration || 1));
          for (let i = 0; i < span && (startIdx + i) < timeSlots.length; i++) {
            occupied.add(startIdx + i);
          }
        }
      });
      result[day] = timeSlots.filter((_, idx) => !occupied.has(idx));
    });
    return result;
  };

  // Compute free slots for friend
  const freeSlotsByDay = React.useMemo(() => calculateFreeSlots(sourceTimetable), [sourceTimetable]);

  // Compute free slots for current user
  const myFreeSlotsByDay = React.useMemo(() => calculateFreeSlots(currentUserTimetable), [currentUserTimetable]);

  // Compute mutual free slots
  const mutualFreeSlots = React.useMemo(() => {
    const result: Record<string, string[]> = {};
    days.forEach((day) => {
      const friendSlots = freeSlotsByDay[day] || [];
      const mySlots = myFreeSlotsByDay[day] || [];
      // Intersection of free slots
      result[day] = friendSlots.filter(slot => mySlots.includes(slot));
    });
    return result;
  }, [freeSlotsByDay, myFreeSlotsByDay]);

  // Check if both are free RIGHT NOW
  const isBothFreeNow = React.useMemo(() => {
    const now = new Date();
    const currentDayIndex = now.getDay(); // 0 = Sunday, 1 = Monday...
    // Adjust logic: days array is ['Monday', 'Tuesday'...]
    // getDay returns 0 for Sunday.
    // Map getDay() to our days array index:
    // 0 (Sun) -> 6, 1 (Mon) -> 0...
    const mapDayIndex = (dayIdx: number) => {
      if (dayIdx === 0) return 6; // Sunday is last in our array
      return dayIdx - 1; // Mon(1) -> 0
    };

    const dayName = days[mapDayIndex(currentDayIndex)];
    if (!dayName) return false;

    const currentHour = now.getHours();

    // Find matching slot
    // timeSlots are "8:00 AM", "9:00 AM"...
    // We need to match currentHour to a slot. 
    // E.g. 13:45 -> 13:00 -> "1:00 PM"

    // Simple logic: check if current hour exists in mutualFreeSlots[dayName]
    const formatHourToSlot = (h: number) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      let hour12 = h % 12;
      if (hour12 === 0) hour12 = 12;
      return `${hour12}:00 ${ampm}`;
    };

    const currentSlot = formatHourToSlot(currentHour);

    return mutualFreeSlots[dayName]?.includes(currentSlot);
  }, [mutualFreeSlots]);

  // Robust time parser supporting both 12h (with AM/PM) and 24h formats
  const toMinutes = (t?: string): number => {
    if (!t) return 24 * 60;
    const twelve = t.trim().match(/^([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$/i);
    if (twelve) {
      let hh = parseInt(twelve[1], 10);
      const mm = parseInt(twelve[2], 10);
      const ap = twelve[3].toUpperCase();
      if (ap === 'AM') {
        if (hh === 12) hh = 0;
      } else {
        if (hh !== 12) hh += 12;
      }
      return hh * 60 + mm;
    }
    const twentyFour = t.trim().match(/^([0-9]{1,2}):([0-9]{2})$/);
    if (twentyFour) {
      const hh = parseInt(twentyFour[1], 10);
      const mm = parseInt(twentyFour[2], 10);
      return hh * 60 + mm;
    }
    return 24 * 60; // unknown format goes to end
  };

  const sortByTime = (items: ClassItem[]) => {
    return [...items].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  };

  const aboutRows: Array<{ label: string; value?: string }> = [
    { label: 'University', value: displayUniversity || '—' },
    { label: 'Major', value: displayMajor || '—' },
    { label: 'Year', value: displayYear || '—' },
    { label: 'Email', value: displayEmail || '—' },
    { label: 'Study Group', value: user.studyGroup || undefined },
  ];

  return (
    <div className="min-h-screen pb-24">
      {/* Header with Back Button */}
      <div className="glass-header sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-2 hover:bg-gray-100 text-foreground"
          >
            ← Back
          </Button>
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Friend Profile</h1>
          <div className="w-16"></div> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6 mt-4">
        {/* Profile Header Card */}
        <Card className="overflow-hidden glass-card border-none animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="relative h-40 bg-gradient-to-r from-sky-200 via-blue-100 to-indigo-200">
            <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]"></div>
          </div>
          <CardContent className="relative pt-0 pb-8">
            {/* Avatar positioned over the gradient */}
            <div className="flex justify-center -mt-20 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-sky-400/20 rounded-full blur-2xl animate-pulse"></div>
                <div className="rounded-full p-2 bg-white/80 backdrop-blur-md border border-white shadow-xl relative z-10">
                  <Avatar className="w-32 h-32 border-[4px] border-white shadow-inner">
                    <AvatarFallback className="text-4xl font-bold bg-gradient-to-br from-sky-100 to-blue-200 text-sky-600">
                      {(user.name || user.displayName || '?').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {isBothFreeNow && (
                    <div className="absolute -top-2 -right-2 z-20">
                      <Badge className="bg-green-500 hover:bg-green-600 text-white border-2 border-white shadow-lg px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                        ✨ Both Free!
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* User Info */}
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{displayName}</h2>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Badge variant="secondary" className="bg-white/60 text-slate-600 border border-white shadow-sm hover:bg-white transition-colors py-1 px-3">{displayUniversity}</Badge>
                <Badge variant="secondary" className="bg-white/60 text-slate-600 border border-white shadow-sm hover:bg-white transition-colors py-1 px-3">{displayMajor}</Badge>
                <Badge variant="secondary" className="bg-white/60 text-slate-600 border border-white shadow-sm hover:bg-white transition-colors py-1 px-3">{displayYear}</Badge>
              </div>
              {displayBio && (
                <div className="max-w-lg mx-auto mt-4 px-6 py-4 bg-sky-50/50 rounded-2xl border border-sky-100">
                  <p className="text-sm text-slate-600 leading-relaxed italic">
                    "{displayBio}"
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both" style={{ animationDelay: '100ms' }}>
          <Button
            onClick={async () => {
              if (user.id) {
                await createConversation(user.id);
                if (onMessage) onMessage();
              }
            }}
            className="h-12 text-sm font-bold bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white shadow-lg shadow-sky-200/50 hover:scale-[1.02] transition-all rounded-xl"
          >
            💬 Message
          </Button>
          <Button
            variant="outline"
            className="h-12 text-sm font-bold border-white bg-white/50 hover:bg-white text-slate-600 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all rounded-xl"
          >
            ➕ Add Friend
          </Button>
        </div>

        {/* Quick Info Card */}
        <Card className="glass-card border-none shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">Quick Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aboutRows.map((row, idx) => (
                row.value && (
                  <div key={idx} className="flex flex-col p-3 rounded-xl bg-gray-50/50 border border-gray-200">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{row.label}</span>
                    {row.label === 'Email' && row.value && row.value !== '—' ? (
                      <a href={`mailto:${row.value}`} className="text-primary hover:underline truncate">{row.value}</a>
                    ) : (
                      <span className="text-foreground font-medium truncate">{row.value}</span>
                    )}
                  </div>
                )
              ))}
            </div>

            {displaySharedCourses && displaySharedCourses.length > 0 && (
              <div className="pt-4 border-t border-gray-100">
                <div className="text-sm font-semibold mb-3 text-primary">Shared Courses</div>
                <div className="flex flex-wrap gap-2">
                  {displaySharedCourses.slice(0, 6).map((course, i) => (
                    <Badge key={i} variant="secondary" className="bg-secondary/10 text-secondary border-secondary/30">
                      {course}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Tabs */}
        <Card className="glass-card border-none shadow-lg">
          <CardContent className="p-0">
            <Tabs defaultValue="timetable" className="w-full">
              <div className="border-b border-gray-100 bg-gray-50/50">
                <TabsList className="grid grid-cols-4 w-full h-12 bg-transparent rounded-none">
                  <TabsTrigger value="timetable" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-white data-[state=active]:text-primary">
                    Timetable
                  </TabsTrigger>
                  <TabsTrigger value="mutual" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-white data-[state=active]:text-indigo-500">
                    Mutual
                  </TabsTrigger>
                  <TabsTrigger value="interests" className="rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-white data-[state=active]:text-secondary">
                    Interests
                  </TabsTrigger>
                  <TabsTrigger value="clubs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-500 data-[state=active]:bg-white data-[state=active]:text-green-500">
                    Clubs
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-6">
                <TabsContent value="timetable" className="mt-0">
                  {Object.keys(sourceTimetable).length > 0 || displayTimetable.length > 0 ? (
                    <div className="space-y-6">
                      {days.map((day) => {
                        const classes = sourceTimetable[day] || [];
                        const hasClasses = classes.length > 0;
                        return (
                          <div key={day}>
                            <div className="text-sm font-bold mb-3 text-primary uppercase tracking-wider">{day}</div>
                            {hasClasses ? (
                              <div className="space-y-3">
                                {sortByTime(classes).map((cls, idx) => (
                                  <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50/50 rounded-xl border border-gray-100 hover:border-primary/30 transition-colors shadow-sm">
                                    <div className="flex flex-col items-center justify-center min-w-[5rem] h-12 bg-white rounded-lg border border-gray-200 shadow-sm">
                                      <span className="text-sm font-bold text-primary">{cls.time}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-foreground truncate">{cls.title || cls.course}</div>
                                      {cls.location && (
                                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">📍 {cls.location}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {(freeSlotsByDay[day] || []).map((time, i) => (
                                  <Badge key={i} variant="outline" className="px-3 py-1 border-gray-200 bg-gray-50 text-muted-foreground/70">🕘 Free at {time}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-gray-200 rounded-xl">
                      <p>No timetable shared</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="mutual" className="mt-0">
                  <div className="space-y-6">
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-800 text-sm mb-4">
                      <p className="font-semibold">🤝 Mutual Availability</p>
                      <p className="opacity-80">These are the times when both you and {displayName.split(' ')[0]} are free.</p>
                    </div>
                    {days.map((day) => {
                      const slots = mutualFreeSlots[day] || [];
                      const hasSlots = slots.length > 0;
                      if (!hasSlots) return null; // Hide days with no mutual slots? Or custom message
                      return (
                        <div key={day}>
                          <div className="text-sm font-bold mb-3 text-indigo-600 uppercase tracking-wider">{day}</div>
                          <div className="flex flex-wrap gap-2">
                            {slots.map((time, i) => (
                              <Badge key={i} variant="outline" className="px-3 py-1 border-indigo-200 bg-indigo-50 text-indigo-700 font-medium">✨ {time}</Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {Object.values(mutualFreeSlots).every(s => s.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-gray-200 rounded-xl">
                        <p>No mutual free slots found this week</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="interests" className="mt-0">
                  {displayInterests.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {displayInterests.map((interest: string, i: number) => (
                        <Badge key={i} variant="secondary" className="px-3 py-1 bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20 scale-100 hover:scale-105 transition-transform">
                          ⭐ {interest}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-gray-200 rounded-xl">
                      <p>No interests shared</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="clubs" className="mt-0">
                  {displayClubs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {displayClubs.map((club: string, i: number) => (
                        <Badge key={i} variant="secondary" className="px-3 py-1 bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20 scale-100 hover:scale-105 transition-transform">
                          🎯 {club}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-gray-200 rounded-xl">
                      <p>No clubs shared</p>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
