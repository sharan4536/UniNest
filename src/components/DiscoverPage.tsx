import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import { sendFriendRequest, UserProfile, getEnhancedFriendProfile, EnhancedFriendProfile, getProfile, getFriendTimetable, type ClassItem, getAllUsers, getFriends, CampusEvent, getUpcomingEvents, loadTimetable, seedTestEvent, createConversation, getSOSAlerts, SOSAlert, createCampusEvent } from '../utils/firebase/firestore';
import { EventCard } from './EventCard';
import { EventChat } from './EventChat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
// Supabase removed

type SuggestedUser = {
  id: string;
  name: string;
  major: string;
  year: string;
  mutualFriends?: number;
  sharedCourses?: string[];
  bio?: string;
  interests?: string[];
  online?: boolean;
  university?: string;
  clubs?: string[];
};

// Coursemates are derived in real-time from friends who share courses

export function DiscoverPage({ currentUser, onOpenProfile, onMessage }: { currentUser?: unknown; onOpenProfile?: (user: SuggestedUser) => void; onMessage?: () => void }) {
  console.log('🎯 DiscoverPage component is rendering!');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('friends');
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [acceptedFriendIds, setAcceptedFriendIds] = useState<Set<string>>(new Set());
  const [friendsUsers, setFriendsUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<SuggestedUser | null>(null);
  const [enhancedProfile, setEnhancedProfile] = useState<EnhancedFriendProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [latestTimetable, setLatestTimetable] = useState<Array<{ day: string; time: string; title: string; where?: string }>>([]);

  // Events State
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [myTimetable, setMyTimetable] = useState<Record<string, ClassItem[]>>({});
  const [showBuddyModal, setShowBuddyModal] = useState<boolean>(false);
  const [selectedEventForBuddy, setSelectedEventForBuddy] = useState<CampusEvent | null>(null);
  const [buddyMatches, setBuddyMatches] = useState<{ user: SuggestedUser, status: string, isGoingAlone: boolean }[]>([]);

  const [showChatModal, setShowChatModal] = useState<boolean>(false);
  const [selectedEventForChat, setSelectedEventForChat] = useState<CampusEvent | null>(null);

  // Vibe Filter & Event Creation State
  const VIBE_CATEGORIES = ['All', 'Chill', 'Loud', 'Dance', 'Academic', 'Cultural', 'Sports', 'Mixed crowd'];
  const [selectedVibe, setSelectedVibe] = useState<string>('All');
  const [showCreateEventModal, setShowCreateEventModal] = useState<boolean>(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    location: '',
    vibeTags: [] as string[],
    crowdSize: 'Medium',
    buddyMatchingEnabled: true,
  });

  // SOS Alerts State
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);

  useEffect(() => {
    const unsubSOS = getSOSAlerts((alerts) => setSosAlerts(alerts));
    return () => unsubSOS();
  }, []);

  useEffect(() => {
    // Load Events and My Timetable
    const loadEventsData = async () => {
      const evs = await getUpcomingEvents();
      setEvents(evs);

      const myT = await loadTimetable();
      setMyTimetable(myT);
    };
    loadEventsData();
  }, []); // Empty dependency array to run once on mount

  // Fetch buddies for selected event
  useEffect(() => {
    const fetchBuddies = async () => {
      if (!selectedEventForBuddy) return;
      setBuddyMatches([]);
      const attendees = await import('../utils/firebase/firestore').then(m => m.getEventAttendees(selectedEventForBuddy.id));

      const matches: { user: SuggestedUser, status: string, isGoingAlone: boolean }[] = [];

      attendees.forEach(att => {
        // Find in friends list
        const friend = friendsUsers.find(f => f.id === att.userId);
        if (friend && acceptedFriendIds.has(friend.id)) {
          matches.push({
            user: friend,
            status: att.status,
            isGoingAlone: att.isGoingAlone
          });
        }
      });

      // Sort: Going Alone first, then by name
      matches.sort((a, b) => {
        if (a.isGoingAlone && !b.isGoingAlone) return -1;
        if (!a.isGoingAlone && b.isGoingAlone) return 1;
        return a.user.name.localeCompare(b.user.name);
      });

      setBuddyMatches(matches);
    };
    fetchBuddies();
  }, [selectedEventForBuddy, friendsUsers, acceptedFriendIds]); // Added dependencies

  useEffect(() => {
    // Subscribe to all registered users of UniNest (excluding the current user)
    const unsubscribe = getAllUsers(async (list) => {
      const transformed = await Promise.all(
        list.map(async (u) => {
          let profileDoc: any = null;
          try { profileDoc = await getProfile(u.uid); } catch { }
          const base = transformUserProfileToSuggestedUser(u);
          let enhanced: EnhancedFriendProfile | null = null;
          try { enhanced = await getEnhancedFriendProfile(u.uid); } catch { }
          return {
            ...base,
            name: (profileDoc?.name ?? enhanced?.displayName ?? base.name),
            university: (profileDoc?.university ?? enhanced?.university ?? base.university),
            major: (profileDoc?.major ?? enhanced?.major ?? base.major),
            year: (profileDoc?.year ?? enhanced?.year ?? base.year),
            bio: (profileDoc?.bio ?? enhanced?.bio ?? base.bio),
            interests: (profileDoc?.interests ?? enhanced?.interests ?? base.interests),
            clubs: (profileDoc?.clubs ?? enhanced?.clubs ?? []),
            sharedCourses: (enhanced?.sharedCourses ?? base.sharedCourses ?? [])
          } as SuggestedUser;
        })
      );
      setFriendsUsers(transformed);
    });
    return () => { unsubscribe && unsubscribe(); };
  }, []);

  // Subscribe to accepted friends to gate the Add Friend button
  useEffect(() => {
    const unsubscribeFriends = getFriends((friendsList: UserProfile[]) => {
      const ids = new Set<string>(friendsList.map((f) => f.uid));
      setAcceptedFriendIds(ids);
    });
    return () => { unsubscribeFriends && unsubscribeFriends(); };
  }, []);

  // Function to handle profile click and fetch enhanced data
  const handleProfileClick = async (user: SuggestedUser) => {
    setSelectedUser(user);
    setLoadingProfile(true);
    setEnhancedProfile(null);
    setLatestTimetable([]);

    try {
      if (isFirebaseConfigured && auth.currentUser) {
        console.log('🔍 Fetching enhanced profile for user:', user.id);
        const enhanced = await getEnhancedFriendProfile(user.id);
        setEnhancedProfile(enhanced);
        console.log('✅ Enhanced profile loaded:', enhanced);
      }
    } catch (error) {
      console.error('❌ Error loading enhanced profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Fetch the latest timetable for the selected user to avoid stale data
  useEffect(() => {
    const loadLatestTimetable = async () => {
      try {
        if (!selectedUser?.id) return;
        const raw = await getFriendTimetable(selectedUser.id);
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
        setLatestTimetable(arr);
      } catch (e) {
        console.warn('Failed to load latest timetable for selected user', e);
      }
    };
    loadLatestTimetable();
  }, [selectedUser?.id]);

  // Helper function to transform UserProfile to SuggestedUser
  const transformUserProfileToSuggestedUser = (userProfile: UserProfile): SuggestedUser => {
    return {
      id: userProfile.uid || 'unknown',
      name: userProfile.displayName || 'Unknown User',
      major: userProfile.major || 'Unknown Major',
      year: userProfile.year || 'Unknown Year',
      bio: userProfile.bio || undefined,
      interests: userProfile.interests || [],
      online: userProfile.status === 'available' || userProfile.status === 'in library' || userProfile.status === 'in ground',
      university: userProfile.university || 'Unknown University',
      mutualFriends: 0, // TODO: Calculate mutual friends
      sharedCourses: [], // TODO: Calculate shared courses
      clubs: userProfile.clubs || []
    };
  };

  const [addingFriend, setAddingFriend] = useState<string | null>(null);

  const handleSendRequest = async (userId: string): Promise<void> => {
    setAddingFriend(userId);
    try {
      if (isFirebaseConfigured && auth.currentUser) {
        // Send friend request using Firebase
        await sendFriendRequest(userId);
      } else {
        // Supabase removed: directly mark request as sent in mock mode
      }
      setSentRequests(new Set([...sentRequests, userId]));
    } catch (error) {
      console.error('Error sending friend request:', error);
    } finally {
      setAddingFriend(null);
    }
  };

  const filteredFriends: SuggestedUser[] = friendsUsers.filter((user: SuggestedUser) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.major.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.interests?.some((interest) => interest.toLowerCase().includes(searchQuery.toLowerCase())) ?? false)
  );

  // Buddies: restrict to already accepted friends only
  const buddiesSource: SuggestedUser[] = friendsUsers.filter((u) => acceptedFriendIds.has(u.id));
  const filteredBuddies: SuggestedUser[] = buddiesSource.filter((user: SuggestedUser) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.major.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.interests?.some((interest) => interest.toLowerCase().includes(searchQuery.toLowerCase())) ?? false)
  );

  // Derive coursemates from friends with shared courses
  const coursematesDerived: SuggestedUser[] = friendsUsers.filter((u) => (u.sharedCourses?.length ?? 0) > 0);
  const filteredCoursemates: SuggestedUser[] = coursematesDerived.filter((mate: SuggestedUser) =>
    mate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (mate.sharedCourses?.join(' ').toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  // Load my clubs
  const [myClubs, setMyClubs] = useState<string[]>([]);
  useEffect(() => {
    const loadMyProfileClubs = async () => {
      try {
        if (isFirebaseConfigured && auth.currentUser?.uid) {
          const profile = await getProfile(auth.currentUser.uid);
          const clubs = Array.isArray(profile?.clubs) ? (profile!.clubs as string[]) : [];
          setMyClubs(clubs);
        }
      } catch {
        setMyClubs([]);
      }
    };
    loadMyProfileClubs();
  }, []);

  // Helper: get mutual clubs between me and a friend
  const getMutualClubs = (u: SuggestedUser): string[] => {
    const friendClubs = Array.isArray(u.clubs) ? u.clubs : [];
    if (!friendClubs.length || !myClubs.length) return [];
    const mineSet = new Set(myClubs.map((c) => (c || '').toLowerCase().trim()));
    const mutual = friendClubs.filter((c) => mineSet.has((c || '').toLowerCase().trim()));
    // Deduplicate, preserve original casing of friend's club names
    return Array.from(new Set(mutual));
  };

  // Derive mutual club members
  const mutualClubMembers: SuggestedUser[] = friendsUsers.filter((u) => getMutualClubs(u).length > 0);
  const filteredMutualClubMembers: SuggestedUser[] = mutualClubMembers.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (getMutualClubs(u).join(' ').toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Sorting
  const [sortBy, setSortBy] = useState<string>('name');
  const sortUsers = (arr: SuggestedUser[]): SuggestedUser[] => {
    const copy = [...arr];
    switch (sortBy) {
      case 'name':
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'major':
        return copy.sort((a, b) => (a.major || '').localeCompare(b.major || ''));
      case 'online':
        return copy.sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)));
      case 'sharedCourses':
        return copy.sort((a, b) => (b.sharedCourses?.length || 0) - (a.sharedCourses?.length || 0));
      case 'mutualClubs':
        return copy.sort((a, b) => getMutualClubs(b).length - getMutualClubs(a).length);
      default:
        return copy;
    }
  };

  // Navigate to full FriendProfile page with enhanced data when a card is clicked
  const openPersonProfile = async (person: SuggestedUser) => {
    try {
      if (onOpenProfile && person?.id) {
        // Load enhanced data (users collection + converted timetable)
        const enhanced = await getEnhancedFriendProfile(person.id);
        // Load rich profile data (profiles collection)
        let profileDoc: any = null;
        try {
          profileDoc = await getProfile(person.id);
        } catch { }

        const user = {
          id: person.id,
          name: (profileDoc?.name || enhanced?.displayName || person.name || 'User'),
          major: (profileDoc?.major ?? enhanced?.major ?? person.major),
          year: (profileDoc?.year ?? enhanced?.year ?? person.year),
          university: (profileDoc?.university ?? enhanced?.university),
          email: enhanced?.email,
          bio: (profileDoc?.bio ?? enhanced?.bio),
          interests: (profileDoc?.interests ?? enhanced?.interests),
          clubs: (profileDoc?.clubs ?? enhanced?.clubs),
          timetable: enhanced?.timetable,
          sharedCourses: person.sharedCourses ?? enhanced?.sharedCourses,
        } as any;
        onOpenProfile(user);
        return;
      }
    } catch (e) {
      console.warn('Failed to load enhanced profile, falling back to inline dialog', e);
    }
    // Fallback: show inline dialog with enhanced details
    handleProfileClick(person);
  };

  const FriendCard: React.FC<{ person: SuggestedUser; type?: 'friends' | 'suggested' | 'coursemates' | 'coursemate' | 'mutualClubs' | 'buddies' }> = ({ person, type = 'friends' }) => (
    <div
      className={`group rounded-2xl bg-white/40 border border-white/60 p-4 transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:-translate-y-1 ${type === 'friends' ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={type === 'friends' ? undefined : () => openPersonProfile(person)}
    >
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar className="w-14 h-14 ring-2 ring-white shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-sky-100 to-blue-200 text-sky-700 font-bold">{person.name.charAt(0)}</AvatarFallback>
          </Avatar>
          {person.online && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 border-2 border-white rounded-full shadow-sm"></div>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-slate-800 group-hover:text-sky-600 transition-colors">{person.name}</h3>
              <p className="text-sm text-slate-500 font-medium">{person.major} • {person.year}</p>
            </div>
            {(type === 'suggested' || type === 'friends' || type === 'buddies') && (
              acceptedFriendIds.has(person.id) ? (
                <div className="flex gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-700 border-green-200 text-xs px-2 py-0.5"
                  >
                    Friends ✅
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full text-xs font-medium bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700 border-sky-100 px-3 cursor-pointer z-10"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await createConversation(person.id);
                      if (onMessage) onMessage();
                    }}
                  >
                    💬 Message
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleSendRequest(person.id); }}
                  disabled={sentRequests.has(person.id)}
                  className={`h-8 rounded-full text-xs font-medium transition-all ${sentRequests.has(person.id) ? 'bg-slate-100 text-slate-400' : 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700'}`}
                >
                  {sentRequests.has(person.id) ? 'Sent' : 'Add +'}
                </Button>
              )
            )}
          </div>

          {(type === 'suggested') && (() => {
            const u = person as SuggestedUser;
            return (
              <>
                <p className="text-sm mt-3 text-slate-600 line-clamp-2">{u.bio || 'No bio available'}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <span>🎓</span>
                  <span>{u.university}</span>
                </div>
                {u.interests && u.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {u.interests.slice(0, 3).map((interest, index) => (
                      <Badge key={index} variant="secondary" className="text-[10px] bg-white text-slate-500 border-slate-200">
                        {interest}
                      </Badge>
                    ))}
                    {u.interests.length > 3 && (
                      <Badge variant="secondary" className="text-[10px] bg-white text-slate-400 border-slate-200">+{u.interests.length - 3}</Badge>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {(type === 'coursemate' || type === 'coursemates') && (() => {
            const u = person as SuggestedUser;
            const courses = u.sharedCourses ?? [];
            return (
              <div className="mt-3 bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 mb-2">
                  <span>📖</span>
                  <span>Shared Courses</span>
                </div>
                {courses.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {courses.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] bg-white text-indigo-600 border-indigo-200 shadow-sm">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-indigo-400 italic">No shared courses identified</div>
                )}
              </div>
            );
          })()}

          {(type === 'mutualClubs') && (() => {
            const mutual = getMutualClubs(person);
            return (
              <div className="mt-3 bg-emerald-50/50 rounded-xl p-3 border border-emerald-100/50">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 mb-2">
                  <span>🏛️</span>
                  <span>Mutual Clubs</span>
                </div>
                {mutual.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {mutual.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] bg-white text-emerald-600 border-emerald-200 shadow-sm">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-400 italic">No mutual clubs identified</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  // Helper to render enhanced profile content without inline IIFE
  const renderProfileContent = (): React.ReactNode => {
    const u = selectedUser as SuggestedUser;
    const profile = enhancedProfile;

    const displayInterests = profile?.interests?.length ? profile.interests : (u?.interests ?? []);
    const displayClubs = profile?.clubs?.length ? profile.clubs : [];
    const displayTimetable = (latestTimetable.length > 0) ? latestTimetable : (profile?.timetable?.length ? profile.timetable : []);
    const displaySharedCourses = profile?.sharedCourses?.length ? profile.sharedCourses : (u?.sharedCourses ?? []);

    // Sort timetable entries by day (Mon→Sun) and time (AM→PM)
    const dayOrder: Record<string, number> = {
      MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6,
    };
    const normalizeDay = (d: string | undefined): number => {
      if (!d) return 99;
      const key = d.slice(0, 3).toUpperCase();
      return dayOrder[key] ?? 99;
    };
    const toMinutes = (t: string | undefined): number => {
      if (!t) return 24 * 60;
      const m = t.trim().match(/^([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$/i);
      if (!m) return 24 * 60;
      let hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const ap = m[3].toUpperCase();
      if (ap === 'AM') {
        if (hh === 12) hh = 0; // 12:xx AM → 0:xx
      } else {
        if (hh !== 12) hh += 12; // PM add 12 except 12 PM
      }
      return hh * 60 + mm;
    };
    const sortedTimetable = [...displayTimetable].sort((a: any, b: any) => {
      const dayDiff = normalizeDay(a.day) - normalizeDay(b.day);
      if (dayDiff !== 0) return dayDiff;
      return toMinutes(a.time) - toMinutes(b.time);
    });

    return (
      <div className="space-y-4 overflow-y-auto flex-1 pr-2">
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border border-primary/10">
          <Avatar className="w-16 h-16 border-2 border-white shadow-md">
            <AvatarFallback className="text-xl bg-primary/20 text-primary">
              {u?.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground">{u?.name}</h3>
            <p className="text-muted-foreground">
              {profile?.university || (u as any).university || 'University'} • {profile?.major || u?.major} • {profile?.year || u?.year}
            </p>
            {profile?.mutualFriends !== undefined ? (
              <Badge variant="secondary" className="mt-1 bg-white/50 border-gray-200">
                {profile.mutualFriends} mutual friends
              </Badge>
            ) : ('mutualFriends' in (u || {})) && (
              <Badge variant="secondary" className="mt-1 bg-white/50 border-gray-200">
                {(u as any).mutualFriends}
              </Badge>
            )}
          </div>
        </div>

        {(profile?.bio || ((('bio' in (u || {})) && (u as any).bio))) && (
          <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
            <h4 className="font-medium mb-2 text-foreground">About</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{profile?.bio || ((('bio' in (u || {})) ? (u as any).bio : ''))}</p>
          </div>
        )}

        <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
          <h4 className="font-medium mb-3 text-foreground">Quick Info</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-gray-100/50">
              <span className="text-muted-foreground font-medium">University</span>
              <span className="text-foreground">{profile?.university || (u as any).university || 'University'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-gray-100/50">
              <span className="text-muted-foreground font-medium">Major</span>
              <span className="text-foreground">{profile?.major || u?.major}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-gray-100/50">
              <span className="text-muted-foreground font-medium">Year</span>
              <span className="text-foreground">{profile?.year || u?.year}</span>
            </div>
          </div>
        </div>

        {displaySharedCourses.length > 0 && (
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
            <h4 className="font-medium mb-2 text-primary">Shared Courses</h4>
            <div className="flex flex-wrap gap-2">
              {displaySharedCourses.map((course, i) => (
                <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  📚 {course}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="interests" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="interests">Interests</TabsTrigger>
            <TabsTrigger value="clubs">Activities</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="interests" className="mt-4">
            <div className="flex flex-wrap gap-2">
              {displayInterests.map((interest, i) => (
                <Badge key={i} variant="secondary" className="px-3 py-1">
                  ⭐ {interest}
                </Badge>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="clubs" className="mt-4">
            <div className="space-y-2">
              {displayClubs.map((club, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-secondary/5 rounded border border-secondary/10">
                  <span className="text-secondary">🏛️</span>
                  <span>{club}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <div className="space-y-2">
              {sortedTimetable.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-gray-50/50 rounded border border-gray-100">
                  <div>
                    <div className="font-medium text-foreground">
                      {'subject' in (item as any) ? (item as any).subject : (item as any).title}
                    </div>
                    <div className="text-sm text-muted-foreground">{(item as any).day} • {(item as any).time}</div>
                  </div>
                  <div className="text-sm text-foreground/70">
                    {'location' in (item as any) ? (item as any).location : (item as any).where || 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-24">
      <div className="text-center mb-8 slide-up-fade" style={{ animationDelay: '0.1s' }}>
        <h1 className="text-4xl font-bold text-gradient mb-2 tracking-tight">Discover Friends</h1>
        <p className="text-slate-500 font-medium">Connect with fellow students at your university</p>
      </div>

      {/* Search Bar */}
      <Card className="glass-card border-none slide-up-fade" style={{ animationDelay: '0.2s' }}>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="relative md:col-span-2 group">
              <Input
                placeholder="Search by name, major, interests, courses, or clubs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 rounded-full border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all duration-300"
              />
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors">
                <span className="text-lg">🔍</span>
              </div>
            </div>
            <div>
              <div className="relative">
                <select
                  className="w-full h-12 pl-4 pr-10 appearance-none bg-slate-50/50 border border-slate-200 rounded-full text-slate-600 focus:outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all cursor-pointer hover:bg-white"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="name">Sort by Name</option>
                  <option value="major">Sort by Major</option>
                  <option value="online">Sort by Online</option>
                  <option value="sharedCourses">Sort by Courses</option>
                  <option value="mutualClubs">Sort by Clubs</option>
                </select>
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                  ⌄
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Needs Help Right Now - SOS Block */}
      {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).length > 0 && (
        <div className="mb-6 slide-up-fade" style={{ animationDelay: '0.25s' }}>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-3 text-red-600">
            <span className="animate-pulse">🔴</span> Needs help right now
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).map(sos => {
              const friend = friendsUsers.find(f => f.id === sos.createdBy);
              if (!friend) return null;
              return (
                <div key={sos.id} className="min-w-[280px] bg-red-50 border border-red-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Avatar className="w-8 h-8"><AvatarFallback className="bg-red-100 text-red-700 font-bold">{friend.name.charAt(0)}</AvatarFallback></Avatar>
                       <span className="font-bold text-sm text-slate-800">{friend.name}</span>
                    </div>
                    <Badge variant="outline" className="bg-white text-red-600 border-red-200 shadow-sm border-dashed">SOS</Badge>
                  </div>
                  <div className="bg-white/60 p-3 rounded-xl border border-white">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 tracking-wider uppercase">{sos.course || 'General Help'}</p>
                    <p className="text-sm font-medium text-slate-800">{sos.topic}</p>
                  </div>
                  <Button 
                    size="sm" 
                    className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-md shadow-red-200/50 mt-1 transition-all"
                    onClick={() => {
                        createConversation(friend.id).then(() => {
                           if (onMessage) onMessage();
                        });
                    }}
                  >
                    🤝 Offer Help
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="slide-up-fade" style={{ animationDelay: '0.3s' }}>
        <div className="bg-slate-100/50 p-1 rounded-full inline-flex w-full mb-6 relative">
          <TabsList className="grid w-full grid-cols-4 bg-transparent h-12 p-0 gap-1">
            <TabsTrigger
              value="events"
              className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all duration-300 ease-out py-2"
            >
              Events 🔥
            </TabsTrigger>
            <TabsTrigger
              value="friends"
              className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all duration-300 ease-out py-2"
            >
              Find Friends
            </TabsTrigger>
            <TabsTrigger
              value="coursemates"
              className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all duration-300 ease-out py-2"
            >
              Buddy's
            </TabsTrigger>
            <TabsTrigger
              value="mutualClubs"
              className="rounded-full data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all duration-300 ease-out py-2"
            >
              Mutual Clubs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="events" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-slate-800">What's Happening</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateEventModal(true)} className="text-sm text-sky-600 hover:text-sky-700 hover:bg-sky-50 font-bold">
              + Create Event
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {VIBE_CATEGORIES.map(vibe => (
              <Button
                key={vibe}
                size="sm"
                variant={selectedVibe === vibe ? 'default' : 'outline'}
                className={`rounded-full shadow-sm flex-none ${selectedVibe === vibe ? 'bg-sky-500 hover:bg-sky-600 text-white border-0' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                onClick={() => setSelectedVibe(vibe)}
              >
                {vibe === 'All' ? '🌟 All' : vibe}
              </Button>
            ))}
          </div>

          {(() => {
            const filteredEvents = selectedVibe === 'All' 
              ? events 
              : events.filter(e => e.vibeTags?.includes(selectedVibe));
              
            return filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {filteredEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    userTimetable={myTimetable}
                    onFindBuddy={(evt) => {
                      setSelectedEventForBuddy(evt);
                      setShowBuddyModal(true);
                    }}
                    onOpenChat={(evt) => {
                      setSelectedEventForChat(evt);
                      setShowChatModal(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 opacity-75">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-slate-500 font-medium">No {selectedVibe.toLowerCase()} events found.</p>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="friends" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
          <Card className="glass-card border-none min-h-[400px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <span className="text-2xl">✨</span>
                Friends ({sortUsers(filteredFriends).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-400">Loading friends...</p>
                </div>
              ) : sortUsers(filteredFriends).length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {sortUsers(filteredFriends).map((friend) => (
                    <FriendCard key={friend.id} person={friend} type="friends" />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 opacity-75">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-slate-500 font-medium">{searchQuery ? 'No friends found matching your search.' : 'No friends yet.'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coursemates" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
          <Card className="glass-card border-none min-h-[400px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <span className="text-2xl">👥</span>
                Buddy's ({sortUsers(filteredBuddies).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortUsers(filteredBuddies).length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {sortUsers(filteredBuddies).map((friend) => (
                    <FriendCard key={friend.id} person={friend} type="buddies" />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 opacity-75">
                  <div className="text-4xl mb-3">📚</div>
                  <p className="text-slate-500 font-medium">{searchQuery ? 'No buddies found matching your search.' : 'No buddies found.'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mutualClubs" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
          <Card className="glass-card border-none min-h-[400px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <span className="text-2xl">🏛️</span>
                Mutual Club Members ({sortUsers(filteredMutualClubMembers).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortUsers(filteredMutualClubMembers).length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {sortUsers(filteredMutualClubMembers).map((member) => (
                    <FriendCard key={member.id} person={member} type="mutualClubs" />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 opacity-75">
                  <div className="text-4xl mb-3">🎯</div>
                  <p className="text-slate-500 font-medium">{searchQuery ? 'No mutual club members match your search.' : 'No mutual club members found.'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Enhanced Profile Dialog */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={(open: boolean) => { if (!open) { setSelectedUser(null); setEnhancedProfile(null); } }}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col glass-panel border-white/60 p-0 text-slate-800 shadow-2xl sm:rounded-3xl">
            <DialogHeader className="flex-shrink-0 p-6 border-b border-gray-100/50">
              <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600">{(selectedUser as SuggestedUser)?.name}</DialogTitle>
            </DialogHeader>
            {loadingProfile ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-400 font-medium">Loading profile details...</p>
                </div>
              </div>
            ) : (
              renderProfileContent()
            )}
            <div className="p-4 border-t border-white/10 flex bg-white/40 backdrop-blur-md">
              <Button
                onClick={() => setSelectedUser(null)}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold shadow-md shadow-sky-200/50"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Buddy Finding Modal */}
      <Dialog open={showBuddyModal} onOpenChange={setShowBuddyModal}>
        <DialogContent className="max-w-md glass-panel border-white/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">
              Find a Buddy for {selectedEventForBuddy?.title}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              These friends are also interested or going!
            </p>
          </DialogHeader>

          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            {buddyMatches.length > 0 ? (
              buddyMatches.map(({ user, status, isGoingAlone }) => (
                <div key={user.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/50 border border-white/60 shadow-sm hover:shadow-md transition-all">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-sky-100 text-sky-600 font-bold">{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800">{user.name}</h4>
                    <div className="flex gap-2 text-xs mt-1">
                      <Badge variant="secondary" className={status === 'attending' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>
                        {status === 'attending' ? 'Going' : 'Interested'}
                      </Badge>
                      {isGoingAlone && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                          Going Alone 🥺
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" className="rounded-full bg-sky-500 hover:bg-sky-600" onClick={() => {
                    // Open chat or profile
                    setShowBuddyModal(false);
                    openPersonProfile(user);
                  }}>
                    Connect
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🦗</div>
                <p className="text-slate-500">No friends found for this event yet.</p>
                <p className="text-xs text-slate-400 mt-2">Be the first to build the hype!</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Chat Modal */}
      <Dialog open={showChatModal} onOpenChange={setShowChatModal}>
        <DialogContent className="max-w-md glass-panel border-white/60 p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-slate-100/50 bg-white/40 backdrop-blur-md">
            <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
              💬 {selectedEventForChat?.title} <span className="text-xs font-normal text-slate-500">Chat</span>
            </DialogTitle>
          </DialogHeader>
          {selectedEventForChat && (
            <EventChat
              eventId={selectedEventForChat.id}
              eventTitle={selectedEventForChat.title}
              onClose={() => setShowChatModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateEventModal} onOpenChange={setShowCreateEventModal}>
        <DialogContent className="glass-panel border-white/50 p-6 rounded-3xl max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-800">Create Campus Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Event Title</label>
              <Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g. Midnight Hackathon" className="bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
              <Input value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="What's happening?" className="bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Location</label>
              <Input value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} placeholder="e.g. Student Center" className="bg-slate-50 border-slate-200" />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Expected Crowd Size</label>
              <select 
                value={newEvent.crowdSize} 
                onChange={e => setNewEvent({...newEvent, crowdSize: e.target.value})}
                className="w-full text-sm p-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-300"
              >
                <option value="Intimate">Intimate (under 50)</option>
                <option value="Medium">Medium (50–200)</option>
                <option value="Large">Large (200+)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Vibe Tags (Multi-select)</label>
              <div className="flex flex-wrap gap-2">
                {VIBE_CATEGORIES.filter(v => v !== 'All').map(tag => {
                  const isSelected = newEvent.vibeTags.includes(tag);
                  return (
                    <Badge 
                      key={tag}
                      variant="outline" 
                      className={`cursor-pointer border-slate-200 ${isSelected ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      onClick={() => {
                        const tags = isSelected ? newEvent.vibeTags.filter(t => t !== tag) : [...newEvent.vibeTags, tag];
                        setNewEvent({...newEvent, vibeTags: tags});
                      }}
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-slate-700">Buddy Matching</label>
                <p className="text-xs text-slate-500">Allow people to look for company</p>
              </div>
              <div className="cursor-pointer" onClick={() => setNewEvent({...newEvent, buddyMatchingEnabled: !newEvent.buddyMatchingEnabled})}>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${newEvent.buddyMatchingEnabled ? 'bg-sky-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${newEvent.buddyMatchingEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </div>
            </div>

            <Button 
              className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-lg mt-2"
              onClick={async () => {
                if (!newEvent.title) return;
                // Auto generate time (mocking 2 hours from now)
                const start = new Date();
                start.setHours(start.getHours() + 2);
                const end = new Date(start);
                end.setHours(end.getHours() + 2);

                const { Timestamp } = await import('firebase/firestore');

                await createCampusEvent({
                  title: newEvent.title,
                  description: newEvent.description,
                  location: newEvent.location,
                  vibeTags: newEvent.vibeTags,
                  crowdSize: newEvent.crowdSize,
                  buddyMatchingEnabled: newEvent.buddyMatchingEnabled,
                  collegeId: "VIT",
                  clubName: "Student Organized",
                  clubId: "student_1",
                  startTime: Timestamp.fromDate(start),
                  endTime: Timestamp.fromDate(end),
                  tags: ["Social"],
                });
                
                // Refresh events
                const evs = await getUpcomingEvents();
                setEvents(evs);
                setShowCreateEventModal(false);
                setNewEvent({ title: '', description: '', location: '', vibeTags: [], crowdSize: 'Medium', buddyMatchingEnabled: true });
              }}
            >
              Publish Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
