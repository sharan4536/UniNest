import React, { useState, useEffect, useCallback } from 'react';

// ==============================================
// 1. DATA MOCKS & TYPES
// ==============================================

type TabId = 'overview' | 'clubs' | 'spots' | 'events';

type Club = { id: string; name: string; members: number; category: string; visible: boolean; lastUpdated: string };
type Spot = { id: string; name: string; isOpen: boolean; note: string; lastUpdated: string };
type EventInfo = { id: string; title: string; club: string; date: string; time: string; rsvps: number };
type ToastMessage = { id: string; message: string };

const INITIAL_CLUBS: Club[] = [
  { id: 'c1', name: 'Robotics Society', members: 142, category: 'Technical', visible: true, lastUpdated: '2 hours ago' },
  { id: 'c2', name: 'Debate Club', members: 89, category: 'Cultural', visible: true, lastUpdated: '1 day ago' },
  { id: 'c3', name: 'Dance Squad', members: 210, category: 'Arts', visible: false, lastUpdated: '3 days ago' },
  { id: 'c4', name: 'Basketball Team', members: 45, category: 'Sports', visible: true, lastUpdated: '5 hours ago' },
];

const INITIAL_SPOTS: Spot[] = [
  { id: 's1', name: 'Main Canteen', isOpen: true, note: 'Today’s special: Rajma Chawal ₹60', lastUpdated: '10 mins ago' },
  { id: 's2', name: 'Central Library', isOpen: true, note: 'Extended hours till 10 PM', lastUpdated: '1 hour ago' },
  { id: 's3', name: 'Block B Café', isOpen: false, note: 'Closed for maintenance', lastUpdated: '2 days ago' },
  { id: 's4', name: 'Sports Ground', isOpen: true, note: 'Running tracks open', lastUpdated: '5 hours ago' },
];

const INITIAL_EVENTS: EventInfo[] = [
  { id: 'e1', title: 'Tech Symposium 24', club: 'Robotics Society', date: 'Oct 24', time: '10:00 AM', rsvps: 340 },
  { id: 'e2', title: 'Inter-College Debate', club: 'Debate Club', date: 'Oct 26', time: '2:00 PM', rsvps: 120 },
];

// ==============================================
// 2. UTILITY HOOKS & HELPERS
// ==============================================

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  return prefersReducedMotion;
};

// ==============================================
// 3. UI COMPONENTS
// ==============================================

