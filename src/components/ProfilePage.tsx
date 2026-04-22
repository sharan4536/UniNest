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
import { PrivacySettingsPage } from './PrivacySettingsPage';

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
  const [showPrivacySettings, setShowPrivacySettings] = useState<boolean>(false);

  // Local Privacy State
  const [privacySettings, setPrivacySettings] = useState({
    ghostMode: (() => { try { return localStorage.getItem('ghostMode') === 'on'; } catch { return false; } })(),
    locationVisible: true,
    onlineStatusVisible: true,
    discoverVisible: true,
    timetableVisible: true,
  });

  // Sync ghostMode to local storage whenever it changes via privacy handling
  useEffect(() => {
    try {
      if (privacySettings.ghostMode) {
        localStorage.setItem('ghostMode', 'on');
      } else {
        localStorage.removeItem('ghostMode');
      }
    } catch (e) {}
  }, [privacySettings.ghostMode]);

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

  const handlePrivacyChange = (field: keyof typeof privacySettings, value: boolean) => {
    setPrivacySettings(prev => ({ ...prev, [field]: value }));
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
    <div className="w-full max-w-2xl mx-auto pb-28 md:pb-8 animate-in fade-in bg-slate-50 min-h-screen">
      {/* Privacy Settings Page */}
      {showPrivacySettings && (
        <div className="absolute inset-0 z-50 bg-white overflow-y-auto">
          <button
            onClick={() => setShowPrivacySettings(false)}
            className="fixed top-4 left-4 z-50 p-2 hover:bg-gray-100 rounded-full"
          >
            ←
          </button>
          <PrivacySettingsPage />
        </div>
      )}
      
      {!showPrivacySettings && (
      <>
      {/* Immersive Edge-to-Edge Header */}
      <div className="relative w-full overflow-visible mb-16 rounded-b-[2.5rem] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {/* Colorful Gradient Cover */}
        <div className="h-44 w-full bg-gradient-to-br from-sky-400 via-blue-400 to-indigo-400 rounded-b-[2.5rem] p-6 relative">
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant="ghost"
            className="absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white font-semibold hover:bg-white/30 rounded-full h-8 px-4 text-xs shadow-sm active:scale-95 transition-transform"
          >
            {isEditing ? 'Done' : 'Edit'}
          </Button>
        </div>
        
        {/* Overlapping Avatar & Info */}
        <div className="px-6 flex flex-col items-center -mt-16 pb-6 text-center space-y-3">
          <div className="relative inline-block z-10">
            <Avatar className="w-28 h-28 mx-auto shadow-xl ring-[6px] ring-white">
              {profileData.photoURL ? (
                <AvatarImage src={profileData.photoURL} alt={profileData.name || 'Profile photo'} className="object-cover" />
              ) : null}
              <AvatarFallback className="text-4xl bg-slate-100 text-sky-600 font-bold">
                {profileData.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0">
              <Button
                type="button"
                onClick={handlePickPhoto}
                size="icon"
                className="rounded-full w-9 h-9 bg-slate-100 border-2 border-white text-slate-600 hover:bg-slate-200 shadow-md active:scale-90 transition-transform"
                disabled={photoUploading}
                title="Change Photo"
              >
                {photoUploading ? '...' : '📷'}
              </Button>
            </div>
            {photoError && <p className="absolute -bottom-6 w-full text-center text-red-500 text-[11px]">{photoError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelected}
            />
          </div>

          <div className="space-y-1">
            <h2 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-none">{profileData.name}</h2>
            <div className="flex items-center justify-center gap-2 text-[14px] text-slate-500 font-medium tracking-tight">
              <span>{profileData.major}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span>{profileData.year}</span>
            </div>
          </div>

          <span className={`
            px-4 py-1.5 text-[13px] font-bold rounded-full border shadow-sm
            ${currentStatus === 'available' ? 'bg-green-50/80 text-green-700 border-green-200' :
              currentStatus === 'in class' ? 'bg-amber-50/80 text-amber-700 border-amber-200' :
                currentStatus === 'in library' ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200' :
                  currentStatus === 'in ground' ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200' :
                    'bg-slate-50/80 text-slate-700 border-slate-200'}
          `}>
            {currentStatus === 'available' ? '🟢 Available' :
              currentStatus === 'in class' ? '📚 In Class' :
                currentStatus === 'in library' ? '📖 In Library' :
                  currentStatus === 'in ground' ? '⚽ In Ground' :
                    currentStatus === 'in hostel' ? '🏠 In Hostel' : '🟢 Available'}
          </span>
        </div>
      </div>
      
      <div className="space-y-6 px-3">

      {isEditing && (
        <div className="animate-in fade-in">
          <h2 className="os-list-label">Personal Information</h2>
          <div className="os-list-group">
            <div className="os-list-row p-3">
              <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">Full Name</span>
              <Input
                id="name"
                value={profileData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="flex-1 border-none shadow-none text-right px-0 text-[15px] text-slate-900 focus-visible:ring-0"
              />
            </div>
            <div className="os-list-row p-3">
              <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">Email</span>
              <Input
                id="email"
                type="email"
                value={profileData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="flex-1 border-none shadow-none text-right px-0 text-[15px] text-slate-900 focus-visible:ring-0"
              />
            </div>
            <div className="os-list-row p-3">
              <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">University</span>
              <div className="flex-1 flex justify-end">
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
              </div>


            </div>

            <div className="os-list-row p-3">
              <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">Program</span>
              <div className="flex-1 flex justify-end">
                  <Select value={profileData.major === majorOther && majorOther !== '' ? 'OTHER' : profileData.major} onValueChange={(v: string) => handleInputChange('major', v)}>
                    <SelectTrigger className="border-none shadow-none text-[15px] focus:ring-0 text-right w-full justify-end flex-row-reverse gap-2 text-slate-900 bg-transparent">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="B.Tech Computer Science (Core)">B.Tech Computer Science (Core)</SelectItem>
                      <SelectItem value="B.Tech Computer Science (Bioinformatics)">B.Tech Computer Science (Bioinformatics)</SelectItem>
                      <SelectItem value="B.Tech Computer Science (Information Security)">B.Tech Computer Science (InfoSec)</SelectItem>
                      <SelectItem value="B.Tech Electronics & Communication">B.Tech Electronics</SelectItem>
                      <SelectItem value="B.Tech Mechanical Engineering">B.Tech Mechanical</SelectItem>
                      <SelectItem value="OTHER">Other/Specialization</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
            </div>
            {profileData.major === 'OTHER' && (
              <div className="os-list-row p-3">
                <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">Specify</span>
                <Input
                  placeholder="E.g. MSc Data Science"
                  value={majorOther}
                  onChange={(e) => setMajorOther(e.target.value)}
                  className="flex-1 border-none shadow-none text-right px-0 text-[15px] text-slate-900 focus-visible:ring-0"
                />
              </div>
            )}
            <div className="os-list-row p-3">
              <span className="w-1/3 text-[15px] font-medium text-slate-700 px-2">Year</span>
              <div className="flex-1 flex justify-end">
                <Select value={profileData.year} onValueChange={(v: string) => handleInputChange('year', v)}>
                  <SelectTrigger className="border-none shadow-none text-[15px] focus:ring-0 text-right w-full justify-end flex-row-reverse gap-2 text-slate-900 bg-transparent">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1st Year">1st Year</SelectItem>
                    <SelectItem value="2nd Year">2nd Year</SelectItem>
                    <SelectItem value="3rd Year">3rd Year</SelectItem>
                    <SelectItem value="4th Year">4th Year</SelectItem>
                    <SelectItem value="Postgraduate">Postgraduate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <h2 className="os-list-label mt-6">About & Bio</h2>
          <div className="os-list-group">
            <div className="p-3 bg-white">
              <textarea
                value={profileData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                rows={3}
                className="w-full resize-none p-2 border-0 bg-transparent text-[15px] text-slate-900 focus:outline-none placeholder:text-slate-400"
                placeholder="Write a little about yourself..."
              />
            </div>
          </div>

          <h2 className="os-list-label mt-6">Interests</h2>
          <div className="os-list-group">
            {profileData.interests.map((club, index) => (
              <div key={index} className="os-list-row p-3 h-12">
                <Input
                  value={club}
                  onChange={(e) => handleClubNameChange(index, e.target.value)}
                  className="flex-1 border-none shadow-none text-left px-2 text-[15px] text-slate-900 focus-visible:ring-0 h-full"
                />
                <Button variant="ghost" size="icon" onClick={() => handleRemoveClub(index)} className="shrink-0 text-red-500 rounded-full h-8 w-8 hover:bg-red-50">×</Button>
              </div>
            ))}
            <div className="p-2 border-t border-slate-100 bg-white cursor-pointer" onClick={handleAddClub}>
              <button className="w-full text-left px-3 py-2 text-[15px] font-medium text-sky-600 active:opacity-70 transition-opacity">
                + Add Interest
              </button>
            </div>
          </div>

          <div className="mt-8 mb-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-[16px] shadow-sm transition-all"
            >
              {saving ? 'Saving...' : 'Save Profile Settings'}
            </Button>
          </div>
        </div>
      )}

      {/* Privacy settings */}
      <div className="animate-in fade-in space-y-3">
        <h2 className="os-list-label px-2">Privacy & Visibility</h2>
        <div className="os-list-group shadow-sm">
          <div className="os-list-row bg-white px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col pr-4">
              <Label htmlFor="ghost-mode" className="text-[16px] font-semibold text-slate-800 tracking-tight">Ghost Mode</Label>
              <span className="text-[13px] text-slate-500 mt-0.5 leading-snug">Hide completely from the map and searches</span>
            </div>
            <Switch
              id="ghost-mode"
              checked={privacySettings.ghostMode}
              onCheckedChange={(checked) => handlePrivacyChange('ghostMode', checked)}
              className="data-[state=checked]:bg-emerald-500 shrink-0 shadow-sm"
            />
          </div>

          <div className="os-list-row bg-white px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col pr-4">
              <Label htmlFor="location-visibility" className="text-[16px] font-semibold text-slate-800 tracking-tight">Location Sharing</Label>
              <span className="text-[13px] text-slate-500 mt-0.5 leading-snug">Allow friends to see you on the map</span>
            </div>
            <Switch
              id="location-visibility"
              checked={privacySettings.locationVisible}
              onCheckedChange={(checked) => handlePrivacyChange('locationVisible', checked)}
              className="data-[state=checked]:bg-sky-500"
            />
          </div>

          <div className="os-list-row bg-white px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col pr-4">
              <Label htmlFor="online-status" className="text-[16px] font-semibold text-slate-800 tracking-tight">Online Status</Label>
              <span className="text-[13px] text-slate-500 mt-0.5 leading-snug">Show when you are active on UniNest</span>
            </div>
            <Switch
              id="online-status"
              checked={privacySettings.onlineStatusVisible}
              onCheckedChange={(checked) => handlePrivacyChange('onlineStatusVisible', checked)}
              className="data-[state=checked]:bg-sky-500"
            />
          </div>

          <div className="os-list-row bg-white px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col pr-4">
              <Label htmlFor="discoverability" className="text-[16px] font-semibold text-slate-800 tracking-tight">Discoverability</Label>
              <span className="text-[13px] text-slate-500 mt-0.5 leading-snug">Appear in student searches</span>
            </div>
            <Switch
              id="discoverability"
              checked={privacySettings.discoverVisible}
              onCheckedChange={(checked) => handlePrivacyChange('discoverVisible', checked)}
              className="data-[state=checked]:bg-sky-500"
            />
          </div>

          <div className="os-list-row bg-white px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col pr-4">
              <Label htmlFor="timetable-sharing" className="text-[16px] font-semibold text-slate-800 tracking-tight">Timetable Sharing</Label>
              <span className="text-[13px] text-slate-500 mt-0.5 leading-snug">Let friends compare schedules with you</span>
            </div>
            <Switch
              id="timetable-sharing"
              checked={privacySettings.timetableVisible}
              onCheckedChange={(checked) => handlePrivacyChange('timetableVisible', checked)}
              className="data-[state=checked]:bg-sky-500"
            />
          </div>
        </div>
        {isEditing && <p className="mt-2 text-[12px] font-medium text-slate-400 ms-3">Privacy settings are automatically saved when you "Save Profile" above.</p>}
      </div>

      {/* Stats Section */}
      <div className="animate-in fade-in">
        <h2 className="os-list-label">Activity Stats</h2>
        <div className="os-list-group p-4 pb-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <button
              type="button"
              onClick={() => setShowFriends((prev) => !prev)}
              aria-expanded={showFriends}
              aria-controls="friends-section"
              className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all text-center"
            >
              <div className="text-[22px] font-bold text-sky-600 leading-none mb-1">{friends.length}</div>
              <div className="text-[12px] font-medium text-slate-500">Friends</div>
            </button>
            <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 bg-slate-50 text-center">
              <div className="text-[22px] font-bold text-slate-800 leading-none mb-1">5</div>
              <div className="text-[12px] font-medium text-slate-500">Study Groups</div>
            </div>
            <button
              type="button"
              onClick={() => setShowClubs((prev) => !prev)}
              aria-expanded={showClubs}
              aria-controls="clubs-section"
              className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all text-center"
            >
              <div className="text-[22px] font-bold text-sky-600 leading-none mb-1">{Array.isArray(profileData.interests) ? profileData.interests.length : 0}</div>
              <div className="text-[12px] font-medium text-slate-500">Interests</div>
            </button>
            <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 bg-slate-50 text-center">
              <div className="text-[22px] font-bold text-slate-800 leading-none mb-1">7</div>
              <div className="text-[12px] font-medium text-slate-500">Days Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Friends List */}
      {showFriends && (
        <div id="friends-section" className="animate-in slide-in-from-top-4">
          <h2 className="os-list-label">My Friends ({friends.length})</h2>
          <div className="os-list-group">
            {friendsLoading ? (
              <div className="p-4 text-center text-slate-500 text-[14px]">Loading friends...</div>
            ) : !isFirebaseConfigured || !auth.currentUser ? (
              <div className="p-4 text-center text-slate-500 text-[14px]">Sign in with a verified VIT email to see your friends.</div>
            ) : friends.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-[14px] text-slate-500 mb-3">No friends yet.</p>
                <Button size="sm" variant="outline" className="rounded-full text-sky-600 border-sky-200 hover:bg-sky-50">Find Friends</Button>
              </div>
            ) : (
              friends.map((friend) => (
                <div key={friend.uid} className="os-list-row gap-3">
                  <Avatar className="w-10 h-10 ring-1 ring-slate-100">
                    <AvatarImage src={friend.photoURL || ''} alt={(friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'Friend')} />
                    <AvatarFallback className="bg-slate-100 text-sky-600 text-[14px] font-bold">{(friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || '?').charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <div className="font-semibold text-[15px] text-slate-900 truncate">{friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'User'}</div>
                    </div>
                    <div className="text-[13px] text-slate-500 truncate">
                      {[friend.major, friend.year].filter(Boolean).join(' • ') || 'Student'}
                    </div>
                  </div>
                  {friend.status && (
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap border border-slate-200">
                      {friend.status === 'available' ? '🟢 Available' :
                        friend.status === 'in class' ? '📚 Class' :
                          friend.status === 'in library' ? '📖 Library' :
                            friend.status === 'in ground' ? '⚽ Ground' :
                              friend.status === 'in hostel' ? '🏠 Hostel' : '🟢'}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Clubs and Chapters List */}
      {showClubs && (
        <div id="clubs-section" className="animate-in slide-in-from-top-4">
          <h2 className="os-list-label">My Interests & Clubs</h2>
          <div className="os-list-group p-4">
            {Array.isArray(profileData.interests) && profileData.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profileData.interests.map((club, index) => (
                  <span key={index} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-[13px] font-medium rounded-full border border-slate-200">
                    {club}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-slate-500 text-center">No interests added yet.</p>
            )}
          </div>
        </div>
      )}
      </div>

      {/* About Link */}
      <div className="mt-8 mb-4 text-center space-y-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowPrivacySettings(true)}
          className="block mx-auto text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors font-semibold text-[15px]"
        >
          🔒 Privacy & Visibility
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => goToAbout && goToAbout()}
          className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 transition-colors font-semibold text-[15px]"
        >
          ℹ️ About UniNest
        </Button>
      </div>
      </>
      )}
    </div>
  );
}
