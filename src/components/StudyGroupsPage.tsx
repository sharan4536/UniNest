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
    inviteMembersToStudyGroup,
    getFriends,
    getDiscoverableUsers,
    deleteStudyGroup,
    UserProfile
  } from '../utils/firebase/firestore';
import { isFirebaseConfigured } from '../utils/firebase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { TrashIcon } from 'lucide-react@0.487.0';

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
    } else {
      await joinStudyGroup(g.id!);
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
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Study Groups</h1>
        <p className="text-sm opacity-75">Create, discover, and join study groups with classmates.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="text-xs opacity-70">Total Groups</div>
          <div className="text-xl font-semibold">{groups.length}</div>
        </div>
        <div className="p-4 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="text-xs opacity-70">My Groups</div>
          <div className="text-xl font-semibold">{myGroups.length}</div>
        </div>
        <div className="p-4 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="text-xs opacity-70">Total Members</div>
          <div className="text-xl font-semibold">{totalMembers}</div>
        </div>
        <div className="p-4 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="text-xs opacity-70">Active Today</div>
          <div className="text-xl font-semibold">{Math.max(0, Math.min(groups.length, myGroups.length))}</div>
        </div>
      </div>

      {/* Create Group */}
      <div className="rounded-lg border p-4 mb-6" style={{ backgroundColor: '#FFFFFF' }}>
        <h2 className="text-lg font-medium mb-4">Create a Group</h2>
        {!isFirebaseConfigured && (
          <div className="mb-3 text-sm text-red-600">Firebase is not configured; creations won’t persist in demo mode.</div>
        )}
        {error && (
          <div className="mb-3 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="mb-3 text-sm text-green-600">{success}</div>
        )}
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreate}>
          <div>
            <Label htmlFor="name">Group Name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Calculus I Study Group" />
          </div>
          <div>
            <Label htmlFor="course">Course</Label>
            <Input id="course" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="e.g., MATH101" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What will you cover? How often will you meet?" />
          </div>
          <div>
            <Label htmlFor="meetingTime">Meeting Time</Label>
            <Input id="meetingTime" value={form.meetingTime} onChange={(e) => setForm({ ...form, meetingTime: e.target.value })} placeholder="e.g., Tue/Thu 6–7 PM" />
          </div>
          <div>
            <Label htmlFor="maxMembers">Max Members</Label>
            <Input id="maxMembers" type="number" min={2} value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: e.target.value })} placeholder="e.g., 8" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={creating || !form.name.trim()}>
              {creating ? 'Creating...' : 'Create Group'}
            </Button>
          </div>
        </form>
      </div>

      {/* Groups List */}
      <div className="rounded-lg border p-4" style={{ backgroundColor: '#FFFFFF' }}>
        <h2 className="text-lg font-medium mb-4">Discover Groups</h2>
        {groups.length === 0 ? (
          <p className="text-sm opacity-75">No groups yet or you don’t have permission to view them.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => (
              <div key={g.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-md font-semibold">{g.name}</h3>
                    <div className="text-xs opacity-75">Course: {g.course || 'N/A'}</div>
                  </div>
                  <Badge variant="secondary">{Array.isArray(g.members) ? g.members.length : 0} members</Badge>
                </div>
                {g.description && (
                  <p className="text-sm mt-2">{g.description}</p>
                )}
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs opacity-75">Meeting: {g.meetingTime || 'Not set'}</div>
                <div className="flex items-center gap-2">
                  {isOwner(g) && (
                    <Button size="sm" variant="secondary" onClick={() => openInviteDialog(g)}>
                      Invite
                    </Button>
                  )}
                  {isOwner(g) && (
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => handleDeleteGroup(g)}
                      aria-label="Delete group"
                      title="Delete"
                    >
                      <TrashIcon />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleJoinLeave(g)}>
                    {isMember(g) ? 'Leave' : 'Join'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Invite Friends Dialog */}
    <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Friends to Group</DialogTitle>
        </DialogHeader>
        {inviteTargetGroup && (
          <div className="space-y-3">
            <div className="text-sm opacity-75">Group: {inviteTargetGroup.name}</div>
            {!isUserSignedIn && (
              <div className="text-sm text-red-600">
                You must be signed in to view friends.
              </div>
            )}
            {isUserSignedIn && (
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant={activeInviteTab === 'friends' ? 'secondary' : 'outline'}
                  onClick={() => setActiveInviteTab('friends')}
                >
                  Friends
                </Button>
                <Button
                  size="sm"
                  variant={activeInviteTab === 'discover' ? 'secondary' : 'outline'}
                  onClick={() => {
                    setActiveInviteTab('discover');
                    preloadDiscoverable(inviteTargetGroup);
                  }}
                >
                  Discover
                </Button>
              </div>
            )}
            <Input
              placeholder="Search friends..."
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
            />
            <div className="border rounded-md p-2 max-h-64 overflow-auto">
              {activeInviteTab === 'friends' && friendsLoading ? (
                <div className="text-sm">Loading friends...</div>
              ) : activeInviteTab === 'friends' && friends.length === 0 ? (
                <div className="text-sm opacity-75">
                  {isUserSignedIn
                    ? 'No friends to invite (either none accepted or already members).'
                    : 'Friends list unavailable due to authentication or rules.'}
                </div>
              ) : activeInviteTab === 'friends' ? (
                friends
                  .filter((f) => {
                    const name = (f.displayName || f.email?.split('@')[0] || 'User').toLowerCase();
                    return name.includes(friendSearch.toLowerCase());
                  })
                  .map((f) => {
                    const name = f.displayName || f.email?.split('@')[0] || 'User';
                    const checked = selectedFriendIds.has(f.uid);
                    return (
                      <label key={f.uid} className="flex items-center justify-between py-1">
                        <span className="text-sm">{name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFriendSelection(f.uid)}
                        />
                      </label>
                    );
                  })
              ) : discoverableLoading ? (
                <div className="text-sm">Loading users...</div>
              ) : discoverableUsers.length === 0 ? (
                <div className="text-sm opacity-75">No users available to invite.</div>
              ) : (
                discoverableUsers
                  .filter((u) => {
                    const name = (u.displayName || u.email?.split('@')[0] || 'User').toLowerCase();
                    return name.includes(friendSearch.toLowerCase());
                  })
                  .map((u) => {
                    const name = u.displayName || u.email?.split('@')[0] || 'User';
                    const checked = selectedFriendIds.has(u.uid);
                    return (
                      <label key={u.uid} className="flex items-center justify-between py-1">
                        <span className="text-sm">{name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFriendSelection(u.uid)}
                        />
                      </label>
                    );
                  })
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleInviteSubmit} disabled={selectedFriendIds.size === 0}>Invite</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  </div>
  );
}