// Button
const AdminButton = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '' 
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'ghost',
  className?: string
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const isReduced = usePrefersReducedMotion();

  let baseColor = 'bg-[#4FC3F7] text-[#0e0e18] hover:bg-[#7ce0ff]';
  if (variant === 'secondary') baseColor = 'bg-[#1e1e2e] text-white hover:bg-[#2a2a3c] border border-[#2a2a3c]';
  if (variant === 'ghost') baseColor = 'bg-transparent text-slate-400 hover:text-white hover:bg-white/5';

  return (
    <button
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${baseColor} ${className}`}
      style={{
        transform: isPressed && !isReduced ? 'scale(0.97)' : 'scale(1)',
        transition: isReduced ? 'background-color 150ms ease, opacity 150ms ease' : 'transform 80ms ease, background-color 120ms ease'
      }}
    >
      {children}
    </button>
  );
};

// Toggle
const SpringToggle = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => {
  const isReduced = usePrefersReducedMotion();
  const trackTransition = isReduced ? 'background-color 150ms ease' : 'background-color 180ms ease';
  const thumbTransition = isReduced ? 'transform 150ms ease' : 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)';

  return (
    <div 
      className={`w-11 h-6 rounded-full cursor-pointer relative flex items-center p-0.5 ${checked ? 'bg-[#4FC3F7]' : 'bg-[#2a2a3c]'}`}
      style={{ transition: trackTransition }}
      onClick={onChange}
    >
      <div 
        className="w-5 h-5 bg-white rounded-full shadow-sm"
        style={{ 
          transition: thumbTransition,
          transform: checked ? 'translateX(20px)' : 'translateX(0)' 
        }}
      />
    </div>
  );
};

// Modal
const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  subtitle = "You can always change this later",
  children 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  title: string, 
  subtitle?: string,
  children: React.ReactNode 
}) => {
  const isReduced = usePrefersReducedMotion();
  const [render, setRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setRender(true);
  }, [isOpen]);

  const handleAnimationEnd = () => {
    if (!isOpen) setRender(false);
  };

  if (!render) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      onTransitionEnd={handleAnimationEnd}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 pointer-events-auto"
        onClick={onClose}
        style={{
          opacity: isOpen ? 1 : 0,
          transition: isReduced ? 'opacity 150ms ease' : 'opacity 200ms ease'
        }}
      />
      {/* Modal Body */}
      <div 
        className="bg-[#13131f] w-full max-w-md rounded-2xl border border-white/5 shadow-2xl z-10 pointer-events-auto relative overflow-hidden flex flex-col"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : (isReduced ? 'scale(1)' : 'scale(0.96)'),
          transition: isReduced ? 'opacity 150ms ease' : 'transform 240ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 240ms ease'
        }}
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            <p className="text-[#8e8e9f] text-xs mt-1">{subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors">
            ✕
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// Input
const AdminInput = ({ value, onChange, placeholder, label }: { value: string, onChange: (v: string) => void, placeholder?: string, label: string }) => {
  const [focused, setFocused] = useState(false);
  const isReduced = usePrefersReducedMotion();

  return (
    <div className="space-y-1.5 mb-4">
      <label className="text-[11px] uppercase tracking-wider text-[#8e8e9f] font-semibold">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full bg-[#1e1e2e] text-white p-3 rounded-xl focus:outline-none"
        style={{
          border: `1px solid ${focused ? '#4FC3F7' : '#2a2a3c'}`,
          transition: isReduced ? 'border-color 150ms ease' : 'border-color 150ms ease, box-shadow 150ms ease',
          boxShadow: focused && !isReduced ? '0 0 0 1px rgba(79, 195, 247, 0.2)' : 'none'
        }}
      />
    </div>
  );
};

// ==============================================
// 4. MAIN COMPONENT
// ==============================================

export const AdminPanel = () => {
  const isReduced = usePrefersReducedMotion();

  // Navigation Setup
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [transitioning, setTransitioning] = useState<TabId | null>(null);

  const handleTabChange = (tab: TabId) => {
    if (tab === activeTab) return;
    setTransitioning(tab);
    // Simple state swap for the demo. Real-world might do unmount/mount sync
    setTimeout(() => {
      setActiveTab(tab);
      setTransitioning(null);
    }, isReduced ? 150 : 220); // match fade out
  };

  // State Management
  const [clubs, setClubs] = useState<Club[]>(INITIAL_CLUBS);
  const [spots, setSpots] = useState<Spot[]>(INITIAL_SPOTS);
  const [events, setEvents] = useState<EventInfo[]>(INITIAL_EVENTS);

  // Modals
  const [spotToEdit, setSpotToEdit] = useState<Spot | null>(null);
  const [spotEditNote, setSpotEditNote] = useState('');
  
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', club: '', date: '', time: '' });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = useCallback((msg: string) => {
    const id = Date.now().toString();
    setToasts(prev => {
      // Keep max 2
      const next = [...prev, { id, message: msg }];
      return next.slice(-2);
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // Handlers
  const toggleClub = (id: string) => {
    setClubs(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  const toggleSpotStatus = (id: string) => {
    setSpots(prev => prev.map(s => {
      if (s.id === id) {
        showToast(s.isOpen ? `${s.name} marked as Closed` : `${s.name} marked as Open`);
        return { ...s, isOpen: !s.isOpen };
      }
      return s;
    }));
  };

  const saveSpotNote = () => {
    if (!spotToEdit) return;
    setSpots(prev => prev.map(s => s.id === spotToEdit.id ? { ...s, note: spotEditNote } : s));
    setSpotToEdit(null);
    showToast('Update posted to students');
  };

  const postEvent = () => {
    if (!newEvent.title) return;
    const ev: EventInfo = {
      id: Date.now().toString(),
      title: newEvent.title,
      club: newEvent.club || 'University Admin',
      date: newEvent.date || 'TBD',
      time: newEvent.time || 'TBD',
      rsvps: 0
    };
    setEvents([ev, ...events]); // latest first
    setIsEventModalOpen(false);
    setNewEvent({ title: '', club: '', date: '', time: '' });
    showToast('Event published successfully');
  };

  // Render Helpers
  const renderCardList = (items: any[], renderItem: (item: any, index: number) => React.ReactNode) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {items.map((item, i) => (
          <div 
            key={item.id}
            className="card-enter"
            style={{
              animation: isReduced ? 'fadein 150ms ease forwards' : `cardStagger 300ms ease forwards ${i * 40}ms`,
              opacity: 0,
              transform: isReduced ? 'none' : 'translateY(10px)'
            }}
          >
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  };

  // --- TAB CONTENTS ---

  const renderOverview = () => (
    <div className="space-y-8">
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#13131f] p-6 rounded-2xl border border-white/5">
            <p className="text-[#8e8e9f] text-[11px] uppercase tracking-wider font-semibold">Active Clubs</p>
            <p className="text-4xl text-white font-bold mt-2">{clubs.filter(c => c.visible).length}</p>
          </div>
          <div className="bg-[#13131f] p-6 rounded-2xl border border-white/5">
            <p className="text-[#8e8e9f] text-[11px] uppercase tracking-wider font-semibold">Open Spots</p>
            <p className="text-4xl text-white font-bold mt-2">{spots.filter(s => s.isOpen).length}</p>
          </div>
          <div className="bg-[#13131f] p-6 rounded-2xl border border-white/5">
            <p className="text-[#8e8e9f] text-[11px] uppercase tracking-wider font-semibold">Upcoming Events</p>
            <p className="text-4xl text-white font-bold mt-2">{events.length}</p>
          </div>
       </div>

       <div>
          <h3 className="text-lg font-bold text-white mb-4">Recent Network Activity</h3>
          <div className="bg-[#13131f] rounded-2xl border border-white/5 overflow-hidden">
             {[
               "Robotics Society gained 12 new members.",
               "Central Library updated their status to Open.",
               "Tech Symposium 24 reached 300 RSVPs.",
               "Dance Squad was hidden from public view."
             ].map((log, i) => (
               <div key={i} className="p-4 border-b border-white/5 last:border-b-0 flex items-center text-sm text-[#8e8e9f]">
                  <div className="w-2 h-2 bg-[#4FC3F7] rounded-full mr-3 opacity-50" />
                  {log}
               </div>
             ))}
          </div>
       </div>
    </div>
  );

  const renderClubs = () => (
    <div>
      {renderCardList(clubs, (club: Club) => (
        <div className="bg-[#13131f] p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-full">
          <div>
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-white font-bold text-lg">{club.name}</h3>
              <SpringToggle checked={club.visible} onChange={() => toggleClub(club.id)} />
            </div>
            <p className="text-sm text-[#8e8e9f]">{club.category} · {club.members} members</p>
          </div>
          <div className="mt-6 text-[11px] uppercase tracking-wider text-[#4a4a5e] font-semibold">
            Updated {club.lastUpdated}
          </div>
        </div>
      ))}
    </div>
  );

  const renderSpots = () => (
    <div>
      {renderCardList(spots, (spot: Spot) => (
        <div className="bg-[#13131f] p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-full">
          <div>
             <div className="flex justify-between items-start mb-3">
               <h3 className="text-white font-bold text-lg">{spot.name}</h3>
               <button 
                  onClick={() => toggleSpotStatus(spot.id)}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                  style={{
                    backgroundColor: spot.isOpen ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 113, 133, 0.1)',
                    color: spot.isOpen ? '#4ade80' : '#fb7185',
                    transition: isReduced ? 'background-color 150ms ease, color 150ms ease' : 'background-color 250ms ease, color 250ms ease'
                  }}
               >
                 {spot.isOpen ? 'OPEN' : 'CLOSED'}
               </button>
             </div>
             
             <div className="bg-[#1e1e2e] p-3 rounded-xl border border-white/5 relative group">
                <p className="text-sm text-white/90 leading-relaxed">{spot.note || 'No active updates.'}</p>
             </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#4a4a5e] font-semibold">
              Update {spot.lastUpdated}
            </span>
            <AdminButton 
              variant="secondary" 
              className="py-1.5 px-3 text-xs"
              onClick={() => {
                setSpotToEdit(spot);
                setSpotEditNote(spot.note);
              }}
            >
              Edit Update
            </AdminButton>
          </div>
        </div>
      ))}
    </div>
  );

  const renderEvents = () => (
    <div>
      <div className="mb-6 flex justify-end">
         <AdminButton onClick={() => setIsEventModalOpen(true)}>+ Post Event</AdminButton>
      </div>
      {renderCardList(events, (event: EventInfo) => (
        <div className="bg-[#13131f] p-5 rounded-2xl border border-white/5 flex flex-col justify-between h-full">
           <div>
              <p className="text-[11px] text-[#4FC3F7] uppercase tracking-wider font-semibold mb-1">{event.club}</p>
              <h3 className="text-white font-bold text-lg leading-tight mb-2">{event.title}</h3>
              <p className="text-sm text-[#8e8e9f] font-medium">{event.date} • {event.time}</p>
           </div>
           <div className="mt-6 flex items-center gap-2">
              <div className="flex -space-x-2">
                 {[...Array(Math.min(3, Math.ceil(event.rsvps / 10)))].map((_, idx) => (
                    <div key={idx} className="w-6 h-6 rounded-full bg-[#2a2a3c] border-2 border-[#13131f]" />
                 ))}
              </div>
              <span className="text-xs font-medium text-[#8e8e9f]">{event.rsvps} RSVPs</span>
           </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e18] text-white flex font-sans selection:bg-[#4FC3F7] selection:text-[#0e0e18]">
      
      {/* Global Styles for Keyframes */}
      <style>{`
        @keyframes cardStagger {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadein {
          to { opacity: 1; }
        }
      `}</style>

      {/* LEFT SIDEBAR */}
      <aside className="w-60 border-r border-white/5 flex flex-col fixed inset-y-0 left-0 bg-[#0e0e18] z-20">
        <div className="p-6 pb-2">
          <div className="w-10 h-10 bg-[#13131f] rounded-xl flex items-center justify-center border border-white/10 mb-4 shadow-xl">
             <span className="text-[#4FC3F7] font-bold text-lg">U</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white/90">UniNest Admin</h1>
          <p className="text-xs text-[#8e8e9f] mt-1 font-medium">Stanford University</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'clubs', label: 'Clubs & Societies' },
            { id: 'spots', label: 'Campus Spots' },
            { id: 'events', label: 'Events' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as TabId)}
                className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center"
                style={{
                  backgroundColor: isActive ? 'rgba(79, 195, 247, 0.1)' : 'transparent',
                  color: isActive ? '#4FC3F7' : '#8e8e9f',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
        
        <div className="p-6 border-t border-white/5">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
             <div>
               <p className="text-sm font-bold text-white/90">Sarah Jenks</p>
               <p className="text-[10px] text-[#8e8e9f] uppercase tracking-wider font-semibold">Lead Admin</p>
             </div>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN AREA */}
      <main className="flex-1 ml-60 min-h-screen flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-24 px-10 flex items-end pb-6 border-b border-transparent shrink-0">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {activeTab === 'overview' && 'Overview'}
            {activeTab === 'clubs' && 'Clubs & Societies'}
            {activeTab === 'spots' && 'Campus Spots'}
            {activeTab === 'events' && 'Events'}
          </h2>
        </header>

        {/* Content Area with exact Transition */}
        <div className="flex-1 px-10 py-8 relative">
          <div
            style={{
               opacity: transitioning ? 0 : 1,
               transform: transitioning ? (isReduced ? 'none' : 'translateY(6px)') : 'translateY(0)',
               transition: isReduced 
                  ? 'opacity 150ms ease' 
                  : 'opacity 220ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 220ms cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}
          >
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'clubs' && renderClubs()}
            {activeTab === 'spots' && renderSpots()}
            {activeTab === 'events' && renderEvents()}
          </div>
        </div>
      </main>

      {/* MODALS */}
      <Modal 
         isOpen={!!spotToEdit} 
         onClose={() => setSpotToEdit(null)} 
         title="Edit Live Update"
      >
        <AdminInput 
          label="Live Update Note" 
          value={spotEditNote} 
          onChange={setSpotEditNote} 
          placeholder="e.g. Extended hours till 10 PM" 
        />
        <div className="mt-8 flex justify-end gap-3 border-t border-white/5 pt-6">
          <AdminButton variant="ghost" onClick={() => setSpotToEdit(null)}>Cancel</AdminButton>
          <AdminButton onClick={saveSpotNote}>Post Update</AdminButton>
        </div>
      </Modal>

      <Modal 
         isOpen={isEventModalOpen} 
         onClose={() => setIsEventModalOpen(false)} 
         title="Publish Event"
      >
        <AdminInput label="Event Title" value={newEvent.title} onChange={v => setNewEvent({...newEvent, title: v})} placeholder="e.g. Winter Gala" />
        <AdminInput label="Organising Club" value={newEvent.club} onChange={v => setNewEvent({...newEvent, club: v})} placeholder="e.g. Student Council" />
        <div className="grid grid-cols-2 gap-4">
           <AdminInput label="Date" value={newEvent.date} onChange={v => setNewEvent({...newEvent, date: v})} placeholder="e.g. Dec 14" />
           <AdminInput label="Time" value={newEvent.time} onChange={v => setNewEvent({...newEvent, time: v})} placeholder="e.g. 7:00 PM" />
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-6">
          <AdminButton variant="ghost" onClick={() => setIsEventModalOpen(false)}>Cancel</AdminButton>
          <AdminButton onClick={postEvent}>Publish Event</AdminButton>
        </div>
      </Modal>

      {/* TOAST SYSTEM (Bottom Center) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
         {toasts.map(toast => (
            <div 
               key={toast.id}
               className="bg-[#1e1e2e]/95 backdrop-blur-md px-6 py-3 rounded-full text-sm text-white font-medium shadow-2xl border border-white/10"
               style={{
                  animation: `toastIn ${isReduced ? '150ms ease' : '220ms cubic-bezier(0.25, 0.1, 0.25, 1)'} forwards`,
                  opacity: 0,
                  transform: isReduced ? 'none' : 'translate(-50%, 8px)'
               }}
            >
               {toast.message}
            </div>
         ))}
      </div>

      <style>{`
        @keyframes toastIn {
          to { opacity: 1; transform: translate(0, 0); }
        }
      `}</style>
    </div>
  );
};
