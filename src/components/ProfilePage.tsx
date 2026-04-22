import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Clock3,
  Edit3,
  Globe2,
  Lock,
  MapPin,
  MessageCircle,
  Save,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { auth, isFirebaseConfigured, storage } from '../utils/firebase/client';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { updateUserProfile, updateProfile, getProfile, getUserStatus, getFriends, UserProfile, loadTimetable, type ClassItem } from '../utils/firebase/firestore';
import { PrivacySettingsPage } from './PrivacySettingsPage';
import { ImageCropper } from './ImageCropper';

type CurrentUser = {
  id?: string;
  name?: string;
  email?: string;
  university?: string;
  year?: string;
  major?: string;
  bio?: string;
  interests?: string[];
  location?: { name?: string } | null;
  isDevelopmentUser?: boolean;
} | null | undefined;

type ProfileData = {
  name: string;
  email: string;
  university: string;
  year: string;
  major: string;
  bio: string;
  interests: string[];
  location: string;
  photoURL?: string;
};

type TabKey = 'interests' | 'clubs' | 'schedule';

const tabLabels: Array<{ id: TabKey; label: string }> = [
  { id: 'interests', label: 'Interests' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'schedule', label: 'Schedule' },
];

export function ProfilePage({
  currentUser,
  onProfileUpdate,
  goToAbout,
}: {
  currentUser?: CurrentUser;
  onProfileUpdate?: (updatedUser: CurrentUser) => void;
  goToAbout?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [currentStatus, setCurrentStatus] = useState<'in class' | 'in library' | 'in ground' | 'in hostel' | 'available'>('available');
  const [profileData, setProfileData] = useState<ProfileData>({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    university: currentUser?.university || '',
    year: currentUser?.year || '',
    major: currentUser?.major || '',
    bio: 'Passionate about building, exploring ideas, and finding creative people on campus.',
    interests: ['Studio Sessions', 'Design Critiques', 'Photography Walks', 'Coffee Chats'],
    location: currentUser?.location?.name || 'Campus Library',
    photoURL: undefined,
  });
  const [majorOther, setMajorOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [timetable, setTimetable] = useState<Record<string, ClassItem[]>>({});
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    ghostMode: (() => {
      try {
        return localStorage.getItem('ghostMode') === 'on';
      } catch {
        return false;
      }
    })(),
    locationVisible: true,
    onlineStatusVisible: true,
    discoverVisible: true,
    timetableVisible: true,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    try {
      if (privacySettings.ghostMode) {
        localStorage.setItem('ghostMode', 'on');
      } else {
        localStorage.removeItem('ghostMode');
      }
    } catch {}
  }, [privacySettings.ghostMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {});

    const loadProfile = async () => {
      let loadedFromSaved = false;

      if (isFirebaseConfigured && auth.currentUser) {
        try {
          const userProfile = await getProfile(auth.currentUser.uid);
          if (userProfile) {
            setProfileData({
              name: userProfile.name || '',
              email: userProfile.email || auth.currentUser.email || '',
              university: userProfile.university || '',
              year: userProfile.year || '',
              major: userProfile.major || '',
              bio: userProfile.bio || 'Passionate about building, exploring ideas, and finding creative people on campus.',
              interests: userProfile.interests || ['Studio Sessions', 'Design Critiques', 'Photography Walks', 'Coffee Chats'],
              location: userProfile.location?.name || 'Campus Library',
              photoURL: (userProfile as any).photoURL || undefined,
            });
            loadedFromSaved = true;
            if ((userProfile as any).privacySettings) {
              setPrivacySettings((userProfile as any).privacySettings);
            }
          }
        } catch (error) {
          console.error('Error loading profile from Firebase:', error);
        }
      }

      if (currentUser && !loadedFromSaved) {
        setProfileData((prev) => ({
          ...prev,
          name: currentUser.name || prev.name,
          email: currentUser.email || auth.currentUser?.email || prev.email,
          university: currentUser.university || prev.university,
          year: currentUser.year || prev.year,
          major: currentUser.major || prev.major,
          location: currentUser.location?.name || prev.location,
        }));
      }
    };

    loadProfile();
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const loadUserStatus = async () => {
      if (isFirebaseConfigured && auth.currentUser) {
        try {
          const status = await getUserStatus();
          if (status) {
            setCurrentStatus(status as 'in class' | 'in library' | 'in ground' | 'in hostel' | 'available');
          }
        } catch (error) {
          console.error('Error loading user status:', error);
        }
      }
    };

    loadUserStatus();
  }, []);

  useEffect(() => {
    const loadUserTimetable = async () => {
      if (!(isFirebaseConfigured && auth.currentUser)) {
        setTimetable({});
        return;
      }

      try {
        setTimetableLoading(true);
        const data = await loadTimetable();
        setTimetable(data || {});
      } catch (error) {
        console.error('Error loading user timetable for profile:', error);
        setTimetable({});
      } finally {
        setTimetableLoading(false);
      }
    };

    loadUserTimetable();
  }, []);

  useEffect(() => {
    setFriendsLoading(true);
    const unsubscribe = getFriends((list) => {
      setFriends(list);
      setFriendsLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const runFirestoreRuleDiagnostics = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const diagnostics = {
      isSignedIn: !!user,
      emailVerified: user.emailVerified,
      isVITEmail: user.email?.endsWith('@vitstudent.ac.in') || false,
    };

    console.log('FIRESTORE RULE DIAGNOSTICS:', diagnostics);
    return diagnostics;
  };

  const handleSave = async (): Promise<void> => {
    await runFirestoreRuleDiagnostics();

    try {
      setSaving(true);

      const committedMajor = profileData.major === 'OTHER' && majorOther.trim() ? majorOther.trim() : profileData.major;
      const payload: ProfileData = {
        ...profileData,
        major: committedMajor,
      };

      const isFirebaseUser = isFirebaseConfigured && auth.currentUser;
      const isDevelopmentUser = import.meta.env.DEV && currentUser?.isDevelopmentUser;

      if (isFirebaseUser) {
        if (!auth.currentUser.emailVerified) {
          alert('Please verify your email address before saving your profile.');
          return;
        }

        const updateData = {
          name: payload.name,
          email: payload.email,
          university: payload.university,
          year: payload.year,
          major: payload.major,
          bio: payload.bio,
          interests: payload.interests,
          photoURL: payload.photoURL || null,
          privacySettings,
        };

        await updateProfile(auth.currentUser.uid, updateData);
        await updateUserProfile(auth.currentUser.uid, { photoURL: updateData.photoURL || undefined });
      } else if (isDevelopmentUser) {
        const userProfileForStorage = {
          id: currentUser?.id || 'dev-user-123',
          name: payload.name,
          email: payload.email,
          university: payload.university,
          year: payload.year,
          major: payload.major,
          bio: payload.bio,
          interests: payload.interests,
          location: { name: payload.location },
          photoURL: payload.photoURL,
          isDevelopmentUser: true,
        };

        localStorage.setItem('userProfile', JSON.stringify(userProfileForStorage));
        if (onProfileUpdate) {
          onProfileUpdate(userProfileForStorage);
        }
      } else {
        alert('Cannot save profile: user not authenticated and not in development mode.');
        return;
      }

      setProfileData(payload);
      setIsEditing(false);
    } catch (e) {
      console.error('Failed to save profile:', e);
      alert(`Failed to save profile: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacyChange = (field: keyof typeof privacySettings, value: boolean) => {
    setPrivacySettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (field: keyof ProfileData, value: string | string[]) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleInterestChange = (index: number, value: string) => {
    setProfileData((prev) => ({
      ...prev,
      interests: prev.interests.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };

  const handleAddInterest = () => {
    setProfileData((prev) => ({
      ...prev,
      interests: [...prev.interests, 'New Interest'],
    }));
  };

  const handleRemoveInterest = (index: number) => {
    setProfileData((prev) => ({
      ...prev,
      interests: prev.interests.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handlePickPhoto = () => {
    setPhotoError(null);
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    // Read into a data URL and open the cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCropSrc(dataUrl);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);

    // Reset input so selecting the same file again re-triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    setCropOpen(false);
    setCropSrc(null);
  };

  const handleCropDone = async (blob: Blob) => {
    setCropOpen(false);
    setCropSrc(null);

    try {
      setPhotoUploading(true);

      if (isFirebaseConfigured && auth.currentUser && storage) {
        const path = `profile_photos/${auth.currentUser.uid}/${Date.now()}_avatar.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(storageRef);
        setProfileData((prev) => ({ ...prev, photoURL: url }));
        await updateProfile(auth.currentUser.uid, { photoURL: url });
        await updateUserProfile(auth.currentUser.uid, { photoURL: url });
        // Sync App-level currentUser so HomePage / map avatars refresh
        if (onProfileUpdate) {
          onProfileUpdate({ ...(currentUser as any), photoURL: url });
        }
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onloadend = () => resolve(fr.result as string);
          fr.onerror = () => reject(new Error('Failed to read cropped image'));
          fr.readAsDataURL(blob);
        });
        setProfileData((prev) => ({ ...prev, photoURL: dataUrl }));
        try {
          const raw = localStorage.getItem('userProfile');
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem('userProfile', JSON.stringify({ ...parsed, photoURL: dataUrl }));
        } catch {}
        if (onProfileUpdate) {
          onProfileUpdate({ ...(currentUser as any), photoURL: dataUrl });
        }
      }
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      setPhotoError(err?.message || 'Failed to upload image');
    } finally {
      setPhotoUploading(false);
    }
  };

  const displayName = profileData.name || currentUser?.name || 'Your Profile';
  const displaySubtitle = [profileData.major, profileData.year].filter(Boolean).join(' • ') || 'Campus Explorer';
  const friendCount = friends.length;

  const clubList = useMemo(
    () => profileData.interests.slice(0, 3).map((interest) => `${interest} Circle`),
    [profileData.interests]
  );

  const scheduleItems = useMemo(() => {
    return Object.entries(timetable)
      .flatMap(([day, classes]) =>
        (classes || []).map((item) => ({
          key: `${day}-${item.id}-${item.time}`,
          day,
          title: item.title || item.course || 'Class',
          place: item.location || item.academicBlock || 'Location TBA',
          time: item.time,
        }))
      )
      .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  }, [timetable]);

  if (showPrivacySettings) {
    return (
      <div className="absolute inset-0 z-50 overflow-y-auto bg-white">
        <button
          onClick={() => setShowPrivacySettings(false)}
          className="fixed left-4 top-4 z-50 rounded-full p-2 hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <PrivacySettingsPage />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-sky-50 text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Ambient sky/violet blurs (matches Discover) */}
      <div aria-hidden className="pointer-events-none absolute -top-48 left-[55%] w-48 h-48 bg-sky-400/10 rounded-full blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-[900px] -left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl" />

      {/* Sticky glass header (matches Discover) */}
      <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-sky-400/10 bg-white/60 px-5 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setIsEditing((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-sky-400/20"
          aria-label="Edit profile"
          data-testid="profile-header-avatar-btn"
        >
          {profileData.photoURL ? (
            <img src={profileData.photoURL} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-sky-700">{displayName.charAt(0)}</span>
          )}
        </button>

        <div className="text-lg font-bold tracking-tight text-sky-400" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Profile
        </div>

        <button
          type="button"
          onClick={() => setShowPrivacySettings(true)}
          className="rounded-full p-2 text-sky-500 transition-colors hover:bg-sky-100/60"
          aria-label="Privacy settings"
          data-testid="profile-privacy-btn"
        >
          <Lock className="h-5 w-5" />
        </button>
      </header>

      {/* Main content - normal flow, fills viewport, scrolls naturally */}
      <section className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="rounded-[2rem] bg-white/70 px-5 py-6 shadow-[0_10px_40px_rgba(56,189,248,0.08)] ring-1 ring-sky-400/10 backdrop-blur-[12px] sm:px-7 sm:py-8">
          <header className="flex flex-col items-center text-center">
            <div className="group relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-sky-400 to-sky-200 opacity-30 blur-sm transition-opacity group-hover:opacity-50" />
              <Avatar className="relative h-24 w-24 border-4 border-white shadow-xl">
                <AvatarImage src={profileData.photoURL} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-sky-100 text-2xl font-bold text-sky-700">
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={handlePickPhoto}
                className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-sky-400 text-white shadow-[0_4px_6px_-4px_rgba(56,189,248,0.3),0_10px_15px_-3px_rgba(56,189,248,0.3)] transition-transform active:scale-95 hover:bg-sky-500"
                aria-label="Upload photo"
                data-testid="profile-upload-photo-btn"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelected}
            />

            <div className="mt-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {displayName}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">{displaySubtitle}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-600 ring-1 ring-sky-400/20">{friendCount} friends</span>
              <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-sky-400/10">
                {friendsLoading ? 'Syncing network...' : profileData.location || 'On campus'}
              </span>
            </div>

            <div className="mt-5 flex w-full max-w-xs gap-2.5">
              <Button
                type="button"
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                disabled={saving}
                className="h-11 flex-1 rounded-2xl bg-sky-400 text-sm font-bold text-white shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)] hover:bg-sky-500"
                data-testid="profile-edit-save-btn"
              >
                {isEditing ? <Save className="mr-2 h-4 w-4" /> : <Edit3 className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isEditing ? 'Save Profile' : 'Edit Profile'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={goToAbout}
                className="h-11 w-11 rounded-2xl bg-white text-sky-600 ring-1 ring-sky-400/10 hover:bg-sky-50"
                data-testid="profile-about-btn"
              >
                {isEditing ? <MessageCircle className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>

            {(photoUploading || photoError) && (
              <div className="mt-2 text-xs text-slate-500">
                {photoUploading ? 'Uploading photo...' : photoError}
              </div>
            )}
          </header>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
            <InfoChip icon={Globe2} label="Campus" value={profileData.university || 'UniNest'} />
            <InfoChip icon={MapPin} label="Spot" value={profileData.location || 'Campus Library'} />
            <InfoChip icon={Sparkles} label="Status" value={currentStatus} />
          </div>

          <nav className="mt-6">
            <div className="flex items-center justify-between rounded-2xl bg-white/60 p-1 ring-1 ring-sky-400/10">
              {tabLabels.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-sky-400 text-white shadow-[0_4px_6px_-4px_rgba(56,189,248,0.3)]'
                      : 'text-slate-600 hover:bg-sky-50'
                  }`}
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  data-testid={`profile-tab-${tab.id}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <section className="mt-6">
            {activeTab === 'schedule' && (
              <div className="space-y-5">
                {timetableLoading ? (
                  <p className="text-sm text-slate-500">Loading your timetable...</p>
                ) : scheduleItems.length === 0 ? (
                  <div className="rounded-[1.25rem] bg-white/60 ring-1 ring-sky-400/10 p-4 text-center">
                    <p className="text-sm font-semibold text-slate-800">No timetable in database yet</p>
                    <p className="mt-1 text-xs text-slate-500">Upload or create your timetable to see it here.</p>
                  </div>
                ) : (
                  scheduleItems.map((item, index) => (
                    <div key={item.key} className="relative flex gap-4">
                      {index < scheduleItems.length - 1 && (
                        <div className="absolute bottom-[-20px] left-[9px] top-6 w-[2px] bg-sky-400/20" />
                      )}
                      <div className="z-10 mt-1 h-5 w-5 rounded-full border-[3px] border-white bg-sky-400 shadow-sm" />
                      <div className="flex-1 pb-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                              {item.title}
                            </h3>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-500">{item.day}</p>
                          </div>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">{item.place}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{item.time}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'interests' && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-600">
                  {profileData.bio || 'Add a short intro so people instantly get your vibe.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {profileData.interests.map((interest, index) => (
                    <span
                      key={`${interest}-${index}`}
                      className="rounded-full bg-sky-400/10 px-3 py-1.5 text-sm font-medium text-sky-600 ring-1 ring-sky-400/20"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'clubs' && (
              <div className="space-y-3">
                {clubList.map((club, index) => (
                  <div key={`${club}-${index}`} className="rounded-[1.25rem] bg-white/60 ring-1 ring-sky-400/10 p-3.5">
                    <p className="text-sm font-semibold text-slate-800">{club}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      A social circle built around {profileData.interests[index]?.toLowerCase() || 'campus life'}.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 space-y-3 rounded-[1.5rem] bg-white/60 ring-1 ring-sky-400/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Visibility
                </h2>
                <p className="text-xs text-slate-500">Quick privacy controls for your campus presence.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPrivacySettings(true)}
                className="h-8 rounded-full px-3 text-xs text-sky-500 hover:bg-sky-50"
              >
                More
              </Button>
            </div>

            <ToggleRow
              label="Ghost Mode"
              description="Hide completely from maps and discovery."
              checked={privacySettings.ghostMode}
              onCheckedChange={(checked) => handlePrivacyChange('ghostMode', checked)}
            />
            <ToggleRow
              label="Location Sharing"
              description="Let friends see where you are on campus."
              checked={privacySettings.locationVisible}
              onCheckedChange={(checked) => handlePrivacyChange('locationVisible', checked)}
            />
            <ToggleRow
              label="Online Status"
              description="Show whether you're available right now."
              checked={privacySettings.onlineStatusVisible}
              onCheckedChange={(checked) => handlePrivacyChange('onlineStatusVisible', checked)}
            />
          </section>

          {isEditing && (
            <section className="mt-6 space-y-5 rounded-[1.5rem] bg-white/70 ring-1 ring-sky-400/10 p-4 sm:p-5">
              <div>
                <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Edit Details
                </h2>
                <p className="text-xs text-slate-500">Tune your identity card without leaving the profile view.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={profileData.name} onChange={(e) => handleInputChange('name', e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input value={profileData.email} onChange={(e) => handleInputChange('email', e.target.value)} />
                </Field>
                <Field label="University">
                  <Input value={profileData.university} onChange={(e) => handleInputChange('university', e.target.value)} />
                </Field>
                <Field label="Year">
                  <Input value={profileData.year} onChange={(e) => handleInputChange('year', e.target.value)} />
                </Field>
                <Field label="Program">
                  <Input value={profileData.major} onChange={(e) => handleInputChange('major', e.target.value)} />
                </Field>
                <Field label="Favorite Spot">
                  <Input value={profileData.location} onChange={(e) => handleInputChange('location', e.target.value)} />
                </Field>
              </div>

              {profileData.major === 'OTHER' && (
                <Field label="Specify Program">
                  <Input value={majorOther} onChange={(e) => setMajorOther(e.target.value)} placeholder="E.g. MSc Data Science" />
                </Field>
              )}

              <Field label="Bio">
                <textarea
                  value={profileData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-sky-400/20 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400"
                  placeholder="Write something warm, specific, and useful."
                />
              </Field>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">Interests</Label>
                  <button type="button" onClick={handleAddInterest} className="text-sm font-semibold text-sky-500 hover:text-sky-600">
                    + Add
                  </button>
                </div>
                {profileData.interests.map((interest, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Input value={interest} onChange={(e) => handleInterestChange(index, e.target.value)} />
                    <button
                      type="button"
                      onClick={() => handleRemoveInterest(index)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-11 w-full rounded-2xl bg-sky-400 text-sm font-bold text-white hover:bg-sky-500 shadow-[0_10px_15px_-3px_rgba(56,189,248,0.3),0_4px_6px_-4px_rgba(56,189,248,0.3)]"
                data-testid="profile-save-details-btn"
              >
                {saving ? 'Saving...' : 'Save Profile Settings'}
              </Button>
            </section>
          )}
        </div>
      </section>

      {/* Image cropper modal */}
      <ImageCropper
        open={cropOpen}
        imageSrc={cropSrc}
        onCancel={handleCropCancel}
        onCropComplete={handleCropDone}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

function InfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/70 p-4 shadow-[0_10px_30px_rgba(148,163,184,0.08)]">
      <div className="flex items-center gap-2 text-sky-600">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-low/80 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
