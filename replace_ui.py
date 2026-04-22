import re

# 1. Update DiscoverPage.tsx
with open('src/components/DiscoverPage.tsx', 'r') as f:
    content = f.read()

# We need to replace everything from `return (` at line 632 to `  );` at line 1053.
# Wait, rather than line numbers which might drift, let's find the start of the return statement for the component.

# Let's find exactly where `return (` occurs for the main DiscoverPage component.
# It is preceded by `  const renderProfileContent = (): React.ReactNode => { ... }`
# We'll use a regex to match the return block.

split_idx = content.find("  return (\n    <div className=\"max-w-4xl mx-auto")
if split_idx == -1:
    print("Could not find the start of return in DiscoverPage")

header_code = content[:split_idx]

# Define the new return payload
new_discover_render = """  const isAuthorized = true; // Use real auth checks if needed

  return (
    <div className="bg-slate-50 font-sans text-slate-800 min-h-screen pb-32">
      {/* Top Navigation Anchor */}
      <header className="sticky top-0 w-full z-50 bg-slate-50/80 backdrop-blur-xl flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-sm">
            <Avatar className="w-full h-full">
               <AvatarFallback className="bg-sky-100 text-sky-700">{auth.currentUser?.displayName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-600 font-sans" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>Discover</h1>
        </div>
        <button className="text-slate-500 hover:bg-slate-200/50 p-2 rounded-full transition-colors duration-300">
          <Search className="w-6 h-6" />
        </button>
      </header>

      <main className="pb-8">
        {/* Search & Filters */}
        <section className="px-6 py-4 space-y-4">
          <div className="relative flex items-center bg-slate-100 rounded-2xl p-4 group focus-within:bg-slate-200 transition-colors duration-300">
            <Search className="w-5 h-5 text-slate-400 mr-3" />
            <input 
              className="bg-transparent border-none focus:ring-0 w-full text-slate-600 placeholder:text-slate-400" 
              placeholder="Search people, interests, courses..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text" 
            />
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-2 py-2">
            {['name', 'major', 'online', 'sharedCourses', 'mutualClubs'].map(sort => {
                const label = sort === 'sharedCourses' ? 'Courses' : sort === 'mutualClubs' ? 'Clubs' : sort.charAt(0).toUpperCase() + sort.slice(1);
                const isActive = sortBy === sort;
                return (
                    <button 
                        key={sort}
                        onClick={() => setSortBy(sort)}
                        className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide whitespace-nowrap shadow-sm transition-transform active:scale-95 ${isActive ? 'bg-indigo-600 text-white shadow-indigo-600/20' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    >
                        {label}
                    </button>
                )
            })}
          </div>
        </section>

        {/* SOS Section */}
        {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).length > 0 && (
          <section className="mt-4">
            <div className="px-6 mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight flex items-center gap-2" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                  Needs Help Right Now
              </h2>
              <span className="text-xs font-bold text-indigo-600 tracking-widest uppercase">Live</span>
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-4 px-6 pb-6">
              {sosAlerts.filter(s => s.createdBy !== auth.currentUser?.uid).map(sos => {
                const friend = friendsUsers.find(f => f.id === sos.createdBy);
                if (!friend) return null;
                return (
                  <div key={sos.id} className="min-w-[280px] bg-rose-50/50 p-5 rounded-[2rem] border border-rose-500/10 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-colors"></div>
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="w-10 h-10 border-2 border-white">
                        <AvatarFallback className="bg-rose-100 text-rose-700 font-bold">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm">{friend.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-rose-600 font-bold">{sos.course || 'Urgent'}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium mb-6 text-slate-800 leading-relaxed">{sos.topic}</p>
                    <button 
                      onClick={() => {
                        createConversation(friend.id).then(() => {
                           if (onMessage) onMessage();
                        });
                      }}
                      className="w-full py-3 bg-rose-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-600/20 active:scale-[0.98] transition-transform"
                    >
                      Offer Help
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Nearby Now */}
        <section className="py-4 bg-slate-100/50 mt-4">
          <div className="px-6 mb-4">
            <h2 className="text-lg font-extrabold tracking-tight" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>Nearby Now</h2>
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-6 px-6">
            {checkins.length > 0 ? (
              checkins.map(ci => {
                const friend = friendsUsers.find(f => f.id === ci.createdBy);
                if (!friend) return null;
                return (
                  <div key={ci.id} onClick={() => openPersonProfile(friend)} className="flex flex-col items-center gap-2 min-w-fit cursor-pointer group">
                    <div className="relative p-1 rounded-full border-2 border-indigo-600 group-hover:scale-105 transition-transform">
                      <Avatar className="w-16 h-16">
                        <AvatarFallback className="bg-sky-100 text-sky-700">{friend.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold w-16 truncate">{friend.name}</p>
                      <p className="text-[9px] text-slate-500 uppercase tracking-tighter w-16 truncate">{ci.location}</p>
                    </div>
                  </div>
                )
              })
            ) : (
               <div className="px-6 py-4 text-sm text-slate-500 italic">No one checked in nearby just yet!</div>
            )}
          </div>
        </section>

        {/* People You May Know */}
        <section className="mt-8 px-6">
          <h2 className="text-lg font-extrabold tracking-tight mb-6" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>People You May Know</h2>
          <div className="space-y-8">
            {sortUsers(filteredFriends).slice(0, 10).map((friend) => (
              <div key={friend.id} className="flex items-center gap-4 cursor-pointer" onClick={() => openPersonProfile(friend)}>
                <Avatar className="w-14 h-14 rounded-2xl"><AvatarFallback className="bg-indigo-100 text-indigo-700 text-lg font-bold">{friend.name.charAt(0)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate">{friend.name}</h3>
                  <p className="text-xs text-slate-500 truncate">{friend.major} • {friend.year}</p>
                  <div className="flex gap-2 mt-1">
                    {(friend.sharedCourses && friend.sharedCourses.length > 0) && (
                      <span className="text-[9px] font-bold text-indigo-600 tracking-widest uppercase">{friend.sharedCourses.length} shared</span>
                    )}
                    {getMutualClubs(friend).length > 0 && (
                      <span className="text-[9px] font-bold text-violet-600 tracking-widest uppercase truncate max-w-[120px]">{getMutualClubs(friend)[0]}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {acceptedFriendIds.has(friend.id) ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); createConversation(friend.id); if (onMessage) onMessage(); }}
                      className="w-10 h-10 flex items-center justify-center bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-200 transition-all duration-300"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  ) : sentRequests.has(friend.id) ? (
                    <button disabled className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-full">
                      ✓
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleSendRequest(friend.id); }}
                      className="w-10 h-10 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-600 hover:text-white transition-all duration-300"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What's Happening */}
        <section className="mt-12">
          <div className="px-6 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>What's Happening</h2>
              <Tuning className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex overflow-x-auto no-scrollbar gap-2 -mx-6 px-6">
              {VIBE_CATEGORIES.map(vibe => (
                <button
                  key={vibe}
                  onClick={() => setSelectedVibe(vibe)}
                  className={`px-4 py-1.5 font-bold text-[10px] uppercase tracking-widest rounded-full transition-colors whitespace-nowrap ${selectedVibe === vibe ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                  {vibe === 'All' ? 'All Vibes' : vibe}
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Event Feed */}
          <div className="space-y-4">
            {(() => {
                 const filteredEvs = selectedVibe === 'All' 
                   ? events 
                   : events.filter(e => e.vibeTags?.includes(selectedVibe));
                 return filteredEvs.length > 0 ? (
                    filteredEvs.map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          userTimetable={myTimetable}
                          onFindBuddy={(evt) => {
                            setSelectedEventForBuddy(evt);
                            setShowBuddyModal(true);
                          }}
                          onOpenChat={(evt) => {
                            setSelectedEventForChat(evt);
                            setShowChatModal(true);
                          }}
                        />
                    ))
                 ) : (
                    <div className="text-center py-12 bg-slate-50 mt-2 mx-6 rounded-3xl border border-slate-100/50">
                      <span className="text-3xl opacity-50 mb-3 block">👻</span>
                      <p className="text-slate-500 font-semibold text-[14px]">No {selectedVibe.toLowerCase()} events coming up.</p>
                    </div>
                 );
            })()}
          </div>
        </section>
      </main>

      {/* FAB for Create Event */}
      {isAuthorized && (
        <button 
          onClick={() => setShowCreateEventModal(true)}
          className="fixed bottom-24 right-6 w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-400 text-white rounded-full shadow-[0_8px_24px_rgba(79,70,229,0.4)] flex items-center justify-center z-[60] active:scale-90 transition-transform duration-200"
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      {/* Modals directly migrated from old code */}
      {selectedUser && (
        <Dialog open={!!selectedUser} onOpenChange={(open: boolean) => { if (!open) { setSelectedUser(null); setEnhancedProfile(null); } }}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col glass-panel border-white/60 p-0 text-slate-800 shadow-2xl sm:rounded-3xl">
            <DialogHeader className="flex-shrink-0 p-6 border-b border-gray-100/50">
              <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600">{(selectedUser as SuggestedUser)?.name}</DialogTitle>
            </DialogHeader>
            {loadingProfile ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-400 font-medium">Loading profile details...</p>
                </div>
              </div>
            ) : (
              renderProfileContent()
            )}
            <div className="p-4 border-t border-white/10 flex bg-white/40 backdrop-blur-md">
              <Button
                onClick={() => setSelectedUser(null)}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold shadow-md shadow-sky-200/50"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showBuddyModal} onOpenChange={setShowBuddyModal}>
        <DialogContent className="max-w-md glass-panel border-white/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">
              Find a Buddy for {selectedEventForBuddy?.title}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              These friends are also interested or going!
            </p>
          </DialogHeader>

          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto">
            {buddyMatches.length > 0 ? (
              buddyMatches.map(({ user, status, isGoingAlone }) => (
                <div key={user.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/50 border border-white/60 shadow-sm hover:shadow-md transition-all">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-sky-100 text-sky-600 font-bold">{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800">{user.name}</h4>
                    <div className="flex gap-2 text-xs mt-1">
                      <span className={status === 'attending' ? 'px-2 py-0.5 rounded-full bg-green-100 text-green-700' : 'px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'}>
                        {status === 'attending' ? 'Going' : 'Interested'}
                      </span>
                      {isGoingAlone && (
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          Going Alone 🥺
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" className="rounded-full bg-sky-500 hover:bg-sky-600" onClick={() => {
                    setShowBuddyModal(false);
                    openPersonProfile(user);
                  }}>
                    Connect
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🦗</div>
                <p className="text-slate-500">No friends found for this event yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showChatModal} onOpenChange={setShowChatModal}>
        <DialogContent className="max-w-md glass-panel border-white/60 p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-slate-100/50 bg-white/40 backdrop-blur-md">
            <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
              💬 {selectedEventForChat?.title} <span className="text-xs font-normal text-slate-500">Chat</span>
            </DialogTitle>
          </DialogHeader>
          {selectedEventForChat && (
            <EventChat
              eventId={selectedEventForChat.id}
              eventTitle={selectedEventForChat.title}
              onClose={() => setShowChatModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateEventModal} onOpenChange={setShowCreateEventModal}>
        <DialogContent className="glass-panel border-white/50 p-6 rounded-3xl max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-800">Create Campus Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Event Title</label>
              <Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g. Midnight Hackathon" className="bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
              <Input value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="What's happening?" className="bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Location</label>
              <Input value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} placeholder="e.g. Student Center" className="bg-slate-50 border-slate-200" />
            </div>
            <Button 
              className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-lg mt-2"
              onClick={async () => {
                if (!newEvent.title) return;
                const start = new Date();
                start.setHours(start.getHours() + 2);
                const end = new Date(start);
                end.setHours(end.getHours() + 2);
                const { Timestamp } = await import('firebase/firestore');
                await createCampusEvent({
                  title: newEvent.title,
                  description: newEvent.description,
                  location: newEvent.location,
                  vibeTags: newEvent.vibeTags,
                  crowdSize: newEvent.crowdSize,
                  buddyMatchingEnabled: newEvent.buddyMatchingEnabled,
                  collegeId: "VIT",
                  clubName: "Student Organized",
                  clubId: "student_1",
                  startTime: Timestamp.fromDate(start),
                  endTime: Timestamp.fromDate(end),
                  tags: ["Social"],
                });
                const evs = await getUpcomingEvents();
                setEvents(evs);
                setShowCreateEventModal(false);
                setNewEvent({ title: '', description: '', location: '', vibeTags: [], crowdSize: 'Medium', buddyMatchingEnabled: true });
              }}
            >
              Publish Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"""

