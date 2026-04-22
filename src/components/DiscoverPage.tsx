import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import { sendFriendRequest, UserProfile, getEnhancedFriendProfile, EnhancedFriendProfile, getProfile, getFriendTimetable, type ClassItem, getAllUsers, getFriends, CampusEvent, getUpcomingEventsRealtime, loadTimetable, seedTestEvent, createConversation, getSOSAlerts, SOSAlert, createCampusEvent, getCheckIns, type CheckIn } from '../utils/firebase/firestore';
import { EventCard } from './EventCard';
import { EventChat } from './EventChat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
// Supabase removed
import { Search, Plus, MessageCircle, UserPlus, SlidersHorizontal, Globe2, MapPin, Compass } from 'lucide-react';
import { computeCommonFreeSlots, formatTimeLabel } from '../utils/scheduleCompare';
import { formatEmailToName } from '../utils/nameUtils';

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

  // SOS Alerts & CheckIns State
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [showStudyGroupModal, setShowStudyGroupModal] = useState<boolean>(false);
  const [selectedFriendForStudy, setSelectedFriendForStudy] = useState<SuggestedUser | null>(null);
  const [commonFreeSlots, setCommonFreeSlots] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const unsubSOS = getSOSAlerts((alerts) => setSosAlerts(alerts));
    const unsubCheckins = getCheckIns((cks) => setCheckins(cks));
    return () => { unsubSOS(); unsubCheckins(); };
  }, []);

  useEffect(() => {
    if (selectedFriendForStudy) {
      const fetchFreeTime = async () => {
        const friendTimetable = await getFriendTimetable(selectedFriendForStudy.id);
        const common = computeCommonFreeSlots(myTimetable, friendTimetable);
        setCommonFreeSlots(common);
      };
      fetchFreeTime();
    }
  }, [selectedFriendForStudy, myTimetable]);

  useEffect(() => {
    // Load Events and My Timetable
    const unsubscribeEvents = getUpcomingEventsRealtime((evs) => {
      // Sort: Sponsored first, then by startTime
      const sortedEvs = [...evs].sort((a, b) => {
        if (a.isSponsored && !b.isSponsored) return -1;
        if (!a.isSponsored && b.isSponsored) return 1;
        return a.startTime.toMillis() - b.startTime.toMillis();
      });
      setEvents(sortedEvs);
    });

    const loadTimetableData = async () => {
      const myT = await loadTimetable();
      setMyTimetable(myT);
    };
    loadTimetableData();

    return () => unsubscribeEvents();
  }, []); // Runs once on mount, sets up listener and loads timetable

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
      // Filter out current user immediately
      const others = list.filter(u => u.uid !== auth.currentUser?.uid);
      
      const transformed = others.map((u) => {
        return transformUserProfileToSuggestedUser(u);
      });
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
      name: formatEmailToName(userProfile.displayName || userProfile.email),
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
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Profile Header */}
        <div className="relative pb-6">
          <div className="h-32 bg-gradient-to-br from-sky-400/20 to-violet-400/20 rounded-b-[2rem]" />
          <div className="absolute top-16 left-0 right-0 flex flex-col items-center">
            <Avatar className="h-24 w-24 border-4 border-white shadow-xl">
              <AvatarFallback className="bg-sky-100 text-2xl font-bold text-sky-700">
                {u?.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="mt-3 text-center px-6">
              <h3 className="text-xl font-extrabold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{u?.name}</h3>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                {profile?.major || u?.major} • Year {profile?.year || u?.year}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pt-16 pb-8 space-y-6">
          {/* Mutual Info Badge */}
          <div className="flex justify-center">
            {profile?.mutualFriends !== undefined ? (
              <span className="rounded-full bg-sky-400/10 px-4 py-1.5 text-xs font-bold text-sky-600 ring-1 ring-sky-400/20">
                {profile.mutualFriends} mutual friends
              </span>
            ) : ('mutualFriends' in (u || {})) && (
              <span className="rounded-full bg-sky-400/10 px-4 py-1.5 text-xs font-bold text-sky-600 ring-1 ring-sky-400/20">
                {(u as any).mutualFriends} mutual friends
              </span>
            )}
          </div>

          {/* About Section */}
          {(profile?.bio || (('bio' in (u || {})) && (u as any).bio)) && (
            <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-sky-400/10">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">About</h4>
              <p className="text-sm text-slate-600 leading-relaxed italic">
                "{profile?.bio || (('bio' in (u || {})) ? (u as any).bio : '')}"
              </p>
            </div>
          )}

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-sky-400/10 flex flex-col items-center text-center">
              <Globe2 className="h-4 w-4 text-sky-400 mb-1" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Campus</span>
              <span className="text-xs font-bold text-slate-700 truncate w-full">{profile?.university || (u as any).university || 'UniNest'}</span>
            </div>
            <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-sky-400/10 flex flex-col items-center text-center">
              <MapPin className="h-4 w-4 text-sky-400 mb-1" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Major</span>
              <span className="text-xs font-bold text-slate-700 truncate w-full">{profile?.major || u?.major}</span>
            </div>
          </div>

          {/* Shared Courses */}
          {displaySharedCourses.length > 0 && (
            <div className="rounded-2xl bg-violet-400/5 p-4 ring-1 ring-violet-400/10">
              <h4 className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-3">Shared Courses</h4>
              <div className="flex flex-wrap gap-2">
                {displaySharedCourses.map((course, i) => (
                  <span key={i} className="rounded-full bg-violet-400/10 px-3 py-1 text-[11px] font-bold text-violet-600 ring-1 ring-violet-400/20">
                    📚 {course}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabs Section */}
          <Tabs defaultValue="interests" className="w-full">
            <TabsList className="grid grid-cols-3 w-full h-11 bg-white/60 rounded-xl p-1 ring-1 ring-sky-400/10">
              <TabsTrigger value="interests" className="rounded-lg text-xs font-bold data-[state=active]:bg-sky-400 data-[state=active]:text-white">Interests</TabsTrigger>
              <TabsTrigger value="clubs" className="rounded-lg text-xs font-bold data-[state=active]:bg-sky-400 data-[state=active]:text-white">Clubs</TabsTrigger>
              <TabsTrigger value="schedule" className="rounded-lg text-xs font-bold data-[state=active]:bg-sky-400 data-[state=active]:text-white">Schedule</TabsTrigger>
            </TabsList>

            <TabsContent value="interests" className="mt-4">
              <div className="flex flex-wrap gap-2">
                {displayInterests.map((interest, i) => (
                  <span key={i} className="rounded-full bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-600 ring-1 ring-sky-400/20">
                    {interest}
                  </span>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="clubs" className="mt-4 space-y-2">
              {displayClubs.map((club, i) => (
                <div key={i} className="rounded-xl bg-white/60 p-3 ring-1 ring-sky-400/10 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                    <Compass className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">{club}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="schedule" className="mt-4 space-y-3">
              {sortedTimetable.length > 0 ? (
                sortedTimetable.map((item: any, i) => (
                  <div key={i} className="rounded-xl bg-white/60 p-3 ring-1 ring-sky-400/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-8 bg-sky-400 rounded-full" />
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          {'subject' in item ? item.subject : item.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">{item.day} • {item.time}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md ring-1 ring-slate-100">
                      {item.location || item.where || 'TBD'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 italic text-xs">No schedule shared.</div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  };

  const isAuthorized = !!auth.currentUser;

  return (
    <div className="relative bg-sky-50 font-sans text-slate-800 min-h-screen pb-32 overflow-hidden" style={{fontFamily: "'Inter', sans-serif"}}>
      {/* Ambient background blurs */}
      <div aria-hidden className="pointer-events-none absolute -top-64 left-[234px] w-48 h-48 bg-sky-400/10 rounded-full blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-[2400px] -left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl" />

      {/* Top Navigation Anchor */}
      <header className="sticky top-0 w-full z-50 bg-white/60 border-b border-sky-400/10 backdrop-blur-md flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-sky-400/20">
            <Avatar className="w-full h-full">
               <AvatarFallback className="bg-sky-100 text-sky-700 font-bold">{auth.currentUser?.displayName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-sky-400" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>Discover</h1>
        </div>
        <button data-testid="discover-filter-btn" className="text-slate-600 hover:bg-sky-100/60 p-2 rounded-full transition-colors duration-300">
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </header>

      <main className="relative pb-8">
        {/* Search & Filters */}
        <section className="px-6 py-4 space-y-4">
          <div className="relative flex items-center bg-white/80 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-sky-400/5 backdrop-blur-sm focus-within:ring-sky-400/30 transition-all duration-300">
            <Search className="w-4 h-4 text-slate-400 mr-3" />
            <input
              data-testid="discover-search-input"
              className="bg-transparent border-none focus:outline-none focus:ring-0 w-full text-slate-700 placeholder:text-slate-400 text-base"
              placeholder="Search people, interests, courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
            />
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-2 py-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'name', label: 'Name' },
              { key: 'major', label: 'Major' },
              { key: 'online', label: 'Online' },
              { key: 'sharedCourses', label: 'Courses' },
              { key: 'mutualClubs', label: 'Clubs' },
            ].map(({ key, label }) => {
                const isAll = key === 'all';
                const active = isAll ? (sortBy === 'name' || !sortBy) : sortBy === key;
                return (
                    <button
                        key={key}
                        data-testid={`discover-filter-${key}`}
                        onClick={() => setSortBy(isAll ? 'name' : key)}
                        className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-tight whitespace-nowrap transition-all active:scale-95 ${active ? 'bg-sky-400 text-white shadow-[0_10px_15px_-3px_rgba(56,189,248,0.25),0_4px_6px_-4px_rgba(56,189,248,0.25)]' : 'bg-white text-slate-600 ring-1 ring-sky-400/10 hover:ring-sky-400/30'}`}
                    >
                        {label}
                    </button>
                )
            })}
          </div>
        </section>

        {/* SOS Section */}
        {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).length > 0 && (
          <section className="mt-4">
            <div className="px-6 mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-800 flex items-center gap-2" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  Needs Help Right Now
              </h2>
              <span className="text-xs font-bold text-sky-400 tracking-widest uppercase">Live</span>
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-4 px-6 pb-6">
              {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).map((sos, idx) => {
                const friend = friendsUsers.find(f => f.id === sos.createdBy);
                if (!friend) return null;
                const accents = [
                  { ring: 'ring-red-500/10', dotText: 'text-red-500', blur: 'bg-red-500/10', btn: 'bg-red-500 shadow-[0_10px_15px_-3px_rgba(239,68,68,0.2),0_4px_6px_-4px_rgba(239,68,68,0.2)]' },
                  { ring: 'ring-violet-500/10', dotText: 'text-violet-500', blur: 'bg-violet-500/10', btn: 'bg-violet-500 shadow-[0_10px_15px_-3px_rgba(139,92,246,0.2),0_4px_6px_-4px_rgba(139,92,246,0.2)]' },
                ];
                const a = accents[idx % accents.length];
                const minsAgo = (() => {
                  try {
                    const d = (sos as any).createdAt?.toDate ? (sos as any).createdAt.toDate() : new Date();
                    const diff = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
                    return diff < 60 ? `${diff} MINS AGO` : `${Math.round(diff / 60)} HRS AGO`;
                  } catch { return 'JUST NOW'; }
                })();
                return (
                  <div key={sos.id} data-testid={`sos-card-${sos.id}`} className={`min-w-[280px] bg-white/60 p-5 rounded-[32px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ${a.ring} backdrop-blur-[6px] relative overflow-hidden group`}>
                    <div className={`absolute -right-4 -top-4 w-24 h-24 ${a.blur} rounded-full blur-2xl`}></div>
                    <div className="flex items-center gap-3 mb-4 relative">
                      <Avatar className="w-10 h-10 border-2 border-white">
                        <AvatarFallback className="bg-slate-100 text-slate-700 font-bold">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm text-slate-800 leading-5">{friend.name}</p>
                        <p className={`text-[10px] uppercase tracking-wide font-bold ${a.dotText} leading-4`}>{minsAgo}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium mb-6 text-slate-800 leading-6 relative">{sos.topic}</p>
                    <button
                      data-testid={`sos-offer-help-${sos.id}`}
                      onClick={() => {
                        createConversation(friend.id).then(() => {
                           if (onMessage) onMessage();
                        });
                      }}
                      className={`w-full py-3 ${a.btn} text-white rounded-2xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-transform`}
                    >
                      Offer Help
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Nearby Now */}
        <section className="py-4 bg-sky-400/5 mt-4">
          <div className="px-6 mb-4">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-800" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>Nearby Now</h2>
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-6 px-6">
            {checkins.length > 0 ? (
              checkins.map((ci, idx) => {
                const friend = friendsUsers.find(f => f.id === ci.createdBy);
                if (!friend) return null;
                const ringCls = idx < 2 ? 'ring-sky-400' : 'ring-sky-400/20';
                return (
                  <div key={ci.id} data-testid={`nearby-${ci.id}`} onClick={() => openPersonProfile(friend)} className="flex flex-col items-center gap-2 min-w-fit cursor-pointer group">
                    <div className={`relative p-1 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-2 ${ringCls} group-hover:scale-105 transition-transform`}>
                      <Avatar className="w-16 h-16">
                        <AvatarFallback className="bg-sky-100 text-sky-700 font-bold text-lg">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold w-16 truncate text-slate-800">{friend.name}</p>
                      <p className="text-[9px] text-slate-400 uppercase tracking-tight w-16 truncate font-normal">{ci.location}</p>
                    </div>
                  </div>
                )
              })
            ) : (
               <div className="px-6 py-4 text-sm text-slate-500 italic">No one checked in nearby just yet!</div>
            )}
          </div>
        </section>

        {/* People You May Know */}
        <section className="mt-8 px-6">
          <h2 className="text-lg font-extrabold tracking-tight mb-6 text-slate-800" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>People You May Know</h2>
          <div className="space-y-6">
            {sortUsers(filteredFriends).slice(0, 10).map((friend) => (
              <div
                key={friend.id}
                data-testid={`person-card-${friend.id}`}
                className="flex items-center gap-4 p-3 bg-white/40 rounded-3xl ring-1 ring-sky-400/5 cursor-pointer hover:bg-white/70 hover:ring-sky-400/20 transition-all duration-300"
                onClick={() => openPersonProfile(friend)}
              >
                <Avatar className="w-14 h-14 rounded-2xl shadow-[0_0_0_2px_rgba(56,189,248,0.05)]">
                  <AvatarFallback className="bg-sky-100 text-sky-700 text-lg font-bold rounded-2xl">{friend.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate text-slate-800 leading-5">{friend.name}</h3>
                  <p className="text-xs text-slate-400 truncate font-normal leading-4">{friend.major} • {friend.year}</p>
                  <div className="flex gap-2 mt-1 pt-0.5">
                    {(friend.sharedCourses && friend.sharedCourses.length > 0) ? (
                      <span className="text-[9px] font-bold text-sky-400 tracking-wide uppercase">{friend.sharedCourses.length} shared</span>
                    ) : (friend.mutualFriends !== undefined && friend.mutualFriends > 0) ? (
                      <span className="text-[9px] font-bold text-sky-400 tracking-wide uppercase">{friend.mutualFriends} mutual</span>
                    ) : null}
                    {getMutualClubs(friend).length > 0 && (
                      <span className="text-[9px] font-bold text-violet-500 tracking-wide uppercase truncate max-w-[120px]">{getMutualClubs(friend)[0]}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {acceptedFriendIds.has(friend.id) ? (
                    <button
                      data-testid={`person-message-${friend.id}`}
                      onClick={(e) => { e.stopPropagation(); createConversation(friend.id); if (onMessage) onMessage(); }}
                      className="w-10 h-10 flex items-center justify-center bg-sky-400/10 text-sky-400 rounded-full hover:bg-sky-400 hover:text-white transition-all duration-300"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  ) : sentRequests.has(friend.id) ? (
                    <button disabled className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-full">
                      ✓
                    </button>
                  ) : (
                    <button
                      data-testid={`person-add-${friend.id}`}
                      onClick={(e) => { e.stopPropagation(); handleSendRequest(friend.id); }}
                      className="w-10 h-10 flex items-center justify-center bg-sky-400/10 text-sky-400 rounded-full hover:bg-sky-400 hover:text-white transition-all duration-300"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What's Happening */}
        <section className="mt-12">
          <div className="px-6 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-800" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>What's Happening</h2>
              <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-2 -mx-6 px-6">
              {VIBE_CATEGORIES.map(vibe => {
                const active = selectedVibe === vibe;
                return (
                  <button
                    key={vibe}
                    data-testid={`vibe-filter-${vibe.toLowerCase()}`}
                    onClick={() => setSelectedVibe(vibe)}
                    className={`px-4 py-1.5 font-bold text-[10px] uppercase tracking-wide rounded-full transition-all whitespace-nowrap ${active ? 'bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/20' : 'bg-white text-slate-600 ring-1 ring-sky-400/5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:ring-sky-400/20'}`}
                  >
                    {vibe === 'All' ? 'All Vibes' : vibe}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical Event Feed */}
          <div className="space-y-4">
            {(() => {
                 const filteredEvs = selectedVibe === 'All' 
                   ? events 
                   : events.filter(e => e.vibeTags?.includes(selectedVibe));
                 return filteredEvs.length > 0 ? (
                    filteredEvs.map(event => (
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
                    ))
                 ) : (
                    <div className="text-center py-12 bg-slate-50 mt-2 mx-6 rounded-3xl border border-slate-100/50">
                      <span className="text-3xl opacity-50 mb-3 block">👻</span>
                      <p className="text-slate-500 font-semibold text-[14px]">No {selectedVibe.toLowerCase()} events coming up.</p>
                    </div>
                 );
            })()}
          </div>
        </section>
      </main>

      {/* FAB for Create Study Group */}
      {isAuthorized && (
        <button
          data-testid="discover-create-event-fab"
          onClick={() => setShowStudyGroupModal(true)}
          className="fixed bottom-24 right-6 w-16 h-16 bg-sky-400 text-white rounded-full shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3),0_0_0_4px_rgba(255,255,255,1)] flex items-center justify-center z-[60] hover:bg-sky-500 active:scale-90 transition-all duration-200"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Modals directly migrated from old code */}
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
                      <span className={status === 'attending' ? 'px-2 py-0.5 rounded-full bg-green-100 text-green-700' : 'px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'}>
                        {status === 'attending' ? 'Going' : 'Interested'}
                      </span>
                      {isGoingAlone && (
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          Going Alone 🥺
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" className="rounded-full bg-sky-500 hover:bg-sky-600" onClick={() => {
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
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showStudyGroupModal} onOpenChange={setShowStudyGroupModal}>
        <DialogContent className="glass-panel border-white/50 p-6 rounded-3xl max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-800">Create Study Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Study Topic</label>
              <Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g. Physics II Midterm Prep" className="bg-slate-50 border-slate-200" />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Invite a Friend (to check free time)</label>
              <select 
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                onChange={(e) => {
                  const friend = friendsUsers.find(f => f.id === e.target.value);
                  setSelectedFriendForStudy(friend || null);
                }}
                value={selectedFriendForStudy?.id || ''}
              >
                <option value="">Select a friend...</option>
                {friendsUsers.filter(u => acceptedFriendIds.has(u.id)).map(friend => (
                  <option key={friend.id} value={friend.id}>{friend.name}</option>
                ))}
              </select>
            </div>

            {selectedFriendForStudy && (
              <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100">
                <p className="text-[10px] font-bold text-sky-600 uppercase mb-2">Common Free Slots</p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {Object.entries(commonFreeSlots).some(([_, slots]) => slots.length > 0) ? (
                    Object.entries(commonFreeSlots).map(([day, slots]) => slots.length > 0 && (
                      <div key={day} className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400">{day}</p>
                        {slots.map((slot, i) => (
                          <button 
                            key={i}
                            onClick={() => setNewEvent({...newEvent, description: `Study session on ${day} at ${formatTimeLabel(slot.start)}`})}
                            className="w-full text-left px-3 py-1.5 bg-white rounded-lg text-xs hover:bg-sky-100 transition-colors border border-sky-200/50"
                          >
                            {formatTimeLabel(slot.start)} - {formatTimeLabel(slot.end)}
                          </button>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No common free slots found</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Details (Location/Time)</label>
              <Input value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="e.g. Meet at Library 3rd Floor @ 4pm" className="bg-slate-50 border-slate-200" />
            </div>

            <Button 
              className="w-full h-11 bg-sky-500 hover:bg-sky-600 text-white rounded-xl shadow-lg mt-2 font-bold"
              onClick={async () => {
                if (!newEvent.title) return;
                const { Timestamp } = await import('firebase/firestore');
                await createCampusEvent({
                  title: `📚 Study: ${newEvent.title}`,
                  description: newEvent.description,
                  location: selectedFriendForStudy ? `With ${selectedFriendForStudy.name}` : "Group Study",
                  vibeTags: ["Academic"],
                  crowdSize: "Small",
                  buddyMatchingEnabled: true,
                  collegeId: "VIT",
                  clubName: "Study Group",
                  clubId: "study_group",
                  startTime: Timestamp.now(),
                  endTime: Timestamp.fromDate(new Date(Date.now() + 3600000 * 2)),
                  tags: ["Study", "Academic"],
                });
                setShowStudyGroupModal(false);
                setNewEvent({ title: '', description: '', location: '', vibeTags: [], crowdSize: 'Medium', buddyMatchingEnabled: true });
                setSelectedFriendForStudy(null);
              }}
            >
              Launch Study Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
