import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectLabel, SelectSeparator, SelectGroup } from './ui/select';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { auth, isFirebaseConfigured, storage } from '../utils/firebase/client';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { updateUserProfile, getUserProfile, updateProfile, getProfile, getUserStatus, getFriends, UserProfile } from '../utils/firebase/firestore';

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

export function ProfilePage({ currentUser, onProfileUpdate, goToAbout }: { currentUser?: CurrentUser; onProfileUpdate?: (updatedUser: CurrentUser) => void; goToAbout?: () => void }) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [currentStatus, setCurrentStatus] = useState<'in class' | 'in library' | 'in ground' | 'in hostel' | 'available'>('available');
  const [profileData, setProfileData] = useState<ProfileData>({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    university: currentUser?.university || '',
    year: currentUser?.year || '',
    major: currentUser?.major || '',
    bio: 'Passionate about technology and always looking to connect with fellow students!',
    interests: ['Programming', 'Photography', 'Music', 'Sports'],
    location: currentUser?.location?.name || 'Campus Library',
    photoURL: undefined
  });
  const [majorOther, setMajorOther] = useState('');
  const [saving, setSaving] = useState<boolean>(false);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState<boolean>(false);
  const [showFriends, setShowFriends] = useState<boolean>(false);
  const [showClubs, setShowClubs] = useState<boolean>(false);

  // Local Privacy State
  const [privacySettings, setPrivacySettings] = useState({
    locationVisible: false,
    onlineStatusVisible: false,
    discoverVisible: false,
    timetableVisible: false,
  });

  // Sync profile data when currentUser changes or load from Firebase/localStorage
  useEffect(() => {
    // Set up authentication state listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔥 Firebase Auth State Changed:', {
        user: user ? {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          isVITEmail: user.email?.endsWith('@vitstudent.ac.in')
        } : null
      });
    });

    const loadProfile = async () => {
      console.log('=== PROFILE LOAD DEBUG START ===');
      console.log('🔄 useEffect triggered with currentUser:', currentUser);
      console.log('🔧 Environment check:');
      console.log('  - Development mode:', import.meta.env.DEV);
      console.log('  - isDevelopmentUser:', currentUser?.isDevelopmentUser);
      console.log('💾 localStorage content:', localStorage.getItem('userProfile'));

      let loadedFromSaved = false;

      // Debug authentication state
      console.log('🔍 Authentication Debug Info:', {
        isFirebaseConfigured,
        currentUser: auth.currentUser,
        currentUserUid: auth.currentUser?.uid,
        currentUserEmail: auth.currentUser?.email,
        currentUserEmailVerified: auth.currentUser?.emailVerified
      });

      // Prioritize Firebase for authenticated users (including development)
      if (isFirebaseConfigured && auth.currentUser) {
        // Load from Firebase for real users
        console.log('📡 Loading from Firebase for authenticated user...');
        console.log('🔍 User details for Firebase load:', {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          emailVerified: auth.currentUser.emailVerified,
          isVITEmail: auth.currentUser.email?.endsWith('@vitstudent.ac.in')
        });
        try {
          const userProfile = await getProfile(auth.currentUser.uid);
          if (userProfile) {
            setProfileData({
              name: userProfile.name || '',
              email: userProfile.email || auth.currentUser.email || '',
              university: userProfile.university || '',
              year: userProfile.year || '',
              major: userProfile.major || '',
              bio: userProfile.bio || 'Passionate about technology and always looking to connect with fellow students!',
              interests: userProfile.interests || ['Programming', 'Photography', 'Music', 'Sports'],
              location: userProfile.location?.name || 'Campus Library',
              photoURL: (userProfile as any).photoURL || undefined
            });
            loadedFromSaved = true;
            console.log('✅ Loaded profile from Firebase:', userProfile);
            if ((userProfile as any).privacySettings) {
              setPrivacySettings((userProfile as any).privacySettings);
            }
          }
        } catch (error) {
          console.error('Error loading profile from Firebase:', error);
        }
      }

      // Only update with currentUser data if we haven't loaded saved data
      // This prevents overwriting saved changes with stale currentUser data
      if (currentUser && !loadedFromSaved) {
        console.log('🔄 Using currentUser data as fallback:', currentUser);
        setProfileData(prev => ({
          ...prev,
          name: currentUser.name || prev.name,
          email: currentUser.email || (auth.currentUser?.email) || prev.email,
          university: currentUser.university || prev.university,
          year: currentUser.year || prev.year,
          major: currentUser.major || prev.major,
          location: currentUser.location?.name || prev.location,
          photoURL: prev.photoURL
        }));
      } else if (!currentUser) {
        console.log('⚠️ No currentUser provided');
      } else if (loadedFromSaved) {
        console.log('✅ Skipping currentUser fallback - loaded from saved data');
      }

      console.log('=== PROFILE LOAD DEBUG END ===');
    };

    loadProfile();

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  // Load current user status
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

  // Subscribe to accepted friends (Firebase-authenticated users only)
  const [friendProfileNames, setFriendProfileNames] = useState<Record<string, string>>({});
  useEffect(() => {
    setFriendsLoading(true);
    const unsubscribe = getFriends((list) => {
      setFriends(list);
      setFriendsLoading(false);
      // Resolve friend names from profiles collection to prefer user-provided names
      Promise.all(list.map((f) => getProfile(f.uid))).then((profiles) => {
        const map: Record<string, string> = {};
        profiles.forEach((p, idx) => {
          const uid = list[idx]?.uid;
          const name = p?.name;
          if (uid && typeof name === 'string' && name.trim()) {
            map[uid] = name.trim();
          }
        });
        if (Object.keys(map).length > 0) {
          setFriendProfileNames((prev) => ({ ...prev, ...map }));
        }
      }).catch(() => { });
    });
    return () => {
      // getFriends returns a no-op when not authenticated/verified
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Add comprehensive diagnostic function
  const runFirestoreRuleDiagnostics = async () => {
    console.log('🔧 Running Firestore Rule Diagnostics...');

    const user = auth.currentUser;
    console.log('🔍 Current Firebase User:', user);

    if (!user) {
      console.error('❌ DIAGNOSTIC: User is not signed in to Firebase');
      return;
    }

    // Check all rule conditions
    const diagnostics = {
      isSignedIn: !!user,
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      isVITEmail: user.email?.endsWith('@vitstudent.ac.in') || false,
      hasRequiredClaims: true // Assuming no custom claims for now
    };

    console.log('🔍 FIRESTORE RULE DIAGNOSTICS:', diagnostics);

    // Check each rule condition
    console.log('✅ isSignedIn():', diagnostics.isSignedIn);
    console.log('✅ emailVerified():', diagnostics.emailVerified);
    console.log('✅ isVIT():', diagnostics.isVITEmail);
    console.log('✅ request.auth.uid matches resource:', 'Will match if saving to /profiles/' + user.uid);

    // Overall rule evaluation
    const canRead = diagnostics.isSignedIn;
    const canWrite = diagnostics.isSignedIn && diagnostics.emailVerified && diagnostics.isVITEmail;

    console.log('📖 CAN READ from /profiles/{uid}:', canRead);
    console.log('✏️ CAN WRITE to /profiles/{uid}:', canWrite);

    if (!canWrite) {
      console.error('❌ WRITE PERMISSION DENIED because:');
      if (!diagnostics.isSignedIn) console.error('  - User not signed in');
      if (!diagnostics.emailVerified) console.error('  - Email not verified');
      if (!diagnostics.isVITEmail) console.error('  - Email is not @vitstudent.ac.in');
    }

    return diagnostics;
  };

  const handleSave = async (): Promise<void> => {
    // Run diagnostics before attempting save
    await runFirestoreRuleDiagnostics();
    try {
      setSaving(true);
      const committedMajor = profileData.major === 'OTHER' && majorOther.trim() ? majorOther.trim() : profileData.major;
      const payload: ProfileData = {
        ...profileData,
        major: committedMajor,
      };

      console.log('=== PROFILE SAVE DEBUG START ===');
      console.log('🔧 Environment check:');
      console.log('  - Firebase configured:', isFirebaseConfigured);
      console.log('  - Development mode (import.meta.env.DEV):', import.meta.env.DEV);
      console.log('  - Current auth user:', auth.currentUser);
      console.log('  - User UID:', auth.currentUser?.uid);
      console.log('  - User email verified:', auth.currentUser?.emailVerified);
      console.log('👤 User data:');
      console.log('  - Current user from props:', currentUser);
      console.log('  - isDevelopmentUser flag:', currentUser?.isDevelopmentUser);
      console.log('📝 Profile data to save:', payload);
      console.log('💾 Current localStorage content:', localStorage.getItem('userProfile'));

      // Always use Firebase when authenticated, localStorage as fallback only
      const isFirebaseUser = isFirebaseConfigured && auth.currentUser;
      const isDevelopmentUser = import.meta.env.DEV && currentUser?.isDevelopmentUser;

      console.log('🔍 Save path determination:');
      console.log('  - isFirebaseUser:', isFirebaseUser);
      console.log('  - isDevelopmentUser (fallback only):', isDevelopmentUser);

      if (isFirebaseUser) {
        console.log('📡 Taking Firebase save path...');
        console.log('🔍 User auth status:', {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          emailVerified: auth.currentUser.emailVerified,
          isVITEmail: auth.currentUser.email?.endsWith('@vitstudent.ac.in')
        });
        console.log('Attempting to save profile data to Firebase...');
        const updateData = {
          name: payload.name,
          email: payload.email,
          university: payload.university,
          year: payload.year,
          major: payload.major,
          bio: payload.bio,
          interests: payload.interests,
          photoURL: payload.photoURL || null,
          privacySettings: privacySettings
        };
        console.log('Update data:', updateData);

        // Check if email is verified before attempting to save
        if (!auth.currentUser.emailVerified) {
          alert('❌ Please verify your email address before saving your profile. Check your inbox for a verification email.');
          return;
        }

        try {
          await updateProfile(auth.currentUser.uid, updateData);
          // Also update users collection for consistency (avatars used elsewhere)
          await updateUserProfile(auth.currentUser.uid, { photoURL: updateData.photoURL || undefined });
          console.log('✅ Profile saved successfully to Firebase');
          alert('✅ Profile saved successfully to Firebase!');
        } catch (error: any) {
          console.error('Error updating user profile:', error);
          if (error.code === 'permission-denied') {
            alert('❌ Permission denied. Please ensure your email is verified and you are using a VIT student email.');
          } else {
            alert('❌ Failed to save profile to Firebase. Please try again.');
          }
          return;
        }
      } else if (isDevelopmentUser) {
        console.log('💻 Taking development save path...');

        // Convert ProfileData to CurrentUser format for localStorage
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
          isDevelopmentUser: true
        };

        console.log('🔄 Converting ProfileData to CurrentUser format:');
        console.log('  - Original payload:', payload);
        console.log('  - Converted for storage:', userProfileForStorage);

        // Save to localStorage in development mode
        localStorage.setItem('userProfile', JSON.stringify(userProfileForStorage));
        console.log('💾 Saved to localStorage with key "userProfile"');
        console.log('✅ Verification - localStorage now contains:', localStorage.getItem('userProfile'));

        alert('Profile saved successfully! (Development mode - changes are local only)');

        // Update parent component's currentUser state
        if (onProfileUpdate && currentUser) {
          console.log('🔄 Calling onProfileUpdate with:', userProfileForStorage);
          onProfileUpdate(userProfileForStorage);
          console.log('✅ Parent state update completed');
        } else {
          console.log('⚠️ onProfileUpdate not called:', { onProfileUpdate: !!onProfileUpdate, currentUser: !!currentUser });
        }
      } else {
        console.log('❌ Cannot save profile:');
        console.log('- Firebase configured:', isFirebaseConfigured);
        console.log('- User authenticated:', !!auth.currentUser);
        console.log('- Development mode:', import.meta.env.DEV);
        console.log('- Development user:', isDevelopmentUser);
        alert('Cannot save profile: User not authenticated and not in development mode');
        return;
      }

      setProfileData(payload);
      setIsEditing(false);
    } catch (e) {
      console.error('❌ Failed to save profile:', e);
      console.error('Error details:', {
        message: e instanceof Error ? e.message : 'Unknown error',
        stack: e instanceof Error ? e.stack : undefined,
        code: (e as any)?.code,
        details: (e as any)?.details
      });
      alert(`Failed to save profile: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof ProfileData, value: string | string[]): void => {
    setProfileData((prev: ProfileData) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleClubNameChange = (index: number, value: string) => {
    setProfileData(prev => ({
      ...prev,
      interests: prev.interests.map((c, i) => (i === index ? value : c))
    }));
  };

  const handleAddClub = () => {
    setProfileData(prev => ({ ...prev, interests: [...prev.interests, 'New Club'] }));
  };

  const handleRemoveClub = (index: number) => {
    setProfileData(prev => ({
      ...prev,
      interests: prev.interests.filter((_, i) => i !== index)
    }));
  };

  // Photo upload handler
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePickPhoto = () => {
    setPhotoError(null);
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      setPhotoUploading(true);
      // If Firebase is configured and user is authenticated, upload to Storage
      if (isFirebaseConfigured && auth.currentUser && storage) {
        const path = `profile_photos/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        // Update local state
        setProfileData(prev => ({ ...prev, photoURL: url }));
        // Persist to Firestore collections
        try {
          await updateProfile(auth.currentUser.uid, { photoURL: url });
          await updateUserProfile(auth.currentUser.uid, { photoURL: url });
        } catch (err) {
          console.error('Error saving photoURL to Firestore:', err);
        }
      } else {
        // Development/local fallback: store data URL and in localStorage
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setProfileData(prev => ({ ...prev, photoURL: dataUrl }));
          try {
            const raw = localStorage.getItem('userProfile');
            const parsed = raw ? JSON.parse(raw) : {};
            localStorage.setItem('userProfile', JSON.stringify({ ...parsed, photoURL: dataUrl }));
          } catch { }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      setPhotoError(err?.message || 'Failed to upload image');
    } finally {
      setPhotoUploading(false);
      // Clear file input value to allow re-selecting same file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-24">
      <div className="text-center mb-8 animate-in fade-in duration-200" style={{ animationDelay: '0.1s' }}>
        <h1 className="text-4xl font-bold text-gradient mb-2 tracking-tight">My Profile</h1>
        <p className="text-slate-500 font-medium">Manage your UniNest profile and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-200" style={{ animationDelay: '0.2s' }}>
        <Card className="lg:col-span-1 glass-card border-none overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-sky-400/20 to-blue-500/20 blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
          <CardContent className="pt-12 relative z-10">
            <div className="text-center space-y-6">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-sky-400/20 rounded-full blur-xl animate-pulse"></div>
                <Avatar className="w-32 h-32 mx-auto border-[6px] border-white shadow-2xl relative z-10 bg-white ring-4 ring-sky-50">
                  {profileData.photoURL ? (
                    <AvatarImage src={profileData.photoURL} alt={profileData.name || 'Profile photo'} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-sky-100 to-blue-200 text-sky-600 font-bold">
                    {profileData.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0">
                  <Button
                    type="button"
                    onClick={handlePickPhoto}
                    size="icon"
                    className="rounded-full bg-secondary hover:bg-secondary/80 text-black shadow-lg"
                    disabled={photoUploading}
                    title="Change Photo"
                  >
                    {photoUploading ? '...' : '📷'}
                  </Button>
                </div>
              </div>

              {photoError && (
                <p className="text-destructive text-xs">{photoError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelected}
              />

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-foreground">{profileData.name}</h2>
                <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
                  <span>{profileData.major}</span>
                  <span>{profileData.year}</span>
                </div>
              </div>

              <Badge variant="outline" className={`
                px-4 py-1.5 text-sm rounded-full border-0 shadow-sm backdrop-blur-md
                ${currentStatus === 'available' ? 'bg-green-100/50 text-green-700 ring-1 ring-green-200' :
                  currentStatus === 'in class' ? 'bg-amber-100/50 text-amber-700 ring-1 ring-amber-200' :
                    currentStatus === 'in library' ? 'bg-indigo-100/50 text-indigo-700 ring-1 ring-indigo-200' :
                      currentStatus === 'in ground' ? 'bg-emerald-100/50 text-emerald-700 ring-1 ring-emerald-200' :
                        'bg-slate-100/50 text-slate-700 ring-1 ring-slate-200'}
              `}>
                {currentStatus === 'available' ? '🟢 Available' :
                  currentStatus === 'in class' ? '📚 In Class' :
                    currentStatus === 'in library' ? '📖 In Library' :
                      currentStatus === 'in ground' ? '⚽ In Ground' :
                        currentStatus === 'in hostel' ? '🏠 In Hostel' : '🟢 Available'}
              </Badge>

              <Button
                onClick={() => setIsEditing(!isEditing)}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-foreground transition-all duration-300 shadow-sm"
              >
                {isEditing ? 'Cancel Editing' : 'Edit Profile'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Card className="lg:col-span-2 glass-card border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">📝</span> Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-muted-foreground">Full Name</Label>
                {isEditing ? (
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="bg-white border-gray-200 focus:border-primary/50 text-foreground"
                  />
                ) : (
                  <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100">{profileData.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                {isEditing ? (
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="bg-white/5 border-white/10 focus:border-primary/50 text-foreground"
                  />
                ) : (
                  <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100 break-all">{profileData.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="university" className="text-muted-foreground">University</Label>
                {isEditing ? (
                  <Select value={profileData.university} onValueChange={(v: string) => handleInputChange('university', v)}>
                    <SelectTrigger aria-label="Select University" className="bg-white/5 border-white/10 text-foreground">
                      <SelectValue placeholder="Select University" />
                    </SelectTrigger>
                    <SelectContent className="bg-black/90 border-white/10 text-foreground">
                      <SelectGroup>
                        <SelectLabel>Available Locations</SelectLabel>
                        <SelectItem value="Vellore">Vellore</SelectItem>
                        <SelectItem value="Chennai">Chennai</SelectItem>
                        <SelectItem value="Bhopal">Bhopal</SelectItem>
                        <SelectItem value="AP">AP</SelectItem>
                        <SelectItem value="Bangalore">Bangalore</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100">{profileData.university}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="year" className="text-muted-foreground">Academic Year</Label>
                {isEditing ? (
                  <Select value={profileData.year} onValueChange={(v: string) => handleInputChange('year', v)}>
                    <SelectTrigger aria-label="Select Year" className="bg-white/5 border-white/10 text-foreground">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent className="bg-black/90 border-white/10 text-foreground">
                      <SelectItem value="1st Year">1st Year</SelectItem>
                      <SelectItem value="2nd Year">2nd Year</SelectItem>
                      <SelectItem value="3rd Year">3rd Year</SelectItem>
                      <SelectItem value="4th Year">4th Year</SelectItem>
                      <SelectItem value="5th Year">5th Year</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100">{profileData.year}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="major" className="text-muted-foreground">Major</Label>
                {isEditing ? (
                  <>
                    <Select value={profileData.major} onValueChange={(v: string) => handleInputChange('major', v)}>
                      <SelectTrigger aria-label="Select Major" className="bg-white/5 border-white/10 text-foreground">
                        <SelectValue placeholder="Select B.Tech Course" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 border-white/10 text-foreground">
                        <SelectGroup>
                          <SelectLabel>Popular B.Tech</SelectLabel>
                          <SelectItem value="CSE">Computer Science and Engineering (CSE)</SelectItem>
                          <SelectItem value="ECE">Electronics and Communication (ECE)</SelectItem>
                          <SelectItem value="EEE">Electrical and Electronics (EEE)</SelectItem>
                          <SelectItem value="MECH">Mechanical Engineering</SelectItem>
                          <SelectItem value="CIVIL">Civil Engineering</SelectItem>
                          <SelectItem value="CHE">Chemical Engineering</SelectItem>
                          <SelectItem value="IT">Information Technology</SelectItem>
                          <SelectItem value="AIML">AI & ML</SelectItem>
                          <SelectItem value="DS">Data Science</SelectItem>
                          <SelectItem value="BIOTECH">Biotechnology</SelectItem>
                        </SelectGroup>
                        <SelectGroup className="border-t border-white/10 pt-2 mt-2">
                          <SelectItem value="OTHER">Other...</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {profileData.major === 'OTHER' && (
                      <div className="mt-2">
                        <Input
                          id="major-custom"
                          placeholder="Enter your branch"
                          value={majorOther}
                          onChange={(e) => setMajorOther(e.target.value)}
                          className="bg-white/5 border-white/10 text-foreground"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100">{profileData.major}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-muted-foreground">Bio</Label>
              {isEditing ? (
                <Textarea
                  id="bio"
                  value={profileData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  rows={3}
                  className="bg-white/5 border-white/10 text-foreground resize-none"
                />
              ) : (
                <p className="p-3 bg-gray-50/50 rounded-xl text-foreground/90 border border-gray-100 whitespace-pre-wrap">{profileData.bio}</p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-muted-foreground">Interests & Clubs</Label>
              {isEditing ? (
                <div className="space-y-3">
                  {profileData.interests.map((club, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        value={club}
                        onChange={(e) => handleClubNameChange(index, e.target.value)}
                        className="bg-white/5 border-white/10 text-foreground"
                      />
                      <Button variant="destructive" size="icon" onClick={() => handleRemoveClub(index)} className="shrink-0 bg-red-500/20 text-red-500 hover:bg-red-500/30">×</Button>
                    </div>
                  ))}
                  <Button onClick={handleAddClub} variant="outline" className="w-full border-dashed border-white/20 hover:bg-white/5 text-muted-foreground">+ Add Interest</Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profileData.interests.map((club, index) => (
                    <Badge key={index} variant="secondary" className="px-3 py-1 bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20">
                      {club}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary text-white font-bold shadow-md shadow-primary/20"
                >
                  {saving ? 'Saving Changes...' : 'Save Profile'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Privacy settings */}
      <div className="animate-in fade-in duration-200" style={{ animationDelay: '0.25s' }}>
        <Card className="glass-card border-none bg-gradient-to-br from-white/90 to-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">🛡️</span> Privacy & Visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white">
                <div>
                  <Label className="text-base font-medium">Location on Campus Map</Label>
                  <p className="text-sm text-slate-500">Allow friends to see your precise location</p>
                </div>
                <Switch 
                  checked={privacySettings.locationVisible}
                  onCheckedChange={(c) => setPrivacySettings(p => ({ ...p, locationVisible: c }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white">
                <div>
                  <Label className="text-base font-medium">Online Status</Label>
                  <p className="text-sm text-slate-500">Show when you are currently active</p>
                </div>
                <Switch 
                  checked={privacySettings.onlineStatusVisible}
                  onCheckedChange={(c) => setPrivacySettings(p => ({ ...p, onlineStatusVisible: c }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white">
                <div>
                  <Label className="text-base font-medium">Discover Visibility</Label>
                  <p className="text-sm text-slate-500">Appear in the Discover buddy-matching feed</p>
                </div>
                <Switch 
                  checked={privacySettings.discoverVisible}
                  onCheckedChange={(c) => setPrivacySettings(p => ({ ...p, discoverVisible: c }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white">
                <div>
                  <Label className="text-base font-medium">Timetable Sharing</Label>
                  <p className="text-sm text-slate-500">Allow friends to compare classes with you</p>
                </div>
                <Switch 
                  checked={privacySettings.timetableVisible}
                  onCheckedChange={(c) => setPrivacySettings(p => ({ ...p, timetableVisible: c }))}
                />
              </div>
            </div>
            <p className="text-xs text-center text-slate-400 mt-4">You can always change these visibility preferences later</p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Card */}
      <div className="animate-in fade-in duration-200" style={{ animationDelay: '0.3s' }}>
        <Card className="glass-card border-none bg-gradient-to-br from-white/90 to-sky-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">📊</span> Activity Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <button
                type="button"
                onClick={() => setShowFriends((prev) => !prev)}
                aria-expanded={showFriends}
                aria-controls="friends-section"
                className="p-6 rounded-2xl bg-white/60 border border-white shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-4xl font-bold text-slate-800 mb-2 group-hover:scale-110 transition-transform">{friends.length}</div>
                <div className="text-sm font-medium text-slate-500 group-hover:text-sky-600 transition-colors">Friends</div>
              </button>
              <div className="p-6 rounded-2xl bg-white/60 border border-white shadow-sm hover:-translate-y-1 transition-all duration-300">
                <div className="text-4xl font-bold text-slate-800 mb-2">5</div>
                <div className="text-sm font-medium text-slate-500">Study Groups</div>
              </div>
              <button
                type="button"
                onClick={() => setShowClubs((prev) => !prev)}
                aria-expanded={showClubs}
                aria-controls="clubs-section"
                className="p-6 rounded-2xl bg-white/60 border border-white shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
              >
                <div className="text-4xl font-bold text-slate-800 mb-2 group-hover:scale-110 transition-transform">{Array.isArray(profileData.interests) ? profileData.interests.length : 0}</div>
                <div className="text-sm font-medium text-slate-500 group-hover:text-sky-600 transition-colors">Interests</div>
              </button>
              <div className="p-6 rounded-2xl bg-white/60 border border-white shadow-sm hover:-translate-y-1 transition-all duration-300">
                <div className="text-4xl font-bold text-slate-800 mb-2">7</div>
                <div className="text-sm font-medium text-slate-500">Days Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Friends List */}
      {showFriends && (
        <Card id="friends-section" className="glass-card border-none animation-fade-in">
          <CardHeader>
            <CardTitle className="text-primary">My Friends</CardTitle>
          </CardHeader>
          <CardContent>
            {friendsLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading friends...</p>
            ) : !isFirebaseConfigured || !auth.currentUser ? (
              <p className="text-muted-foreground text-center py-8">Sign in with a verified VIT email to see your friends.</p>
            ) : friends.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No friends yet.</p>
                <Button variant="outline" className="border-white/10 hover:bg-white/5">Find Friends</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map((friend) => (
                  <div key={friend.uid} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 transition-colors">
                    <Avatar className="w-12 h-12 border border-white/10">
                      <AvatarImage src={friend.photoURL || ''} alt={(friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'Friend')} />
                      <AvatarFallback className="bg-primary/20 text-primary">{(friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || '?').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground truncate">{friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'User'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[friend.major, friend.year].filter(Boolean).join(' • ') || 'Student'}
                      </div>
                    </div>
                    {friend.status && (
                      <Badge variant="outline" className="bg-black/40 border-white/10 ml-2 whitespace-nowrap">
                        {friend.status === 'available' ? '🟢 Available' :
                          friend.status === 'in class' ? '📚 Class' :
                            friend.status === 'in library' ? '📖 Library' :
                              friend.status === 'in ground' ? '⚽ Ground' :
                                friend.status === 'in hostel' ? '🏠 Hostel' : '🟢'}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clubs and Chapters List */}
      {showClubs && (
        <Card id="clubs-section" className="glass-card border-none animation-fade-in">
          <CardHeader>
            <CardTitle className="text-primary">My Interests & Clubs</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(profileData.interests) && profileData.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profileData.interests.map((club, index) => (
                  <Badge key={index} variant="secondary" className="px-3 py-1 bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20">
                    {club}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No interests added yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* About Link */}
      <div className="mt-8 text-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => goToAbout && goToAbout()}
          className="text-muted-foreground hover:text-primary hover:bg-white/5 transition-colors"
        >
          ℹ️ About UniNest
        </Button>
      </div>
    </div>
  );
}
