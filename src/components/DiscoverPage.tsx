import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import { sendFriendRequest, UserProfile, getEnhancedFriendProfile, EnhancedFriendProfile, getProfile, getFriendTimetable, type ClassItem, getAllUsers, getFriends } from '../utils/firebase/firestore';
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

export function DiscoverPage({ currentUser, onOpenProfile }: { currentUser?: unknown; onOpenProfile?: (user: SuggestedUser) => void }) {
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

  useEffect(() => {
    // Subscribe to all registered users of UniNest (excluding the current user)
    const unsubscribe = getAllUsers(async (list) => {
      const transformed = await Promise.all(
        list.map(async (u) => {
          let profileDoc: any = null;
          try { profileDoc = await getProfile(u.uid); } catch {}
          const base = transformUserProfileToSuggestedUser(u);
          let enhanced: EnhancedFriendProfile | null = null;
          try { enhanced = await getEnhancedFriendProfile(u.uid); } catch {}
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
        } catch {}

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
    <Card
      className={`hover:shadow-md transition-shadow ${type === 'friends' ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={type === 'friends' ? undefined : () => openPersonProfile(person)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar className="w-12 h-12">
              <AvatarFallback>{person.name.charAt(0)}</AvatarFallback>
            </Avatar>
            {person.online && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{person.name}</h3>
                <p className="text-sm opacity-75">{person.major} • {person.year}</p>
              </div>
              {(type === 'suggested' || type === 'friends' || type === 'buddies') && (
                acceptedFriendIds.has(person.id) ? (
                  <Badge 
                    variant="secondary" 
                    className="text-sm h-8 px-3 rounded-md flex items-center justify-center"
                  >
                    Friends ✅
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleSendRequest(person.id); }}
                    disabled={sentRequests.has(person.id)}
                    style={{ 
                      backgroundColor: sentRequests.has(person.id) ? '#e5e7eb' : '#C6ECFF', 
                      color: '#000' 
                    }}
                  >
                    {sentRequests.has(person.id) ? 'Sent' : 'Add Friend'}
                  </Button>
                )
              )}
            </div>

            {(type === 'suggested') && (() => {
              const u = person as SuggestedUser;
              return (
                <>
                  <p className="text-sm mt-2">{u.bio || 'No bio available'}</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span>🎓</span>
                      <span>{u.university}</span>
                    </div>
                  </div>
                  {u.interests && u.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {u.interests.map((interest, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {(type === 'coursemate' || type === 'coursemates') && (() => {
              const u = person as SuggestedUser;
              const courses = u.sharedCourses ?? [];
              return (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span>📖</span>
                    <span>Shared Courses</span>
                  </div>
                  {courses.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {courses.map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm opacity-75 mt-1">No shared courses identified</div>
                  )}
                </div>
              );
            })()}

            {(type === 'mutualClubs') && (() => {
              const mutual = getMutualClubs(person);
              return (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span>🏛️</span>
                    <span>Mutual Clubs</span>
                  </div>
                  {mutual.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mutual.map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm opacity-75 mt-1">No mutual clubs identified</div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
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
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-xl">
              {u?.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="text-xl font-semibold">{u?.name}</h3>
            <p className="text-gray-600">
              {profile?.university || (u as any).university || 'University'} • {profile?.major || u?.major} • {profile?.year || u?.year}
            </p>
            {profile?.mutualFriends !== undefined ? (
              <Badge variant="secondary" className="mt-1">
                {profile.mutualFriends} mutual friends
              </Badge>
            ) : ('mutualFriends' in (u || {})) && (
              <Badge variant="secondary" className="mt-1">
                {(u as any).mutualFriends}
              </Badge>
            )}
          </div>
        </div>

        {(profile?.bio || ((('bio' in (u || {})) && (u as any).bio))) && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">About</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{profile?.bio || ((('bio' in (u || {})) ? (u as any).bio : ''))}</p>
          </div>
        )}

        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Quick Info</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-gray-200">
              <span className="text-gray-600 font-medium">University</span>
              <span className="text-gray-900">{profile?.university || (u as any).university || 'University'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-gray-200">
              <span className="text-gray-600 font-medium">Major</span>
              <span className="text-gray-900">{profile?.major || u?.major}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-gray-200">
              <span className="text-gray-600 font-medium">Year</span>
              <span className="text-gray-900">{profile?.year || u?.year}</span>
            </div>
          </div>
        </div>

        {displaySharedCourses.length > 0 && (
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium mb-2 text-green-800">Shared Courses</h4>
            <div className="flex flex-wrap gap-2">
              {displaySharedCourses.map((course, i) => (
                <Badge key={i} variant="secondary" className="bg-green-100 text-green-800">
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
                <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                  <span className="text-blue-600">🏛️</span>
                  <span>{club}</span>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="schedule" className="mt-4">
            <div className="space-y-2">
              {sortedTimetable.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <div className="font-medium">
                      {'subject' in (item as any) ? (item as any).subject : (item as any).title}
                    </div>
                    <div className="text-sm text-gray-600">{(item as any).day} • {(item as any).time}</div>
                  </div>
                  <div className="text-sm text-gray-500">
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
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl mb-2">Discover Friends</h1>
        <p className="opacity-75">Connect with fellow students at your university</p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="relative md:col-span-2">
              <Input
                placeholder="Search by name, major, interests, courses, or clubs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <span className="text-gray-400">🔍</span>
              </div>
            </div>
            <div>
              <select 
                className="w-full p-2 border border-gray-300 rounded"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort: Name (A–Z)</option>
                <option value="major">Sort: Major (A–Z)</option>
                <option value="online">Sort: Online First</option>
                <option value="sharedCourses">Sort: Shared Courses</option>
                <option value="mutualClubs">Sort: Mutual Clubs</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="friends">Find Friends</TabsTrigger>
          <TabsTrigger value="coursemates">Buddy's</TabsTrigger>
          <TabsTrigger value="mutualClubs">Mutual Clubs</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>✨</span>
                Friends ({sortUsers(filteredFriends).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-center py-8">Loading friends...</div>
              ) : sortUsers(filteredFriends).length > 0 ? (
                sortUsers(filteredFriends).map((friend) => (
                  <FriendCard key={friend.id} person={friend} type="friends" />
                ))
              ) : (
                <div className="text-center py-8 opacity-75">
                  {searchQuery ? 'No friends found matching your search.' : 'No friends yet.'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coursemates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>👥</span>
                Buddy's ({sortUsers(filteredBuddies).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortUsers(filteredBuddies).length > 0 ? (
                sortUsers(filteredBuddies).map((friend) => (
                  <FriendCard key={friend.id} person={friend} type="buddies" />
                ))
              ) : (
                <div className="text-center py-8 opacity-75">
                  {searchQuery ? 'No buddies found matching your search.' : 'No buddies found.'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mutualClubs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🏛️</span>
                Mutual Club Members ({sortUsers(filteredMutualClubMembers).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortUsers(filteredMutualClubMembers).length > 0 ? (
                sortUsers(filteredMutualClubMembers).map((member) => (
                  <FriendCard key={member.id} person={member} type="mutualClubs" />
                ))
              ) : (
                <div className="text-center py-8 opacity-75">
                  {searchQuery ? 'No mutual club members match your search.' : 'No mutual club members found.'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Enhanced Profile Dialog */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={(open: boolean) => { if (!open) { setSelectedUser(null); setEnhancedProfile(null); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{(selectedUser as SuggestedUser)?.name} - Profile</DialogTitle>
            </DialogHeader>
            {loadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading profile details...</p>
                </div>
              </div>
            ) : (
              renderProfileContent()
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
