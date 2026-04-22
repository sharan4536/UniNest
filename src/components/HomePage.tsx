import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { Coffee, LibraryBig, LocateFixed, Plus, Radio, SmilePlus, Sparkles, Users } from 'lucide-react';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import {
  createConversation,
  getCheckIns,
  getCurrentLocation,
  getFriendLocations,
  getPulses,
  updateUserLocation,
  type CheckIn,
  type FriendLocation,
  type Pulse,
} from '../utils/firebase/firestore';
import { PulseSheet } from './PulseSheet';
import { CheckInSheet } from './CheckInSheet';
import { WhosAroundPanel } from './WhosAroundPanel';

type HomePageProps = {
  currentUser?: {
    name?: string;
    displayName?: string;
    location?: { name?: string } | null;
  };
  onOpenProfile?: (user: any) => void;
  onNavigate?: (page: string) => void;
};

type FriendMarker = {
  id: string;
  name: string;
  vibe: string;
  image: string;
  accent: string;
  lat: number;
  lng: number;
};

const friendMarkers: FriendMarker[] = [
  {
    id: 'marcus',
    name: 'Marcus',
    vibe: 'Studying',
    image:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    accent: 'ring-sky-400/60',
    lat: 12.9715,
    lng: 79.1586,
  },
  {
    id: 'elena',
    name: 'Elena',
    vibe: 'At Library',
    image:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    accent: 'ring-cyan-400/60',
    lat: 12.9731,
    lng: 79.1623,
  },
  {
    id: 'jordan',
    name: 'Jordan',
    vibe: 'Coffee Run',
    image:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80',
    accent: 'ring-sky-300/70',
    lat: 12.9679,
    lng: 79.1645,
  },
];

const nearbyEvents = [
  {
    title: 'Study Mixer',
    subtitle: 'Central Park • 2m ago',
    icon: Coffee,
    iconClass: 'bg-indigo-100 text-indigo-700',
  },
  {
    title: 'Stacks Sprint',
    subtitle: 'Main Library • Live',
    icon: LibraryBig,
    iconClass: 'bg-sky-100 text-sky-700',
  },
];

