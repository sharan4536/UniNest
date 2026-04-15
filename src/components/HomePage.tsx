import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { isFirebaseConfigured, auth } from '../utils/firebase/client';
import { getFriends, updateUserProfile, getFriendLocations, updateUserLocation, getCurrentLocation, FriendLocation, updateUserStatus, getUserStatus, getUserProfile, UserProfile, createConversation, getProfile, clearUserLocation, getEnhancedFriendProfile, getPulses, Pulse, createPulse, getCheckIns, CheckIn, createCheckIn } from '../utils/firebase/firestore';

// Types to avoid `never` inference
type LocationInfo = {
  lat?: number;
  lng?: number;
  name?: string;
};

type Friend = {
  id: string | number;
  uid?: string;
  name: string;
  displayName?: string;
  major?: string;
  location?: LocationInfo;
  photoURL?: string;
  lastActive?: any;
};

export function HomePage({ currentUser, onOpenProfile }: { currentUser?: { name?: string; displayName?: string }, onOpenProfile?: (user: any) => void }) {
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [selectedFriendProfile, setSelectedFriendProfile] = useState<UserProfile | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 12.969728, lng: 79.160694 });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendLocations, setFriendLocations] = useState<Friend[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [currentStatus, setCurrentStatus] = useState<'in class' | 'in library' | 'in ground' | 'in hostel' | 'available'>('available');
  const [currentLocationName, setCurrentLocationName] = useState<string>('Campus Library');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ghostMode, setGhostMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ghostMode') === 'on';
    } catch {
      return false;
    }
  });

  // Pulses and Check-ins State
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [pulseModalOpen, setPulseModalOpen] = useState(false);
  const [pulseText, setPulseText] = useState("");
  const [pulseDuration, setPulseDuration] = useState("30");

  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [checkinModalOpen, setCheckinModalOpen] = useState(false);
  const [checkinLocationInput, setCheckinLocationInput] = useState("Canteen");
  const [checkinNote, setCheckinNote] = useState("");

  const toggleGhostMode = async () => {
    const next = !ghostMode;
    setGhostMode(next);
    try {
      localStorage.setItem('ghostMode', next ? 'on' : 'off');
    } catch { }
    if (next) {
      await clearUserLocation();
      setLocationPermission('denied');
    } else {
      toast("You're visible again. Friends can see your location and status.");
    }
  };

  // Filter friends based on search query
  const filteredFriends = friendLocations.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (friend.major && friend.major.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handle direct message functionality
  const handleDirectMessage = async (friend: Friend) => {
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified;

    if (!isUserFullyAuthenticated) {
      // For demo purposes, show an alert
      alert(`Demo Mode: Would start a conversation with ${friend.name}\n\nTo enable real messaging, please sign in with a verified email account.`);
      return;
    }

    try {
      // Refresh auth token to ensure rules see latest verified state
      auth.currentUser && await auth.currentUser.getIdToken(true);
      // Create or get existing conversation
      const conversationId = await createConversation(friend.uid || friend.id.toString());
      if (conversationId) {
        // Navigate to messages page (you might want to implement proper navigation)
        window.location.href = '/messages';
      }
    } catch (error: any) {
      console.error('Error starting conversation:', error);

      // Handle specific Firebase permission errors
      if (error?.code === 'permission-denied' || error?.message?.includes('permissions')) {
        alert(`Authentication Required: To message ${friend.name}, please sign in with a verified VIT email account.\n\nThis demo shows the messaging interface, but requires proper authentication for full functionality.`);
      } else {
        alert(`Failed to start conversation with ${friend.name}. Please try again or check your connection.`);
      }
    }
  };

  // Auto-center map on user's location when page loads
  useEffect(() => {
    const centerMapOnCurrentLocation = async () => {
      try {
        const position = await getCurrentLocation();
        setMapCenter({ lat: position.lat, lng: position.lng });
        setLocationPermission('granted');
      } catch (error) {
        console.log('Location not available on page load, using default campus location');
        setLocationPermission('prompt');
      }
    };

    centerMapOnCurrentLocation();
  }, []);

  useEffect(() => {
    // Check if we have Firebase configured, authenticated user, AND user meets security requirements
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified &&
      auth.currentUser.email?.endsWith('@vitstudent.ac.in');

    if (isUserFullyAuthenticated) {
      // Subscribe to real-time friends list
      const unsubFriends = getFriends((friendsList) => {
        (async () => {
          // Convert UserProfile to Friend type, preferring profiles.name
          const mappedFriends = await Promise.all(
            friendsList.map(async (profile) => {
              let profileDoc: any = null;
              try {
                profileDoc = await getProfile(profile.uid);
              } catch { }
              const resolvedName = (profileDoc && profileDoc.name) || profile.displayName || profile.email?.split('@')[0] || 'User';
              return {
                id: profile.uid,
                uid: profile.uid,
                name: resolvedName,
                displayName: (profileDoc && profileDoc.name) || profile.displayName,
                major: profile.major,
                photoURL: profile.photoURL,
                lastActive: profile.lastActive,
                location: profile.location
                  ? {
                    lat: profile.location.lat,
                    lng: profile.location.lng,
                    name: profile.location.name,
                  }
                  : undefined,
              } as Friend;
            })
          );

          setFriends(mappedFriends);
          setLoading(false);
        })();
      });

      // Subscribe to real-time friend locations
      const unsubLocations = getFriendLocations((locations) => {
        (async () => {
          const mappedLocations = await Promise.all(
            locations.map(async (loc) => {
              let profileDoc: any = null;
              try {
                profileDoc = await getProfile(loc.uid);
              } catch { }
              const resolvedName = (profileDoc && profileDoc.name) || loc.displayName || 'User';
              return {
                id: loc.uid,
                uid: loc.uid,
                name: resolvedName,
                displayName: loc.displayName,
                major: loc.major,
                photoURL: loc.photoURL,
                location: {
                  lat: loc.location.lat,
                  lng: loc.location.lng,
                  name: loc.location.name
                }
              };
            })
          );
          setFriendLocations(mappedLocations);
        })();
      });

      // Subscribe to real-time Pulses
      const unsubPulses = getPulses((fetchedPulses) => setPulses(fetchedPulses));
      // Subscribe to Check-Ins
      const unsubCheckins = getCheckIns((fetchedCheckIns) => setCheckins(fetchedCheckIns));

      // Update current user's location
      updateCurrentLocation();

      return () => {
        unsubFriends();
        if (typeof unsubLocations === 'function') {
          unsubLocations();
        }
        unsubPulses();
        unsubCheckins();
      };
    } else {
      // No mock fallback: keep map centering attempt and show empty lists
      updateCurrentLocation();
      setFriends([]);
      setFriendLocations([]);
      setLoading(false);
    }
  }, []);

  // Load current user status
  useEffect(() => {
    const loadUserStatus = async () => {
      const isUserFullyAuthenticated = isFirebaseConfigured &&
        auth.currentUser &&
        auth.currentUser.emailVerified &&
        auth.currentUser.email?.endsWith('@vitstudent.ac.in');

      if (isUserFullyAuthenticated) {
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

  // Removed mock friends/locations loader; all data now relies on real-time Firebase

  const updateCurrentLocation = async () => {
    // Update user's current location
    try {
      // Respect Invisible: do not record or update location
      if (ghostMode) {
        console.log('Invisible is ON. Skipping location update.');
        return;
      }
      const isUserFullyAuthenticated = isFirebaseConfigured &&
        auth.currentUser &&
        auth.currentUser.emailVerified &&
        auth.currentUser.email?.endsWith('@vitstudent.ac.in');

      if (isUserFullyAuthenticated) {
        // Try to get precise GPS location
        try {
          const position = await getCurrentLocation();
          await updateUserLocation({
            lat: position.lat,
            lng: position.lng,
            name: 'Current Location'
          });
          // Center map on user's current location
          setMapCenter({ lat: position.lat, lng: position.lng });
          setLocationPermission('granted');
        } catch (locationError) {
          console.log('GPS location not available, using default campus location');
          setLocationPermission('denied');
          // Fallback to campus center
          await updateUserLocation({
            lat: 12.969728,
            lng: 79.160694,
            name: 'Campus'
          });
          // Keep map centered on campus
          setMapCenter({ lat: 12.969728, lng: 79.160694 });
        }
      } else {
        // Supabase removed: no-op for mock mode
        // Try to get current location for map centering even in mock mode
        try {
          const position = await getCurrentLocation();
          setMapCenter({ lat: position.lat, lng: position.lng });
          setLocationPermission('granted');
        } catch (locationError) {
          console.log('GPS location not available, using default campus location');
          setLocationPermission('denied');
        }
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const position = await getCurrentLocation();
      await updateUserLocation({
        lat: position.lat,
        lng: position.lng,
        name: 'Current Location'
      });
      // Center map on user's current location
      setMapCenter({ lat: position.lat, lng: position.lng });
      setLocationPermission('granted');
    } catch (error) {
      console.error('Location permission denied:', error);
      setLocationPermission('denied');
    }
  };

  const handleStatusUpdate = async (status: 'in class' | 'in library' | 'in ground' | 'in hostel' | 'available') => {
    try {
      const isUserFullyAuthenticated = isFirebaseConfigured &&
        auth.currentUser &&
        auth.currentUser.emailVerified &&
        auth.currentUser.email?.endsWith('@vitstudent.ac.in');

      if (isUserFullyAuthenticated) {
        await updateUserStatus(status);
        setCurrentStatus(status);
        console.log('Status updated successfully');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleFriendClick = async (friend: Friend) => {
    setSelectedFriend(friend);
    setProfileDialogOpen(true);
    setLoadingProfile(true);

    try {
      if (friend.uid && isFirebaseConfigured) {
        const profile = await getUserProfile(friend.uid);
        setSelectedFriendProfile(profile);
      }
    } catch (error) {
      console.error('Error fetching friend profile:', error);
      setSelectedFriendProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Open a richer profile view if parent provided onOpenProfile; otherwise fall back to inline dialog
  const openFriendProfile = async (friend: Friend) => {
    try {
      if (onOpenProfile && friend.uid) {
        // Load enhanced data (users collection + timetable)
        const enhanced = await getEnhancedFriendProfile(friend.uid);
        // Load rich profile data (profiles collection)
        let profileDoc: any = null;
        try {
          profileDoc = await getProfile(friend.uid);
        } catch { }

        const user = {
          id: friend.uid,
          name: (profileDoc?.name || enhanced?.displayName || friend.name || 'User'),
          major: (profileDoc?.major ?? enhanced?.major),
          year: (profileDoc?.year ?? enhanced?.year),
          university: (profileDoc?.university ?? enhanced?.university),
          email: enhanced?.email,
          bio: (profileDoc?.bio ?? enhanced?.bio),
          interests: (profileDoc?.interests ?? enhanced?.interests),
          clubs: (profileDoc?.clubs ?? enhanced?.clubs),
          timetable: enhanced?.timetable,
          sharedCourses: enhanced?.sharedCourses,
        };
        onOpenProfile(user);
        return;
      }
    } catch (e) {
      console.warn('Failed to load enhanced profile, falling back to dialog', e);
    }
    // Fallback: open inline dialog if onOpenProfile not provided
    handleFriendClick(friend);
  };

  // Mapbox GL map view (falls back to placeholder if token or library missing)
  const MapView = () => {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
    const [styleLabel, setStyleLabel] = useState<string | null>(null);
    const [mapReady, setMapReady] = useState<boolean>(false);

    useEffect(() => {
      let attempts = 0;
      const maxAttempts = 40; // ~12s total at 300ms
      const interval = 300;

      const tryInit = () => {
        const g: any = (window as any);
        if (!mapContainerRef.current) return; // wait for container
        if (mapRef.current) return; // already initialized
        if (!g.mapboxgl) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            // eslint-disable-next-line no-console
            console.error('Mapbox GL script not available after waiting');
          } else {
            setTimeout(tryInit, interval);
          }
          return;
        }
        try {
          // Choose a style: Mapbox streets when token available, otherwise public OSM raster tiles
          const osmStyle = {
            version: 8,
            sources: {
              'osm-tiles': {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
              },
            },
            layers: [
              { id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 },
            ],
          } as any;

          g.mapboxgl.accessToken = mapboxToken || 'no-token';
          const styleOption: any = mapboxToken ? 'mapbox://styles/mapbox/streets-v12' : osmStyle;

          mapRef.current = new g.mapboxgl.Map({
            container: mapContainerRef.current,
            style: styleOption,
            center: [mapCenter.lng, mapCenter.lat],
            zoom: 15,
          });
          mapRef.current.addControl(new g.mapboxgl.NavigationControl(), 'top-right');
          mapRef.current.on('load', () => {
            try { mapRef.current.resize(); } catch { }
            setMapReady(true);
          });
          setStyleLabel(mapboxToken ? 'Using Mapbox streets style' : 'Using public OSM tiles');
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Map init failed:', e);
        }
      };

      tryInit();

      return () => {
        // remove markers
        if (markersRef.current.length) {
          markersRef.current.forEach(m => m.remove());
          markersRef.current = [];
        }
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }, [mapCenter.lat, mapCenter.lng, mapboxToken]);

    // Ensure Mapbox canvas resizes with container and window
    useEffect(() => {
      const map = mapRef.current;
      const container = mapContainerRef.current;
      if (!map || !container) return;

      const handleResize = () => {
        try { map.resize(); } catch { }
      };

      // Window resize
      window.addEventListener('resize', handleResize);

      // Container resize
      let ro: ResizeObserver | null = null;
      try {
        ro = new ResizeObserver(() => handleResize());
        ro.observe(container);
      } catch { }

      // Visibility changes (e.g., hidden -> shown)
      let io: IntersectionObserver | null = null;
      try {
        io = new IntersectionObserver((entries) => {
          entries.forEach((e) => { if (e.isIntersecting) handleResize(); });
        });
        io.observe(container);
      } catch { }

      // Retry until the container has non-zero dimensions
      let attempts = 0;
      const maxAttempts = 20;
      const ensureDimensions = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          handleResize();
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts) setTimeout(ensureDimensions, 250);
      };
      setTimeout(ensureDimensions, 120);

      return () => {
        window.removeEventListener('resize', handleResize);
        try { ro && ro.disconnect(); } catch { }
        try { io && io.disconnect(); } catch { }
      };
    }, [styleLabel]);

    // Place friend markers whenever locations change and map is ready
    useEffect(() => {
      const g: any = (window as any);
      if (!mapRef.current || !g.mapboxgl) return;

      // clear old markers
      if (markersRef.current.length) {
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
      }

      const bounds = new g.mapboxgl.LngLatBounds();
      let hasBounds = false;

      friendLocations.forEach((friend: Friend) => {
        const lat = friend.location?.lat;
        const lng = friend.location?.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
          const name = (friend as any)?.displayName || (friend as any)?.name || 'User';
          const avatar = (friend as any)?.avatar as string | undefined;
          const placeholder = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=34d399&color=ffffff&size=64`;
          const imgUrl = avatar || placeholder;

          // Build a pin-shaped SVG with circular avatar inside
          const clipId = `clip_${Math.random().toString(36).slice(2, 9)}`;
          const wrapper = document.createElement('div');
          wrapper.style.width = '48px';
          wrapper.style.height = '56px';
          wrapper.style.transform = 'translateY(-6px)';
          wrapper.style.cursor = 'pointer';
          wrapper.title = `${(friend as any)?.displayName || friend.name} • ${friend.location?.name ?? ''}`;
          wrapper.innerHTML = `
            <svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="${clipId}">
                  <circle cx="24" cy="20" r="14" />
                </clipPath>
              </defs>
              <!-- Pin shape -->
              <path d="M24 56c0 0 18-20.4 18-32C42 10.745 33.255 2 24 2S6 10.745 6 24c0 11.6 18 32 18 32z" fill="#4285f4"/>
              <!-- Inner white circle -->
              <circle cx="24" cy="20" r="16" fill="#ffffff"/>
              <!-- Avatar image masked to circle -->
              <image href="${imgUrl}" x="10" y="6" width="28" height="28" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
            </svg>
          `;

          wrapper.addEventListener('click', () => setSelectedFriend(friend));

          const marker = new g.mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
          markersRef.current.push(marker);

          bounds.extend([lng, lat]);
          hasBounds = true;
        }
      });

      // fit to markers
      if (hasBounds) {
        try {
          mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 600 });
        } catch { /* noop */ }
      }
    }, [friendLocations]);

    return (
      <div className="w-full">
        {styleLabel && (
          <div className="mb-2 text-xs opacity-70">{styleLabel}</div>
        )}
        <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-gray-200 shadow-lg shadow-primary/5">
          <div ref={mapContainerRef} className="w-full h-full bg-gray-50" />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-4xl mb-4">🗺️</div>
                <p className="text-lg font-medium text-primary">Campus Map View</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {mapboxToken ? 'Loading map...' : 'Using public OSM tiles (no Mapbox token)'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-24 md:pb-8">
      <div className="flex justify-end w-full animate-in fade-in duration-200" style={{ animationDelay: '0.05s' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleGhostMode}
          className={`rounded-full transition-all duration-300 border ${ghostMode
            ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          {ghostMode ? '👻 Ghost Mode Active' : '👁️ Visible'}
        </Button>
      </div>

      <div className="text-center mb-8 space-y-2 animate-in fade-in duration-200" style={{ animationDelay: '0.1s' }}>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gradient">
          Welcome back, {currentUser?.name?.split(' ')[0] || currentUser?.displayName?.split(' ')[0] || 'User'}!
        </h1>
        <p className="text-lg text-slate-500 font-medium">See where your friends are hanging out on campus</p>
      </div>

      <div className="animate-in fade-in duration-200" style={{ animationDelay: '0.2s' }}>
        <Card className="glass-card border-none overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl drop-shadow-md">🗺️</span>
                <span className="text-2xl font-bold text-foreground">Campus Map</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCheckinModalOpen(true)}
                  className="rounded-full bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50"
                  disabled={ghostMode}
                >
                  📍 Check In
                </Button>
                <div className="flex items-center gap-2 bg-slate-50/50 p-1 rounded-full border border-slate-100">
                  <Select value={currentStatus} onValueChange={handleStatusUpdate}>
                    <SelectTrigger
                      className="w-full sm:w-[160px] h-9 border-none bg-transparent hover:bg-white/50 focus:ring-0 shadow-none text-slate-600 font-medium"
                      aria-label="Select your current status"
                    >
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="glass-panel border-white/50">
                      <SelectItem value="available">🟢 Available</SelectItem>
                      <SelectItem value="in class">📚 In Class</SelectItem>
                      <SelectItem value="in library">📖 In Library</SelectItem>
                      <SelectItem value="in ground">⚽ In Ground</SelectItem>
                      <SelectItem value="in hostel">🏠 In Hostel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFirebaseConfigured && (
              <div className="mb-4 flex gap-2">
                {!ghostMode && locationPermission !== 'granted' && (
                  <Button
                    onClick={requestLocationPermission}
                    size="sm"
                    variant="outline"
                    className="border-primary/50 text-primary hover:bg-primary/10"
                  >
                    📍 Share My Location
                  </Button>
                )}
                {!ghostMode && locationPermission === 'granted' && (
                  <Button
                    onClick={updateCurrentLocation}
                    size="sm"
                    className="bg-white text-sky-600 border border-sky-100 hover:bg-sky-50 shadow-sm rounded-full"
                  >
                    🔄 Update Location
                  </Button>
                )}
                {ghostMode && (
                  <Badge variant="secondary" className="h-8 items-center flex bg-destructive/20 text-destructive border border-destructive/30">
                    Invisible is ON — location hidden
                  </Badge>
                )}
              </div>
            )}
            <div className="rounded-2xl overflow-hidden ring-4 ring-slate-50/50 shadow-inner">
              <MapView />
            </div>
            {selectedFriend && (
              <div className="mt-4 p-4 rounded-2xl bg-sky-50/50 border border-sky-100 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="w-14 h-14 ring-4 ring-white shadow-md">
                      <AvatarFallback className="bg-gradient-to-br from-sky-200 to-blue-200 text-sky-700 font-bold text-xl">{(selectedFriend.name || selectedFriend.displayName || 'U').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-[3px] border-white shadow-sm"></div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{selectedFriend.name || selectedFriend.displayName}</h3>
                    <p className="text-sm text-slate-500 font-medium">{selectedFriend.location?.name || 'Unknown Location'}</p>
                  </div>
                </div>
                <Button onClick={() => openFriendProfile(selectedFriend)} className="soft-button bg-white text-sky-600 hover:text-sky-700">
                  View Profile
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connect Social Row: Pulses and Check-ins */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 animate-in fade-in duration-200" style={{ animationDelay: '0.3s' }}>
          
          {/* Active Pulses */}
          <Card className="glass-card border-none overflow-hidden h-[300px] flex flex-col">
            <CardHeader className="py-4 border-b border-white/20 bg-gradient-to-r from-orange-50 to-rose-50">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <span className="text-xl">✨</span> Friends' Pulses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto flex-1 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
              {pulses.filter(p => !ghostMode && p.createdBy !== auth.currentUser?.uid).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 p-4 text-center">
                  <span className="text-3xl mb-2 grayscale opacity-50">✨</span>
                  <p>No active pulses right now.</p>
                </div>
              ) : (
                pulses.filter(p => !ghostMode && p.createdBy !== auth.currentUser?.uid).map(pulse => {
                  const friend = friends.find(f => f.uid === pulse.createdBy) || friendLocations.find(f => f.uid === pulse.createdBy);
                  const isFriend = !!friend;
                  if (!isFriend) return null; // Show only friends' pulses for safety
                  
                  return (
                    <div key={pulse.id} className="p-3 bg-white/70 rounded-2xl border border-white/40 shadow-sm flex items-start gap-3 hover:shadow-md transition-all">
                      <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                        <AvatarFallback className="bg-orange-100 text-orange-700 font-bold">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-sm text-slate-800">{friend.name}</h4>
                          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                            {pulse.location || 'Campus'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-sm mt-1">{pulse.text}</p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="mt-2 h-7 text-xs rounded-full bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700"
                          onClick={() => handleDirectMessage(friend)}
                        >
                          Join
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Who's Around (Check-ins) */}
          <Card className="glass-card border-none overflow-hidden h-[300px] flex flex-col">
            <CardHeader className="py-4 border-b border-white/20 bg-gradient-to-r from-indigo-50 to-sky-50">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <span className="text-xl">📍</span> Who's Around
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto flex-1 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
              {checkins.filter(c => !ghostMode && c.createdBy !== auth.currentUser?.uid).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 p-4 text-center">
                  <span className="text-3xl mb-2 grayscale opacity-50">📍</span>
                  <p>No one checked in right now.</p>
                </div>
              ) : (
                checkins.filter(c => !ghostMode && c.createdBy !== auth.currentUser?.uid).map(checkin => {
                  const friend = friends.find(f => f.uid === checkin.createdBy) || friendLocations.find(f => f.uid === checkin.createdBy);
                  const isFriend = !!friend;
                  if (!isFriend) return null;
                  
                  // Compute time since checkin
                  let timeString = 'Recently';
                  if (checkin.createdAt && checkin.createdAt.toMillis) {
                    const diffMins = Math.floor((Date.now() - checkin.createdAt.toMillis()) / 60000);
                    if (diffMins < 1) timeString = 'Just now';
                    else timeString = `${diffMins}m ago`;
                  }

                  return (
                    <div key={checkin.id} className="p-3 bg-white/70 rounded-2xl border border-white/40 shadow-sm flex items-center gap-3">
                      <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h4 className="font-bold text-sm text-slate-800">{friend.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 font-medium">
                          <span className="text-indigo-500">{checkin.location}</span>
                          <span className="text-slate-300">•</span>
                          <span>{timeString}</span>
                        </div>
                        {checkin.note && <p className="text-xs text-slate-600 mt-1 italic">"{checkin.note}"</p>}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full w-8 h-8 hover:bg-sky-50 text-sky-500"
                        onClick={() => handleDirectMessage(friend)}
                      >
                         💬
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={profileDialogOpen} onOpenChange={(open: boolean) => {
          setProfileDialogOpen(open);
          if (!open) {
            setSelectedFriend(null);
            setSelectedFriendProfile(null);
          }
        }}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col glass-panel border-white/60 p-0 text-slate-800 shadow-2xl sm:rounded-3xl">
            <DialogHeader className="flex-shrink-0 p-6 border-b border-gray-100">
              <DialogTitle className="text-xl font-bold text-foreground">
                {selectedFriend?.name || selectedFriendProfile?.displayName || 'Friend Profile'}
              </DialogTitle>
            </DialogHeader>

            {loadingProfile ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Accessing student database...</p>
                </div>
              </div>
            ) : selectedFriendProfile ? (
              <div className="space-y-6 overflow-y-auto flex-1 p-6 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {/* Profile Header */}
                <div className="flex items-center gap-6 p-6 bg-white/50 rounded-xl border border-gray-100 backdrop-blur-md shadow-sm">
                  <Avatar className="w-20 h-20 border-4 border-white shadow-md">
                    <AvatarFallback className="text-2xl bg-gradient-to-br from-primary/10 to-secondary/10 text-primary">
                      {(selectedFriend?.name || selectedFriendProfile.displayName || '?').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">{selectedFriend?.name || selectedFriendProfile.displayName}</h3>
                    <p className="text-muted-foreground flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium">{selectedFriendProfile.university || 'University'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium">{selectedFriendProfile.major || 'Major'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium">{selectedFriendProfile.year || 'Year'}</span>
                    </p>
                    {selectedFriendProfile.status && (
                      <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">
                        {selectedFriendProfile.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Bio Section */}
                {selectedFriendProfile.bio && (
                  <div className="p-4 bg-white/50 rounded-xl border border-gray-100">
                    <h4 className="font-semibold mb-2 text-primary">About</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">{selectedFriendProfile.bio}</p>
                  </div>
                )}

                {/* Tabs for detailed information */}
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid grid-cols-3 w-full bg-gray-100/50 border border-gray-200">
                    <TabsTrigger value="details" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary">Details</TabsTrigger>
                    <TabsTrigger value="interests" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-secondary">Interests</TabsTrigger>
                    <TabsTrigger value="location" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-green-600">Location</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-1">
                    <div className="grid grid-cols-1 gap-2 bg-white/50 rounded-xl p-4 border border-gray-100">
                      {selectedFriendProfile.email && (
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                          <span className="text-muted-foreground font-medium">Email</span>
                          <span className="text-foreground">{selectedFriendProfile.email}</span>
                        </div>
                      )}
                      {selectedFriendProfile.university && (
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                          <span className="text-muted-foreground font-medium">University</span>
                          <span className="text-foreground">{selectedFriendProfile.university}</span>
                        </div>
                      )}
                      {selectedFriendProfile.major && (
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                          <span className="text-muted-foreground font-medium">Major</span>
                          <span className="text-foreground">{selectedFriendProfile.major}</span>
                        </div>
                      )}
                      {selectedFriendProfile.year && (
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                          <span className="text-muted-foreground font-medium">Year</span>
                          <span className="text-foreground">{selectedFriendProfile.year}</span>
                        </div>
                      )}
                      {selectedFriendProfile.lastActive && (
                        <div className="flex justify-between items-center py-3 last:border-0">
                          <span className="text-muted-foreground font-medium">Last Active</span>
                          <span className="text-foreground text-sm">
                            {selectedFriendProfile.lastActive.toDate ?
                              selectedFriendProfile.lastActive.toDate().toLocaleDateString() :
                              'Recently'
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="interests" className="mt-4">
                    {selectedFriendProfile.interests && selectedFriendProfile.interests.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedFriendProfile.interests.map((interest, i) => (
                          <Badge key={i} variant="secondary" className="px-3 py-1 bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20">
                            ⭐ {interest}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-white/10 rounded-xl">
                        <p>No interests shared</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="location" className="mt-4">
                    <div className="space-y-3">
                      {selectedFriend?.location ? (
                        <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📍</span>
                            <h4 className="font-medium text-primary">Current Location</h4>
                          </div>
                          <p className="text-foreground">{selectedFriend.location.name || 'Location shared'}</p>
                          {selectedFriend.location.lat && selectedFriend.location.lng && (
                            <p className="text-xs text-muted-foreground mt-1 font-mono">
                              Coordinates: {selectedFriend.location.lat.toFixed(4)}, {selectedFriend.location.lng.toFixed(4)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground/50 border border-dashed border-white/10 rounded-xl">
                          <p>Location not shared</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Unable to load profile information</p>
              </div>
            )}

            <div className="p-4 border-t border-white/10 flex gap-3 bg-black/20">
              <Button
                onClick={() => setProfileDialogOpen(false)}
                variant="ghost"
                className="flex-1 hover:bg-white/10"
              >
                Close
              </Button>
              <Button
                onClick={() => selectedFriend && openFriendProfile(selectedFriend)}
                className="flex-1 bg-primary hover:bg-primary/80 text-black font-bold shadow-[0_0_10px_rgba(0,240,255,0.3)] transition-all"
              >
                Start Chat
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pulse Modal */}
        <Dialog open={pulseModalOpen} onOpenChange={setPulseModalOpen}>
          <DialogContent className="sm:max-w-md glass-panel border border-white/40 rounded-[2rem] p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-rose-500">
                Create a Pulse
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">What are you doing? (Spontaneous Hangout)</label>
                <Input 
                  placeholder="e.g. Grabbing coffee, who's down?" 
                  value={pulseText}
                  onChange={(e) => setPulseText(e.target.value)}
                  className="rounded-xl border-slate-200 bg-white/50 focus:bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Duration (Auto-expires)</label>
                <Select value={pulseDuration} onValueChange={setPulseDuration}>
                  <SelectTrigger className="w-full rounded-xl bg-white/50">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Minutes</SelectItem>
                    <SelectItem value="30">30 Minutes</SelectItem>
                    <SelectItem value="60">1 Hour</SelectItem>
                    <SelectItem value="120">2 Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button variant="ghost" onClick={() => setPulseModalOpen(false)} className="rounded-xl border border-slate-200">Cancel</Button>
              <Button 
                onClick={async () => {
                  if (!pulseText.trim()) return;
                  await createPulse(pulseText, parseInt(pulseDuration));
                  setPulseModalOpen(false);
                  setPulseText("");
                }} 
                className="bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl font-bold hover:opacity-90 shadow-lg shadow-orange-200/50"
              >
                Broadcast
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Check-In Modal */}
        <Dialog open={checkinModalOpen} onOpenChange={setCheckinModalOpen}>
          <DialogContent className="sm:max-w-md glass-panel border border-white/40 rounded-[2rem] p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-sky-500">
                Location Check-In
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Where are you?</label>
                <Select value={checkinLocationInput} onValueChange={setCheckinLocationInput}>
                  <SelectTrigger className="w-full rounded-xl bg-white/50">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Canteen">🍔 Canteen</SelectItem>
                    <SelectItem value="Library">📚 Library</SelectItem>
                    <SelectItem value="Common Room">🛋️ Common Room</SelectItem>
                    <SelectItem value="Sports Ground">⚽ Sports Ground</SelectItem>
                    <SelectItem value="Academic Block">🏛️ Academic Block</SelectItem>
                    <SelectItem value="Other">📍 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {checkinLocationInput === "Other" && (
                <div className="space-y-2">
                  <Input 
                    placeholder="Enter specific location..." 
                    onChange={(e) => setCheckinLocationInput(e.target.value)}
                    className="rounded-xl border-slate-200 bg-white/50 focus:bg-white"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Note (Optional)</label>
                <Input 
                  placeholder="e.g. Studying for Finals / Eating lunch" 
                  value={checkinNote}
                  onChange={(e) => setCheckinNote(e.target.value)}
                  className="rounded-xl border-slate-200 bg-white/50 focus:bg-white"
                />
              </div>
              <p className="text-xs text-slate-500 font-medium italic">Check-ins auto-expire after 1 hour.</p>
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button variant="ghost" onClick={() => setCheckinModalOpen(false)} className="rounded-xl border border-slate-200">Cancel</Button>
              <Button 
                onClick={async () => {
                  if (!checkinLocationInput.trim()) return;
                  await createCheckIn(checkinLocationInput, checkinNote);
                  setCheckinModalOpen(false);
                  setCheckinNote("");
                }} 
                className="bg-gradient-to-r from-indigo-500 to-sky-500 text-white rounded-xl font-bold hover:opacity-90 shadow-lg shadow-indigo-200/50"
              >
                Check In
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating Pulse Button */}
        {!ghostMode && (
          <button 
            onClick={() => setPulseModalOpen(true)}
            className="fixed bottom-24 right-6 md:bottom-10 md:right-10 z-30 rounded-full px-6 h-14 bg-gradient-to-tr from-orange-500 to-rose-500 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all font-bold border-[3px] border-white text-lg group"
          >
            <span className="text-2xl mr-2 group-hover:rotate-12 transition-transform">✨</span> + Pulse
          </button>
        )}

      </div>
    </div>
  );
}
