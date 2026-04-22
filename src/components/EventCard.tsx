import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
    CampusEvent,
    markEventInterest,
    EventAttendee,
    getEventAttendees,
    UserProfile,
    ClassItem,
    markPrivateInterest,
    getPrivateInterestCount,
    getFriends
} from '../utils/firebase/firestore';
import { auth, db } from '../utils/firebase/client';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

interface EventCardProps {
    event: CampusEvent;
    userTimetable: Record<string, ClassItem[]>; // To check if free
    onFindBuddy: (event: CampusEvent) => void;
    onOpenChat: (event: CampusEvent) => void;
}

export function EventCard({ event, userTimetable, onFindBuddy, onOpenChat }: EventCardProps) {
    const [attendingStatus, setAttendingStatus] = useState<'attending' | 'interested' | 'none'>('none');
    const [isGoingAlone, setIsGoingAlone] = useState<boolean>(false);
    const [attendees, setAttendees] = useState<EventAttendee[]>([]);
    const [isFree, setIsFree] = useState<boolean>(false);
    const [quietInterestCount, setQuietInterestCount] = useState<number>(0);
    const [isQuietlyInterested, setIsQuietlyInterested] = useState<boolean>(false);
    const [isPair, setIsPair] = useState<boolean>(false);
    const [linkedWith, setLinkedWith] = useState<string>('');
    const [myFriends, setMyFriends] = useState<UserProfile[]>([]);

    useEffect(() => {
        loadMyStatus();
        checkIfFree();
        loadAttendees();
        
        const unsub = getPrivateInterestCount(event.id, (count) => {
            setQuietInterestCount(count);
        });
        
        const unsubFriends = getFriends((list) => setMyFriends(list));

        return () => {
            unsub();
            if (unsubFriends) unsubFriends();
        };
    }, [event.id]);

    const loadMyStatus = async () => {
        if (!auth.currentUser) return;
        
        // Load public attending status
        const all = await getEventAttendees(event.id);
        const myEntry = all.find(a => a.userId === auth.currentUser?.uid);
        if (myEntry) {
            setAttendingStatus(myEntry.status);
            setIsGoingAlone(myEntry.isGoingAlone);
            setIsPair(myEntry.isPair || false);
            setLinkedWith(myEntry.linkedWith || '');
        }

        // Load private interest status
        try {
            const interestRef = doc(db, `eventInterest/${event.id}/interested/${auth.currentUser.uid}`);
            const interestSnap = await getDoc(interestRef);
            setIsQuietlyInterested(interestSnap.exists());
        } catch (e) { console.error(e); }
    };

    const loadAttendees = async () => {
        const list = await getEventAttendees(event.id);
        setAttendees(list);
    };

    const handleStatusChange = async (status: 'attending' | 'interested' | 'none') => {
        setAttendingStatus(status);
        await markEventInterest(event.id, status, isGoingAlone, isPair, linkedWith);
        loadAttendees(); // Refresh stats
    };

    const toggleGoingAlone = async () => {
        const newVal = !isGoingAlone;
        setIsGoingAlone(newVal);
        // If they turn off going alone, also turn off pair
        let pairVal = isPair;
        let linkVal = linkedWith;
        if (!newVal) {
            pairVal = false;
            setIsPair(false);
            linkVal = '';
            setLinkedWith('');
        }
        if (attendingStatus !== 'none') {
            await markEventInterest(event.id, attendingStatus, newVal, pairVal, linkVal);
        }
    };

    const togglePair = async () => {
        const newVal = !isPair;
        setIsPair(newVal);
        // If they turn on pair, they are "going" (in the pool)
        let aloneVal = isGoingAlone;
        if (newVal) {
            aloneVal = true;
            setIsGoingAlone(true);
        }
        if (attendingStatus !== 'none') {
            await markEventInterest(event.id, attendingStatus, aloneVal, newVal, linkedWith);
        }
    };

    const handleLinkedWithChange = async (friendId: string) => {
        setLinkedWith(friendId);
        if (attendingStatus !== 'none') {
            await markEventInterest(event.id, attendingStatus, isGoingAlone, isPair, friendId);
        }
    };

    // Timetable Sync Logic
    const checkIfFree = () => {
        if (!event.startTime) return;
        const start = event.startTime.toDate();
        const dayName = start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(); // MON, TUE...

        // Simple check: Is there a class at start time?
        // In a real app, check full duration overlap
        const classesToday = userTimetable[dayName] || [];

        // Convert event start to minutes
        const eventStartMins = start.getHours() * 60 + start.getMinutes();

        // Check if any class overlaps
        const hasConflict = classesToday.some(cls => {
            // Parse class time "08:00 AM"
            // reusing logic from DiscoverPage or similar would be better, but implementing simple parser here
            const [timeStr, ampm] = cls.time.split(' ');
            const [hh, mm] = timeStr.split(':').map(Number);
            let classStartMins = hh * 60 + mm;
            if (ampm === 'PM' && hh !== 12) classStartMins += 12 * 60;
            if (ampm === 'AM' && hh === 12) classStartMins = mm; // 12 AM is 0 mins ?? No, 00:xx

            // duration is in hours usually in this app context (e.g. 1)
            // Assuming duration is 50-60 mins blocks.
            const classEndMins = classStartMins + (cls.duration * 60);

            return (eventStartMins >= classStartMins && eventStartMins < classEndMins);
        });

        setIsFree(!hasConflict);
    };

    // Heat Calculation
    const heatScore = (event.stats.attending * 2) + event.stats.interested + (event.stats.views / 20);
    let heatLevel = '❄️ Cold';
    let heatColor = 'text-blue-400';
    if (heatScore > 50) { heatLevel = '🔥 Hot'; heatColor = 'text-orange-500'; }
    else if (heatScore > 20) { heatLevel = '⚡ Trending'; heatColor = 'text-yellow-500'; }
    else if (heatScore > 5) { heatLevel = '🌿 Warm'; heatColor = 'text-green-500'; }

    const formatTime = (t: Timestamp) => {
        return t.toDate().toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit'
        });
    };

      return (
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
                  onClick={(e) => {e.stopPropagation(); markPrivateInterest(event.id, !isQuietlyInterested);}}
                  className={`w-12 h-12 rounded-full backdrop-blur-xl flex items-center justify-center border transition-colors ${isQuietlyInterested ? 'bg-sky-600 text-white border-sky-600' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                >
                    <span className="text-xl">🤫</span>
                </button>
                <button 
                  onClick={(e) => {e.stopPropagation(); onOpenChat(event);}}
                  className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center text-white border border-white/20 hover:bg-white/20 transition-colors"
                >
                    <span className="text-xl">💬</span>
                </button>
            </div>

            {/* Anonymous Interest Count */}
            {quietInterestCount > 0 && (
              <div className="absolute bottom-20 left-8 text-white/70 text-xs font-medium">
                {quietInterestCount} quietly interested
              </div>
            )}
        </div>
    );
}