with open('src/components/DiscoverPage.tsx', 'w') as f:
    f.write(header_code + new_discover_render)

print("DiscoverPage.tsx replaced successfully.")

# 2. Update EventCard.tsx
with open('src/components/EventCard.tsx', 'r') as f:
    event_card_content = f.read()

# We'll replace the render block of EventCard as well.
# Note that we require `import { MessageCircle, Share2, MapPin } from 'lucide-react'` inside EventCard if it exists, or just we use emojis to simplify.
ec_split = event_card_content.find("  return (\n        <Card")
if ec_split == -1:
    ec_split = event_card_content.find("    return (\n        <Card")

ec_header = event_card_content[:ec_split]

ec_new_render = """    return (
        <div className="relative aspect-[4/5] w-full overflow-hidden group cursor-pointer border-b border-white mb-1 rounded-none shadow-sm">
            {/* Fallback image if none attached to event */}
            <img 
              src={event.tags?.includes('Music') ? "https://images.unsplash.com/photo-1540039155733-d730a53bf30c?auto=format&fit=crop&q=80&w=800" : 
                   event.vibeTags?.includes('Study') ? "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=800" :
                   event.vibeTags?.includes('Chill') ? "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&q=80&w=800" :
                   "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&q=80&w=800"} 
              alt={event.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/30 via-transparent to-transparent" />
            
            <div className="absolute bottom-0 left-0 right-0 p-8 space-y-4">
                <div className="flex gap-2 font-sans">
                    {event.vibeTags && event.vibeTags.map(tag => (
                        <span key={tag} className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-bold uppercase tracking-widest text-white">
                            {tag}
                        </span>
                    ))}
                    {isFree && (
                       <span className="px-3 py-1 bg-emerald-500/80 backdrop-blur-md rounded-full text-[9px] font-bold uppercase tracking-widest text-white">
                            You're Free
                        </span>
                    )}
                </div>
                <h3 className="text-3xl font-extrabold text-white leading-tight font-sans" style={{fontFamily: "'Plus Jakarta Sans', sans-serif"}}>
                    {event.title}
                </h3>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/80">
                        <span className="text-lg">📍</span>
                        <span className="text-xs font-medium">{event.location} • {formatTime(event.startTime)}</span>
                    </div>
                    {/* Buddy Matching display inside card */}
                    <div className="flex items-center -space-x-3 cursor-pointer hover:scale-105 transition-transform" onClick={(e) => {e.stopPropagation(); onFindBuddy(event);}}>
                        {attendees.filter(a => a.isGoingAlone && a.status === 'attending').slice(0, 3).map((att, i) => (
                           <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 overflow-hidden">
                               <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${att.userId}`} className="w-full h-full object-cover"/>
                           </div>
                        ))}
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                            +{event.stats.attending}
                        </div>
                    </div>
                </div>
            </div>

            {/* Interaction Icons overlaying right side */}
            <div className="absolute top-8 right-6 flex flex-col gap-4">
                <button 
                  onClick={(e) => {e.stopPropagation(); handleStatusChange(attendingStatus === 'attending' ? 'none' : 'attending');}}
                  className={`w-12 h-12 rounded-full backdrop-blur-xl flex items-center justify-center border transition-colors ${attendingStatus === 'attending' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                >
                    <span className="text-xl">★</span>
                </button>
                <button 
                  onClick={(e) => {e.stopPropagation(); onOpenChat(event);}}
                  className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                    <span className="text-xl">💬</span>
                </button>
            </div>
        </div>
    );
}
"""

with open('src/components/EventCard.tsx', 'w') as f:
    f.write(ec_header + ec_new_render)

print("EventCard.tsx replaced successfully.")

