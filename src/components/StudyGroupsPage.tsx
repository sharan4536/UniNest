import React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  StudyGroup,
  getStudyGroups,
  getMyStudyGroups,
  createStudyGroup,
  joinStudyGroup,
  leaveStudyGroup,
  requestToJoinStudyGroup,
  inviteMembersToStudyGroup,
  getFriends,
  getDiscoverableUsers,
  deleteStudyGroup,
  approveJoinRequest,
  rejectJoinRequest,
  sendGroupMessage,
  getGroupMessages,
  StudyGroupMessage,
  UserProfile
} from '../utils/firebase/firestore';
import { isFirebaseConfigured } from '../utils/firebase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { TrashIcon } from 'lucide-react';

export function StudyGroupsPage({ currentUser }: { currentUser: any }) {
  const [groups, setGroups] = React.useState<StudyGroup[]>([]);
  const [myGroups, setMyGroups] = React.useState<StudyGroup[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    course: '',
    description: '',
    meetingTime: '',
    maxMembers: '' as any,
  });

  // Invite friends dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);
  const [inviteTargetGroup, setInviteTargetGroup] = React.useState<StudyGroup | null>(null);
  const [friends, setFriends] = React.useState<UserProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = React.useState(false);
  const [friendSearch, setFriendSearch] = React.useState('');
  const [selectedFriendIds, setSelectedFriendIds] = React.useState<Set<string>>(new Set());
  const [activeInviteTab, setActiveInviteTab] = React.useState<'friends' | 'discover'>('friends');
  const [discoverableUsers, setDiscoverableUsers] = React.useState<UserProfile[]>([]);
  const [discoverableLoading, setDiscoverableLoading] = React.useState(false);

  // Manage Requests dialog state
  const [manageRequestsOpen, setManageRequestsOpen] = React.useState(false);
  const [manageTargetGroup, setManageTargetGroup] = React.useState<StudyGroup | null>(null);
  const [requestingUsers, setRequestingUsers] = React.useState<UserProfile[]>([]);
  const [requestsLoading, setRequestsLoading] = React.useState(false);

  // Chat dialog state
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatTargetGroup, setChatTargetGroup] = React.useState<StudyGroup | null>(null);
  const [chatMessages, setChatMessages] = React.useState<StudyGroupMessage[]>([]);
  const [newChatMessage, setNewChatMessage] = React.useState('');
  const [chatProfiles, setChatProfiles] = React.useState<Record<string, UserProfile>>({});
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // For listing friends, Firestore rules require only that the user is signed in.
  const isUserSignedIn = React.useMemo(() => {
    const isConfigured = isFirebaseConfigured;
    const user = currentUser;
    return Boolean(isConfigured && user);
  }, [currentUser]);

  React.useEffect(() => {
    const unsubAll = getStudyGroups(setGroups);
    const unsubMine = getMyStudyGroups(setMyGroups);
    return () => {
      unsubAll && unsubAll();
      unsubMine && unsubMine();
    };
  }, []);

  const myUid = currentUser?.uid || undefined;
  const isMember = (g: StudyGroup) => !!myUid && Array.isArray(g.members) && g.members.includes(myUid);
  const isRequested = (g: StudyGroup) => !!myUid && Array.isArray(g.joinRequests) && g.joinRequests.includes(myUid);
  const isOwner = (g: StudyGroup) => !!myUid && g.createdBy === myUid;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    setSuccess(null);
    setCreating(true);
    const id = await createStudyGroup({
      name: form.name.trim(),
      course: form.course.trim() || undefined,
      description: form.description.trim() || undefined,
      meetingTime: form.meetingTime.trim() || undefined,
      maxMembers: form.maxMembers ? Number(form.maxMembers) : undefined,
    });
    setCreating(false);
    if (!id) {
      setError('Could not create the group. Please ensure you are signed in and your Firestore rules permit writes to "studyGroups".');
      return;
    }
    setForm({ name: '', course: '', description: '', meetingTime: '', maxMembers: '' });
    setSuccess('Group created successfully.');
  };

  const handleJoinLeave = async (g: StudyGroup) => {
    if (isMember(g)) {
      await leaveStudyGroup(g.id!);
    } else if (!isRequested(g)) {
      await requestToJoinStudyGroup(g.id!);
      setSuccess('Join request sent to admin.');
    }
  };

  const openInviteDialog = (g: StudyGroup) => {
    if (!isOwner(g)) return; // only owners can invite
    setInviteTargetGroup(g);
    setInviteDialogOpen(true);
    // Guard by comprehensive auth to match Firestore rules
    if (!isUserSignedIn) {
      setFriends([]);
      setFriendsLoading(false);
      setError('Sign in to see your friends.');
      return;
    }
    setFriendsLoading(true);
    const unsub = getFriends((list) => {
      // Exclude users already in the group
      const existing = new Set<string>(Array.isArray(g.members) ? g.members : []);
      const filtered = list.filter((f) => !existing.has(f.uid));
      setFriends(filtered);
      setFriendsLoading(false);
      // If no accepted friends, default to Discover tab and preload discoverable
      if (filtered.length === 0) {
        setActiveInviteTab('discover');
        preloadDiscoverable(g);
      } else {
        setActiveInviteTab('friends');
      }
    });
    // Close subscriptions when dialog closes
    const cleanup = () => { unsub && unsub(); };
    const observer = () => { if (!inviteDialogOpen) cleanup(); };
    setTimeout(observer, 0);
  };

  const preloadDiscoverable = async (g: StudyGroup) => {
    try {
      setDiscoverableLoading(true);
      const all = await getDiscoverableUsers();
      const existing = new Set<string>(Array.isArray(g.members) ? g.members : []);
      const currentUid = currentUser?.uid;
      const filtered = all.filter((u) => u.uid !== currentUid && !existing.has(u.uid));
      setDiscoverableUsers(filtered);
    } catch (e) {
      console.error('Error loading discoverable users:', e);
      setDiscoverableUsers([]);
    } finally {
      setDiscoverableLoading(false);
    }
  };

  const openManageRequestsDialog = async (g: StudyGroup) => {
    if (!isOwner(g)) return; // double check owner status
    setManageTargetGroup(g);
    setManageRequestsOpen(true);
    setRequestsLoading(true);

    try {
      const allUsers = await getDiscoverableUsers();
      // Note: getDiscoverableUsers does not include current user, which is correct
      // We also need to get users who sent friend requests, which might be excluded 
      // depending on getDiscoverableUsers implementation. 
      // For a robust implementation, it would be better to fetch users by their specific IDs
      // but to minimize changes to firestore.ts, we'll use discoverable users or friends.

      // Since a user requesting to join a group might be a friend OR a discoverable user:
      let potentialRequesters: UserProfile[] = [];

      // 1. Get discoverable users
      potentialRequesters = [...allUsers];

      // 2. Get friends (as some requesters might already be friends)
      const unsub = getFriends((friendList: UserProfile[]) => {
        const friendIds = new Set(friendList.map(f => f.uid));

        // Merge without duplicates
        const mergedRequesters = [...potentialRequesters];
        friendList.forEach(f => {
          if (!mergedRequesters.some(m => m.uid === f.uid)) {
            mergedRequesters.push(f);
          }
        });

        // Filter those who actually requested to join this specific group
        const requests = g.joinRequests || [];
        const filteredRequesters = mergedRequesters.filter(u => requests.includes(u.uid));

        setRequestingUsers(filteredRequesters);
        setRequestsLoading(false);
      });

      // Unsubscribe quickly since we just need one snapshot for the modal
      setTimeout(() => unsub && unsub(), 2000);

    } catch (error) {
      console.error('Error fetching requesters:', error);
      setRequestsLoading(false);
    }
  };

  const handleApproveRequest = async (userId: string) => {
    if (!manageTargetGroup) return;

    // Optimistically remove from UI list
    setRequestingUsers(prev => prev.filter(u => u.uid !== userId));

    const ok = await approveJoinRequest(manageTargetGroup.id!, userId);
    if (!ok) {
      setError('Failed to approve join request.');
      // Revert optimistic update ideally, but we'll assume it succeeds most of the time
    } else {
      setSuccess('Request approved.');
    }

    // Auto-close dialog if no more requests
    if (requestingUsers.length <= 1) {
      setManageRequestsOpen(false);
    }
  };

  const handleRejectRequest = async (userId: string) => {
    if (!manageTargetGroup) return;

    // Optimistically remove from UI list
    setRequestingUsers(prev => prev.filter(u => u.uid !== userId));

    const ok = await rejectJoinRequest(manageTargetGroup.id!, userId);
    if (!ok) {
      setError('Failed to reject join request.');
    }

    // Auto-close dialog if no more requests
    if (requestingUsers.length <= 1) {
      setManageRequestsOpen(false);
    }
  };

  const openGroupChat = (g: StudyGroup) => {
    setChatTargetGroup(g);
    setChatOpen(true);
  };

  React.useEffect(() => {
    if (!chatOpen || !chatTargetGroup) {
      setChatMessages([]);
      return;
    }

    const unsub = getGroupMessages(chatTargetGroup.id!, async (messages) => {
      setChatMessages(messages);

      // Fetch missing profiles for senders
      const missingProfiles = new Set<string>();
      messages.forEach(m => {
        if (!chatProfiles[m.senderId] && m.senderId !== myUid) {
          missingProfiles.add(m.senderId);
        }
      });

      if (missingProfiles.size > 0 && isUserSignedIn) {
        // Simple way to fetch discoverable users and extract profiles
        // (A dedicated getProfiles by array of IDs would be better in production)
        try {
          const allUsers = await getDiscoverableUsers();
          const newProfiles: Record<string, UserProfile> = {};
          allUsers.forEach(u => {
            if (missingProfiles.has(u.uid)) {
              newProfiles[u.uid] = u;
            }
          });
          setChatProfiles(prev => ({ ...prev, ...newProfiles }));
        } catch (e) {
          console.error('Failed to fetch profiles for chat', e);
        }
      }
    });

    return () => unsub && unsub();
  }, [chatOpen, chatTargetGroup?.id, myUid, isUserSignedIn]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !chatTargetGroup) return;

    const text = newChatMessage.trim();
    setNewChatMessage('');

    await sendGroupMessage(chatTargetGroup.id!, text);
  };

  const toggleFriendSelection = (uid: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleInviteSubmit = async () => {
    if (!inviteTargetGroup || selectedFriendIds.size === 0) return;
    const ids = Array.from(selectedFriendIds);
    const ok = await inviteMembersToStudyGroup(inviteTargetGroup.id!, ids);
    if (!ok) {
      setError('Failed to invite selected friends. Ensure you are the group owner and Firestore rules permit this update.');
      return;
    }
    setSuccess('Invitations sent (members added).');
    setInviteDialogOpen(false);
    setInviteTargetGroup(null);
    setSelectedFriendIds(new Set());
    setFriendSearch('');
  };

  const handleDeleteGroup = async (g: StudyGroup) => {
    if (!isOwner(g)) return;
    const confirmed = window.confirm(`Delete group "${g.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    const ok = await deleteStudyGroup(g.id!);
    if (!ok) {
      setError('Failed to delete the group. Ensure you are the owner and rules permit delete.');
      return;
    }
    setSuccess('Group deleted successfully.');
  };

  const totalMembers = groups.reduce((sum, g) => sum + (Array.isArray(g.members) ? g.members.length : 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 space-y-8">
      <div className="mb-8 text-center slide-up-fade" style={{ animationDelay: '0.1s' }}>
        <h1 className="text-3xl font-bold text-gradient mb-2">Study Groups</h1>
        <p className="text-slate-500 font-medium">Create, discover, and join study groups with classmates</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 slide-up-fade" style={{ animationDelay: '0.2s' }}>
        <div className="p-4 rounded-2xl glass-card border-none shadow-sm flex flex-col items-center justify-center text-center">
          <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Groups</div>
          <div className="text-3xl font-bold text-indigo-600">{groups.length}</div>
        </div>
        <div className="p-4 rounded-2xl glass-card border-none shadow-sm flex flex-col items-center justify-center text-center">
          <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">My Groups</div>
          <div className="text-3xl font-bold text-sky-600">{myGroups.length}</div>
        </div>
        <div className="p-4 rounded-2xl glass-card border-none shadow-sm flex flex-col items-center justify-center text-center">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Members</div>
          <div className="text-3xl font-bold text-emerald-600">{totalMembers}</div>
        </div>
        <div className="p-4 rounded-2xl glass-card border-none shadow-sm flex flex-col items-center justify-center text-center">
          <div className="text-xs font-bold text-pink-400 uppercase tracking-wider mb-1">Active Today</div>
          <div className="text-3xl font-bold text-pink-600">{Math.max(0, Math.min(groups.length, myGroups.length))}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 slide-up-fade" style={{ animationDelay: '0.3s' }}>
        {/* Create Group */}
        <div className="lg:col-span-1">
          <div className="rounded-3xl glass-card border-white/60 p-6 shadow-lg sticky top-24">
            <h2 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
              <span className="text-2xl">✨</span> Create a Group
            </h2>
            {!isFirebaseConfigured && (
              <div className="mb-4 text-xs font-medium text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">
                Demo mode: changes won't persist.
              </div>
            )}
            {error && (
              <div className="mb-4 text-xs font-medium text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>
            )}
            {success && (
              <div className="mb-4 text-xs font-medium text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">{success}</div>
            )}
            <form className="space-y-4" onSubmit={handleCreate}>
              <div>
                <Label htmlFor="name" className="text-xs font-bold text-slate-500 ml-1">GROUP NAME</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Calculus I Study Group"
                  className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all"
                />
              </div>
              <div>
                <Label htmlFor="course" className="text-xs font-bold text-slate-500 ml-1">COURSE</Label>
                <Input
                  id="course"
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                  placeholder="e.g., MATH101"
                  className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-xs font-bold text-slate-500 ml-1">DESCRIPTION</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What will you cover?"
                  className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="meetingTime" className="text-xs font-bold text-slate-500 ml-1">TIME</Label>
                  <Input
                    id="meetingTime"
                    value={form.meetingTime}
                    onChange={(e) => setForm({ ...form, meetingTime: e.target.value })}
                    placeholder="e.g., Tue 6PM"
                    className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>
                <div>
                  <Label htmlFor="maxMembers" className="text-xs font-bold text-slate-500 ml-1">MAX</Label>
                  <Input
                    id="maxMembers"
                    type="number"
                    min={2}
                    value={form.maxMembers}
                    onChange={(e) => setForm({ ...form, maxMembers: e.target.value })}
                    placeholder="8"
                    className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={creating || !form.name.trim()}
                className="w-full rounded-xl h-12 bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold shadow-lg shadow-sky-200/50 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {creating ? 'Creating...' : 'Create Group'}
              </Button>
            </form>
          </div>
        </div>

        {/* Groups List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-3xl glass-card border-none p-6 shadow-lg min-h-[500px]">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
              <span className="text-2xl">🔍</span> Discover Groups
            </h2>
            {groups.length === 0 ? (
              <div className="text-center py-16 opacity-75">
                <div className="text-6xl mb-4">📚</div>
                <p className="text-slate-500 font-medium text-lg">No study groups yet.</p>
                <p className="text-slate-400 text-sm mt-2">Be the first to create one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {groups.map((g) => (
                  <div key={g.id} className="group relative overflow-hidden rounded-2xl bg-white/60 border border-white/60 p-5 hover:bg-white/90 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-sky-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800 group-hover:text-sky-600 transition-colors">{g.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="bg-indigo-50 text-indigo-600 border-indigo-100">
                            {g.course || 'General'}
                          </Badge>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-500 font-medium">{g.meetingTime || 'Flexible time'}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-slate-50/50 border-slate-200 text-slate-600">
                        {Array.isArray(g.members) ? g.members.length : 0} / {g.maxMembers || '∞'}
                      </Badge>
                    </div>

                    {g.description && (
                      <p className="text-sm text-slate-600 mb-4 pl-2 line-clamp-2 leading-relaxed opacity-80">{g.description}</p>
                    )}

                    <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-100 pl-2">
                      {isOwner(g) && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openGroupChat(g)}
                            className="h-8 rounded-full text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <span className="text-sm mr-1">💬</span> Chat
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openInviteDialog(g)}
                            className="h-8 rounded-full text-xs font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                          >
                            Invite
                          </Button>
                          {g.joinRequests && g.joinRequests.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openManageRequestsDialog(g)}
                              className="h-8 rounded-full text-xs font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 relative pr-6"
                            >
                              Requests
                              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] text-white flex items-center justify-center font-bold">
                                {g.joinRequests.length}
                              </span>
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteGroup(g)}
                            className="h-8 w-8 rounded-full text-red-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleJoinLeave(g)}
                        disabled={isRequested(g)}
                        className={`h-8 px-4 rounded-full text-xs font-bold transition-all ${isMember(g)
                          ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          : isRequested(g)
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : "bg-black text-white hover:bg-gray-800 shadow-md shadow-black/20"
                          }`}
                      >
                        {isMember(g) ? 'Leave' : isRequested(g) ? 'Requested' : 'Request to Join'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Friends Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-lg glass-panel border-white/60 p-0 overflow-hidden shadow-2xl rounded-3xl">
          <DialogHeader className="p-6 pb-2 border-b border-gray-100/50">
            <DialogTitle className="text-xl font-bold text-slate-800">Invite to {inviteTargetGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4">
            {inviteTargetGroup && (
              <div className="space-y-4">
                {!isUserSignedIn && (
                  <div className="text-sm font-medium text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-center">
                    Please sign in to invite friends.
                  </div>
                )}
                {isUserSignedIn && (
                  <div className="flex bg-slate-100/50 p-1 rounded-xl">
                    <button
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeInviteTab === 'friends' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-600'}`}
                      onClick={() => setActiveInviteTab('friends')}
                    >
                      My Friends
                    </button>
                    <button
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeInviteTab === 'discover' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-600'}`}
                      onClick={() => {
                        setActiveInviteTab('discover');
                        preloadDiscoverable(inviteTargetGroup);
                      }}
                    >
                      All Students
                    </button>
                  </div>
                )}

                <div className="relative">
                  <Input
                    placeholder="Search people..."
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50 focus:bg-white"
                  />
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">🔍</div>
                </div>

                <div className="border border-slate-100 rounded-xl p-2 max-h-60 overflow-y-auto bg-white/50 space-y-1">
                  {/* ... list content logic ... */}
                  {activeInviteTab === 'friends' && (friendsLoading ? (
                    <div className="text-center py-8 text-sm text-slate-400">Loading friends...</div>
                  ) : friends.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">No friends found to invite.</div>
                  ) : (
                    friends
                      .filter((f) => (f.displayName || 'User').toLowerCase().includes(friendSearch.toLowerCase()))
                      .map((f) => (
                        <label key={f.uid} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-100 to-blue-200 flex items-center justify-center text-sky-700 font-bold text-xs">
                              {(f.displayName || '?').charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{f.displayName || 'User'}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedFriendIds.has(f.uid)}
                            onChange={() => toggleFriendSelection(f.uid)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                        </label>
                      ))
                  ))}

                  {activeInviteTab === 'discover' && (discoverableLoading ? (
                    <div className="text-center py-8 text-sm text-slate-400">Loading users...</div>
                  ) : discoverableUsers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">No other users found.</div>
                  ) : (
                    discoverableUsers
                      .filter((u) => (u.displayName || 'User').toLowerCase().includes(friendSearch.toLowerCase()))
                      .map((u) => (
                        <label key={u.uid} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
                              {(u.displayName || '?').charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{u.displayName || 'User'}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedFriendIds.has(u.uid)}
                            onChange={() => toggleFriendSelection(u.uid)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                        </label>
                      ))
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setInviteDialogOpen(false)} className="rounded-full text-slate-500 hover:text-slate-700">Cancel</Button>
                  <Button
                    onClick={handleInviteSubmit}
                    disabled={selectedFriendIds.size === 0}
                    className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 shadow-md shadow-sky-200/50"
                  >
                    Send Invites ({selectedFriendIds.size})
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Requests Dialog */}
      <Dialog open={manageRequestsOpen} onOpenChange={setManageRequestsOpen}>
        <DialogContent className="max-w-md glass-panel border-white/60 p-0 overflow-hidden shadow-2xl rounded-3xl">
          <DialogHeader className="p-6 pb-2 border-b border-gray-100/50">
            <DialogTitle className="text-xl font-bold text-slate-800">
              Join Requests for {manageTargetGroup?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4">
            {manageTargetGroup && (
              <div className="space-y-4">
                <div className="border border-slate-100 rounded-xl p-2 max-h-80 overflow-y-auto bg-white/50 space-y-2">
                  {requestsLoading ? (
                    <div className="text-center py-8 text-sm text-slate-400">Loading requests...</div>
                  ) : requestingUsers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400">No pending requests.</div>
                  ) : (
                    requestingUsers.map((u) => (
                      <div key={u.uid} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-100 shadow-sm transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center text-amber-700 font-bold text-sm shadow-inner">
                            {(u.displayName || '?').charAt(0)}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-700 block">{u.displayName || 'User'}</span>
                            <span className="text-xs text-slate-400 block">{u.email || 'No email provided'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveRequest(u.uid)}
                            className="h-8 px-3 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRejectRequest(u.uid)}
                            className="h-8 px-3 rounded-lg text-xs font-bold text-slate-500 hover:text-red-500 hover:bg-red-50"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="ghost" onClick={() => setManageRequestsOpen(false)} className="rounded-full text-slate-500 hover:text-slate-700">Close</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Chat Dialog */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-2xl min-h-[600px] flex flex-col p-0 glass-panel border-white/60 shadow-2xl rounded-3xl overflow-hidden">
          <DialogHeader className="p-4 px-6 border-b border-gray-100/50 flex flex-row items-center justify-between shadow-sm z-10 bg-white/50 backdrop-blur-md">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800">
                {chatTargetGroup?.name}
              </DialogTitle>
              <p className="text-xs text-slate-500 font-medium">
                {chatTargetGroup?.members?.length || 0} members • {chatTargetGroup?.course || 'General'}
              </p>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-70">
                <div className="text-5xl mb-4">💬</div>
                <p>No messages yet. Say hi!</p>
              </div>
            ) : (
              chatMessages.map(msg => {
                const isMe = msg.senderId === myUid;
                const profile = chatProfiles[msg.senderId];

                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-2 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMe && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-200 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0 mt-auto shadow-sm">
                          {profile?.displayName?.charAt(0) || '?'}
                        </div>
                      )}

                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && (
                          <span className="text-[10px] text-slate-400 font-semibold mb-1 ml-1">
                            {profile?.displayName || 'User'}
                          </span>
                        )}
                        <div
                          className={`p-3 rounded-2xl shadow-sm text-sm ${isMe
                              ? 'bg-sky-500 text-white rounded-br-sm'
                              : 'bg-white text-slate-700 rounded-bl-sm border border-slate-100'
                            }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[9px] text-slate-400 mt-1 opacity-70">
                          {msg.timestamp?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white/80 border-t border-slate-100 backdrop-blur-md">
            <form onSubmit={handleSendChatMessage} className="flex gap-2">
              <Input
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="Message the group..."
                className="flex-1 rounded-full border-slate-200 bg-slate-50 focus:bg-white h-12 px-4 shadow-inner"
              />
              <Button
                type="submit"
                disabled={!newChatMessage.trim()}
                className="h-12 w-12 rounded-full p-0 bg-sky-500 hover:bg-sky-600 text-white shadow-md flex-shrink-0 transform transition-transform hover:scale-105 active:scale-95"
              >
                <span className="text-xl">✈️</span>
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
