import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { isFirebaseConfigured, auth } from '../utils/firebase/client';
import { getFriends, updateUserProfile, getFriendLocations, updateUserLocation, getCurrentLocation, FriendLocation, updateUserStatus, getUserStatus, getUserProfile, UserProfile, createConversation, getProfile, clearUserLocation, getEnhancedFriendProfile } from '../utils/firebase/firestore';

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

  const toggleGhostMode = async () => {
    const next = !ghostMode;
    setGhostMode(next);
    try {
      localStorage.setItem('ghostMode', next ? 'on' : 'off');
    } catch {}
    if (next) {
      await clearUserLocation();
      setLocationPermission('denied');
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
              } catch {}
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
              } catch {}
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

      // Update current user's location
      updateCurrentLocation();

      return () => {
        unsubFriends();
        if (typeof unsubLocations === 'function') {
          unsubLocations();
        }
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
        } catch {}

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
            try { mapRef.current.resize(); } catch {}
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
        try { map.resize(); } catch {}
      };

      // Window resize
      window.addEventListener('resize', handleResize);

      // Container resize
      let ro: ResizeObserver | null = null;
      try {
        ro = new ResizeObserver(() => handleResize());
        ro.observe(container);
      } catch {}

      // Visibility changes (e.g., hidden -> shown)
      let io: IntersectionObserver | null = null;
      try {
        io = new IntersectionObserver((entries) => {
          entries.forEach((e) => { if (e.isIntersecting) handleResize(); });
        });
        io.observe(container);
      } catch {}

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
        try { ro && ro.disconnect(); } catch {}
        try { io && io.disconnect(); } catch {}
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
        <div className="relative w-full h-[600px] rounded-lg overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full bg-[#C6ECFF]" />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-4xl mb-2">🗺️</div>
                <p className="text-sm opacity-75">Campus Map View</p>
                <p className="text-xs opacity-60">
                  {mapboxToken ? 'Loading map…' : 'Using public OSM tiles (no Mapbox token)'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl mb-2">Welcome back, {currentUser?.name || currentUser?.displayName || 'User'}!</h1>
        <p className="opacity-75">See where your friends are hanging out on campus</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🗺️</span>
              Campus Map
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Select value={currentStatus} onValueChange={handleStatusUpdate}>
                <SelectTrigger 
                  className="w-full sm:w-[160px] h-10 bg-white border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  aria-label="Select your current status"
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">🟢 Available</SelectItem>
                  <SelectItem value="in class">📚 In Class</SelectItem>
                  <SelectItem value="in library">📖 In Library</SelectItem>
                  <SelectItem value="in ground">⚽ In Ground</SelectItem>
                  <SelectItem value="in hostel">🏠 In Hostel</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap" aria-live="polite">
                <span className="text-xs opacity-70">Invisible</span>
                <Button
                  variant={ghostMode ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleGhostMode}
                  aria-pressed={ghostMode}
                  aria-label={ghostMode ? 'Turn Invisible off' : 'Turn Invisible on'}
                >
                  {ghostMode ? 'On' : 'Off'}
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isFirebaseConfigured && (
            <div className="mb-2 flex gap-2">
              {!ghostMode && locationPermission !== 'granted' && (
                <Button
                  onClick={requestLocationPermission}
                  size="sm"
                  variant="outline"
                >
                  📍 Share My Location
                </Button>
              )}
              {!ghostMode && locationPermission === 'granted' && (
                <Button
                  onClick={updateCurrentLocation}
                  size="sm"
                  variant="outline"
                >
                  🔄 Update Location
                </Button>
              )}
              {ghostMode && (
                <Badge variant="secondary" className="h-8 items-center flex">Invisible is ON — location hidden</Badge>
              )}
            </div>
          )}
          <MapView />
          {selectedFriend && (
            <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: '#C6ECFF' }}>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{(selectedFriend.name || selectedFriend.displayName || 'U').charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{selectedFriend.name || selectedFriend.displayName}</h3>
                </div>
                <Badge variant="default">
                  online
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Friend Profile Dialog */}
      {profileDialogOpen && (
        <Dialog open={profileDialogOpen} onOpenChange={(open: boolean) => {
          setProfileDialogOpen(open);
          if (!open) {
            setSelectedFriend(null);
            setSelectedFriendProfile(null);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>
                {selectedFriend?.name || selectedFriendProfile?.displayName || 'Friend Profile'}
              </DialogTitle>
            </DialogHeader>
            
            {loadingProfile ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading profile...</p>
                </div>
              </div>
            ) : selectedFriendProfile ? (
              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                {/* Profile Header */}
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="text-xl">
                      {(selectedFriend?.name || selectedFriendProfile.displayName || '?').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{selectedFriend?.name || selectedFriendProfile.displayName}</h3>
                    <p className="text-gray-600">
                      {selectedFriendProfile.university || 'University'} • {selectedFriendProfile.major || 'Major'} • {selectedFriendProfile.year || 'Year'}
                    </p>
                    {selectedFriendProfile.status && (
                      <Badge variant="secondary" className="mt-1">
                        {selectedFriendProfile.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Bio Section */}
                {selectedFriendProfile.bio && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">About</h4>
                    <p className="text-sm text-gray-700 leading-relaxed">{selectedFriendProfile.bio}</p>
                  </div>
                )}

                {/* Tabs for detailed information */}
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="interests">Interests</TabsTrigger>
                    <TabsTrigger value="location">Location</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="details" className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      {selectedFriendProfile.email && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-gray-600 font-medium">Email</span>
                          <span className="text-gray-900">{selectedFriendProfile.email}</span>
                        </div>
                      )}
                      {selectedFriendProfile.university && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-gray-600 font-medium">University</span>
                          <span className="text-gray-900">{selectedFriendProfile.university}</span>
                        </div>
                      )}
                      {selectedFriendProfile.major && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-gray-600 font-medium">Major</span>
                          <span className="text-gray-900">{selectedFriendProfile.major}</span>
                        </div>
                      )}
                      {selectedFriendProfile.year && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-gray-600 font-medium">Year</span>
                          <span className="text-gray-900">{selectedFriendProfile.year}</span>
                        </div>
                      )}
                      {selectedFriendProfile.lastActive && (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-gray-600 font-medium">Last Active</span>
                          <span className="text-gray-900 text-sm">
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
                  
                  <TabsContent value="location" className="mt-4">
                    <div className="space-y-3">
                      {selectedFriend?.location ? (
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📍</span>
                            <h4 className="font-medium">Current Location</h4>
                          </div>
                          <p className="text-gray-700">{selectedFriend.location.name || 'Location shared'}</p>
                          {selectedFriend.location.lat && selectedFriend.location.lng && (
                            <p className="text-xs text-gray-500 mt-1">
                              Coordinates: {selectedFriend.location.lat.toFixed(4)}, {selectedFriend.location.lng.toFixed(4)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>Location not shared</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Unable to load profile information</p>
              </div>
            )}
            
            <div className="pt-4 flex-shrink-0 border-t flex gap-2">
              <Button 
                onClick={() => setProfileDialogOpen(false)} 
                variant="outline" 
                className="flex-1"
              >
                Close
              </Button>
              <Button 
                className="flex-1" 
                style={{ backgroundColor: '#C6ECFF', color: '#000' }}
              >
                💬 Message
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