export function HomePage({ currentUser, onOpenProfile, onNavigate }: HomePageProps) {
  const [mapCenter, setMapCenter] = useState({ lat: 12.969728, lng: 79.160694 });
  const [mapLabel, setMapLabel] = useState(currentUser?.location?.name || 'VIT Campus');
  const [liveFriendLocations, setLiveFriendLocations] = useState<FriendLocation[]>([]);

  const firstName =
    currentUser?.name?.split(' ')[0] ||
    currentUser?.displayName?.split(' ')[0] ||
    'You';

  useEffect(() => {
    const loadMap = async () => {
      try {
        const position = await getCurrentLocation();
        setMapCenter(position);
        setMapLabel('Your current location');

        if (isFirebaseConfigured && auth.currentUser?.emailVerified) {
          await updateUserLocation({
            lat: position.lat,
            lng: position.lng,
            name: 'Current Location',
          });
        }
      } catch {
        setMapLabel(currentUser?.location?.name || 'VIT Campus');
      }
    };

    loadMap();
  }, [currentUser?.location?.name]);

  useEffect(() => {
    if (!(isFirebaseConfigured && auth.currentUser?.emailVerified)) return;
    const unsubscribe = getFriendLocations((locations) => {
      setLiveFriendLocations(locations.slice(0, 3));
    });
    return () => unsubscribe();
  }, []);

  // ---- FEATURE 1: Pulses + FEATURE 5: Check-ins ----------------------------
  const [pulseSheetOpen, setPulseSheetOpen] = useState(false);
  const [checkinSheetOpen, setCheckinSheetOpen] = useState(false);
  const [whosAroundOpen, setWhosAroundOpen] = useState(false);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);

  useEffect(() => {
    if (!(isFirebaseConfigured && auth.currentUser?.emailVerified)) return;
    const unsubP = getPulses((list) => setPulses(list));
    const unsubC = getCheckIns((list) => setCheckins(list));
    return () => { unsubP && unsubP(); unsubC && unsubC(); };
  }, []);

  const myUid = auth.currentUser?.uid;
  const otherPulses = useMemo(() => pulses.filter((p) => p.createdBy !== myUid), [pulses, myUid]);

  const openDmWithUser = async (otherUid: string) => {
    try {
      await createConversation(otherUid);
    } catch (e) {
      console.error('DM open failed', e);
    }
    onNavigate?.('messages');
  };

  // Map a check-in's free-text location to coordinates relative to mapCenter
  // so friends' check-ins appear as pins scattered around the current view.
  const locationOffsets: Record<string, { dLat: number; dLng: number }> = {
    'Canteen': { dLat: 0.0005, dLng: 0.0005 },
    'Library': { dLat: 0.0010, dLng: -0.0008 },
    'Common Room': { dLat: -0.0005, dLng: 0.0010 },
    'Sports Ground': { dLat: -0.0012, dLng: -0.0012 },
    'Academic Block': { dLat: 0.0003, dLng: -0.0015 },
  };
  const checkinPins = useMemo(() => (
    checkins
      .filter((c) => c.createdBy !== myUid)
      .map((c) => {
        const off = locationOffsets[c.location] || { dLat: 0, dLng: 0 };
        return {
          id: c.id || c.createdBy,
          uid: c.createdBy,
          location: c.location,
          lat: mapCenter.lat + off.dLat,
          lng: mapCenter.lng + off.dLng,
        };
      })
  ), [checkins, mapCenter, myUid]);

  const visibleMarkers = liveFriendLocations.length
    ? liveFriendLocations.map((friend, index) => ({
        id: friend.uid,
        name: friend.displayName || 'Friend',
        vibe: friend.location?.name || 'On campus',
        image: friend.photoURL || friendMarkers[index % friendMarkers.length].image,
        accent: friendMarkers[index % friendMarkers.length].accent,
        lat: friend.location?.lat ?? friendMarkers[index % friendMarkers.length].lat,
        lng: friend.location?.lng ?? friendMarkers[index % friendMarkers.length].lng,
      }))
    : friendMarkers;

  const markerData = useMemo(
    () =>
      visibleMarkers.map((friend) => ({
        ...friend,
        icon: createAvatarIcon(friend.image, friend.accent),
      })),
    [visibleMarkers]
  );

  return (
    <div className="campus-pulse-shell relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.75),_rgba(241,247,251,0.2)_35%,_rgba(9,15,18,0.12)_100%)] text-slate-900">
      <div className="absolute inset-0 isolate z-0">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={16}
          zoomControl={false}
          touchZoom={true}
          doubleClickZoom={true}
          dragging={true}
          tap={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewport center={mapCenter} markers={markerData} />
          <CircleMarker
            center={[mapCenter.lat, mapCenter.lng]}
            radius={10}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: '#0ea5e9',
              fillOpacity: 1,
            }}
          />
          {markerData.map((friend) => (
            <Marker
              key={friend.id}
              position={[friend.lat, friend.lng]}
              icon={friend.icon}
              eventHandlers={{
                click: () => onOpenProfile?.({ name: friend.name, bio: friend.vibe, photoURL: friend.image }),
              }}
            />
          ))}
          {/* FEATURE 5 — Friend check-in pins */}
          {checkinPins.map((pin) => (
            <Marker
              key={`checkin-${pin.id}`}
              position={[pin.lat, pin.lng]}
              icon={createCheckinIcon(pin.location)}
              eventHandlers={{
                click: () => openDmWithUser(pin.uid),
              }}
            />
          ))}
        </MapContainer>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(246,251,255,0.64)_0%,rgba(241,247,251,0.06)_38%,rgba(241,247,251,0.58)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,183,242,0.22),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(167,169,255,0.2),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.85),transparent_38%)]" />
      </div>

      <header className="absolute inset-x-0 top-0 z-[1000] px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate?.('profile')}
            className="flex items-center gap-3 rounded-full border border-white/60 bg-white/72 px-2 py-2 shadow-[0_18px_45px_rgba(41,48,51,0.12)] backdrop-blur-xl transition hover:scale-[0.99]"
          >
            <span className="campus-live-ring flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-cyan-300 text-sm font-bold text-white">
              {firstName.charAt(0)}
            </span>
            <span className="hidden pr-3 text-left sm:block">
              <span className="block text-xs font-semibold uppercase tracking-[0.24em] text-sky-600/80">
                UniNest
              </span>
              <span className="block text-sm font-semibold text-slate-800">{firstName}'s pulse</span>
            </span>
          </button>

          <button
            type="button"
            className="campus-vibe-pill inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-sky-700 shadow-[0_16px_40px_rgba(0,98,134,0.12)] transition hover:scale-[0.99]"
          >
            <SmilePlus className="h-4 w-4" />
            Set Vibe
          </button>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/75 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_12px_30px_rgba(41,48,51,0.08)] backdrop-blur-xl">
          <LocateFixed className="h-3.5 w-3.5 text-sky-600" />
          {mapLabel}
        </div>

        {/* FEATURE 1 — Active friend pulses (horizontal pill strip) */}
        {otherPulses.length > 0 && (
          <div className="mt-3 -mx-1 flex items-center gap-2 overflow-x-auto pb-1" data-testid="pulse-strip">
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 backdrop-blur-xl">
              <Radio className="h-3 w-3 animate-pulse" /> Live
            </span>
            {otherPulses.slice(0, 12).map((p) => (
              <button
                key={p.id || p.createdBy}
                type="button"
                onClick={() => openDmWithUser(p.createdBy)}
                className="shrink-0 max-w-[240px] truncate rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_rgba(41,48,51,0.08)] backdrop-blur-xl transition hover:bg-white"
                data-testid={`pulse-pill-${p.createdBy}`}
                title={p.text}
              >
                <Sparkles className="mr-1 inline h-3 w-3 text-sky-500" />
                {p.text}
              </button>
            ))}
          </div>
        )}
      </header>

      <aside className="absolute left-4 top-24 z-[999] hidden w-72 space-y-4 xl:block">
        <section className="campus-glass-card rounded-[28px] p-4">
          <p className="text-sm font-bold text-slate-900">Nearby Events</p>
          <div className="mt-4 space-y-3">
            {nearbyEvents.map((event) => {
              const Icon = event.icon;
              return (
                <div key={event.title} className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${event.iconClass}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{event.title}</p>
                    <p className="text-[11px] text-slate-500">{event.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="campus-glass-card flex items-center justify-between rounded-[24px] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">142 online</span>
          </div>
          <Users className="h-4 w-4 text-sky-500" />
        </section>
      </aside>

      <div className="absolute inset-x-0 bottom-32 z-[999] px-4 sm:px-6 xl:hidden">
        <div className="campus-glass-card mx-auto max-w-md rounded-[28px] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Campus is buzzing</p>
              <p className="mt-1 text-xs text-slate-500">142 online, 2 live events nearby</p>
            </div>
            <button
              type="button"
              onClick={() => setWhosAroundOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-200"
              data-testid="whos-around-trigger"
            >
              <Users className="h-3.5 w-3.5" />
              Who's around
            </button>
          </div>
        </div>
      </div>

      {/* FEATURES 1 + 5 — Floating action stack (bottom-right) */}
      <div className="absolute bottom-36 right-4 z-[1000] flex flex-col items-end gap-3 xl:bottom-8">
        <button
          type="button"
          onClick={() => setCheckinSheetOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 py-2.5 text-sm font-bold text-sky-700 shadow-[0_18px_40px_rgba(14,165,233,0.25)] backdrop-blur-xl transition hover:scale-[0.98]"
          data-testid="checkin-fab"
        >
          <LocateFixed className="h-4 w-4" />
          Check In
        </button>
        <button
          type="button"
          onClick={() => setPulseSheetOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 px-5 py-3 text-sm font-extrabold text-white shadow-[0_24px_50px_rgba(14,165,233,0.45)] transition hover:scale-[0.97]"
          data-testid="pulse-fab"
        >
          <Plus className="h-4 w-4" />
          Pulse
        </button>
      </div>

      {/* Sheets */}
      <PulseSheet open={pulseSheetOpen} onOpenChange={setPulseSheetOpen} />
      <CheckInSheet open={checkinSheetOpen} onOpenChange={setCheckinSheetOpen} />
      <WhosAroundPanel open={whosAroundOpen} onOpenChange={setWhosAroundOpen} />

    </div>
  );
}

function MapViewport({
  center,
  markers,
}: {
  center: { lat: number; lng: number };
  markers: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!markers.length) {
      map.setView([center.lat, center.lng], 16, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(
      markers.map((marker) => [marker.lat, marker.lng] as [number, number]).concat([[center.lat, center.lng]])
    );
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
  }, [center.lat, center.lng, map, markers]);

  return null;
}

function createAvatarIcon(image: string, accent: string) {
  const ringColor =
    accent.includes('cyan') ? 'rgba(34, 211, 238, 0.7)' :
    accent.includes('300') ? 'rgba(125, 211, 252, 0.8)' :
    'rgba(56, 189, 248, 0.8)';

  return L.divIcon({
    className: 'campus-map-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-10px);">
        <div style="width:48px;height:48px;border-radius:9999px;overflow:hidden;border:2px solid white;box-shadow:0 16px 40px rgba(0,84,127,0.18);box-shadow:0 0 0 2px ${ringColor};background:white;">
          <img src="${image}" alt="" style="width:100%;height:100%;object-fit:cover;" />
        </div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

function createCheckinIcon(location: string) {
  const initial = (location || '•').charAt(0).toUpperCase();
  return L.divIcon({
    className: 'campus-checkin-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
        <div style="display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:9999px;background:white;border:1px solid rgba(125,211,252,0.7);box-shadow:0 10px 24px rgba(14,165,233,0.25);">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;background:#0ea5e9;color:white;font-size:10px;font-weight:700;">${initial}</span>
          <span style="font-size:10px;font-weight:700;color:#0369a1;white-space:nowrap;">${location}</span>
        </div>
      </div>
    `,
    iconSize: [120, 28],
    iconAnchor: [60, 14],
  });
}
