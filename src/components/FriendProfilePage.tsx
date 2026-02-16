import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { getFriendTimetable, type ClassItem, getEnhancedFriendProfile, type EnhancedFriendProfile, getProfile } from '../utils/firebase/firestore';

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

export function FriendProfilePage({ user, onBack }: { user: FriendUser; onBack: () => void }) {
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="mb-4">No profile selected.</div>
            <Button onClick={onBack} className="w-full" style={{ backgroundColor: '#C6ECFF', color: '#000' }}>
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
        } catch {}
      } catch (err) {
        console.warn('Failed to load enhanced friend profile', err);
      }
    };
    loadEnhanced();
  }, [user.id]);

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

  // Compute free slots per day based on source timetable
  const freeSlotsByDay = React.useMemo((): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    days.forEach((day) => {
      const classes = (sourceTimetable[day] || []) as ClassItem[];
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
  }, [sourceTimetable]);

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
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={onBack}
            className="flex items-center gap-2"
          >
            ← Back
          </Button>
          <h1 className="text-lg font-semibold">Profile</h1>
          <div className="w-16"></div> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Profile Header Card */}
        <Card className="overflow-hidden">
          <div className="relative h-32 bg-gradient-to-r from-blue-100 to-blue-200">
            <div className="absolute inset-0 bg-pattern opacity-10"></div>
          </div>
          <CardContent className="relative pt-0 pb-6">
            {/* Avatar positioned over the gradient */}
            <div className="flex justify-center -mt-12 mb-4">
              <div className="bg-white rounded-full p-2 shadow-lg">
                <Avatar className="w-20 h-20">
                  <AvatarFallback className="text-2xl font-semibold">
                    {(user.name || user.displayName || '?').charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            
            {/* User Info */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">{displayName}</h2>
              <p className="text-gray-600">
                {displayUniversity} • {displayMajor} • {displayYear}
              </p>
              {displayBio && (
                <p className="text-sm text-gray-700 max-w-md mx-auto leading-relaxed">
                  {displayBio}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            className="h-12 text-sm font-medium" 
            style={{ backgroundColor: '#C6ECFF', color: '#000' }}
          >
            💬 Message
          </Button>
          <Button 
            variant="outline" 
            className="h-12 text-sm font-medium"
          >
            ➕ Add Friend
          </Button>
        </div>

        {/* Quick Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aboutRows.map((row, idx) => (
              row.value && (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <span className="text-gray-600 font-medium">{row.label}</span>
                  {row.label === 'Email' && row.value && row.value !== '—' ? (
                    <a href={`mailto:${row.value}`} className="text-blue-600 hover:underline">{row.value}</a>
                  ) : (
                    <span className="text-gray-900">{row.value}</span>
                  )}
                </div>
              )
            ))}
            
            {displaySharedCourses && displaySharedCourses.length > 0 && (
              <div className="pt-3">
                <div className="text-sm font-medium mb-2 text-gray-700">Shared Courses</div>
                <div className="flex flex-wrap gap-2">
                  {displaySharedCourses.slice(0, 6).map((course, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {course}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs defaultValue="timetable" className="w-full">
              <div className="border-b">
                <TabsList className="grid grid-cols-3 w-full h-12 bg-transparent rounded-none">
                  <TabsTrigger value="timetable" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                    Timetable
                  </TabsTrigger>
                  <TabsTrigger value="interests" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                    Interests
                  </TabsTrigger>
                  <TabsTrigger value="clubs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                    Clubs
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-6">
                <TabsContent value="timetable" className="mt-0">
                  {Object.keys(sourceTimetable).length > 0 || displayTimetable.length > 0 ? (
                    <div className="space-y-4">
                      {days.map((day) => {
                        const classes = sourceTimetable[day] || [];
                        const hasClasses = classes.length > 0;
                        return (
                          <div key={day}>
                            <div className="text-sm font-medium mb-2 text-gray-700">{day}</div>
                            {hasClasses ? (
                              <div className="space-y-2">
                                {sortByTime(classes).map((cls, idx) => (
                                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                    <div className="flex flex-col items-center min-w-0 w-20">
                                      <span className="text-sm font-semibold text-gray-900">{cls.time}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 truncate">{cls.title || cls.course}</div>
                                      {cls.location && (
                                        <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">📍 {cls.location}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {(freeSlotsByDay[day] || []).map((time, i) => (
                                  <Badge key={i} variant="secondary" className="px-3 py-1">🕘 Free at {time}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No timetable shared</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="interests" className="mt-0">
                  {displayInterests.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {displayInterests.map((interest, i) => (
                        <Badge key={i} variant="secondary" className="px-3 py-1">
                          ⭐ {interest}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No interests shared</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="clubs" className="mt-0">
                  {displayClubs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {displayClubs.map((club, i) => (
                        <Badge key={i} variant="secondary" className="px-3 py-1">
                          🎯 {club}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
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
