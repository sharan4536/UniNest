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
        <Card className="modal-card border-none overflow-hidden hover:shadow-lg transition-shadow duration-300">
            <div className="h-2 bg-gradient-to-r from-sky-400 to-indigo-500" />
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <Badge variant="outline" className="mb-2 border-slate-200 text-slate-500 text-[10px] tracking-wider uppercase">
                            {event.clubName}
                        </Badge>
                        <CardTitle className="text-xl font-bold text-slate-800 leading-tight">
                            {event.title}
                        </CardTitle>
                    </div>
                    <div className={`text-xs font-bold px-2 py-1 rounded-full bg-slate-50 border border-slate-100 ${heatColor}`}>
                        {heatLevel}
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <span>📍 {event.location}</span>
                    <span>•</span>
                    <span>🕒 {formatTime(event.startTime)}</span>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                    {event.vibeTags && event.vibeTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-none">{tag}</Badge>
                    ))}
                    {event.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px] text-slate-400">#{tag}</Badge>
                    ))}
                </div>

                <p className="text-sm text-slate-600 line-clamp-2">
                    {event.description}
                </p>

                <div className="flex items-center gap-2">
                    {isFree && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">
                            🟢 You're Free
                        </Badge>
                    )}
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        {event.stats.attending} going
                    </Badge>
                </div>

                {quietInterestCount > 0 && (
                    <div className="mt-2 text-xs font-medium text-slate-500 italic bg-slate-50 border border-slate-100 rounded-lg p-2 text-center w-full">
                        🤫 {quietInterestCount} {quietInterestCount === 1 ? 'person is' : 'people are'} quietly interested
                    </div>
                )}
            </CardContent>

            <CardFooter className="bg-slate-50/50 p-4 flex flex-col gap-4 border-t border-slate-100">
                <div className="flex gap-2 w-full">
                    <Button
                        variant={isQuietlyInterested ? 'secondary' : 'outline'}
                        className={`flex-1 rounded-xl ${isQuietlyInterested ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'text-slate-500 border-slate-300'}`}
                        onClick={async () => {
                            const newVal = !isQuietlyInterested;
                            setIsQuietlyInterested(newVal);
                            await markPrivateInterest(event.id, newVal);
                        }}
                    >
                        I'm interested
                    </Button>
                    <Button
                        variant={attendingStatus === 'attending' ? 'default' : 'outline'}
                        className={`flex-1 rounded-xl font-bold ${attendingStatus === 'attending' ? 'bg-sky-500 hover:bg-sky-600 text-white' : 'text-slate-500 border-slate-300'}`}
                        onClick={() => handleStatusChange(attendingStatus === 'attending' ? 'none' : 'attending')}
                    >
                        {attendingStatus === 'attending' ? '✓ I\'m going' : 'I\'m going'}
                    </Button>
                </div>

                {attendingStatus === 'attending' && (
                    <div className="w-full bg-white rounded-xl p-3 border border-slate-100">
                        <div className="flex items-center justify-between cursor-pointer group" onClick={togglePair}>
                            <span className="text-sm font-medium text-slate-600 group-hover:text-sky-600 transition-colors">Going as a pair?</span>
                            <div className={`w-8 h-4 rounded-full transition-colors relative ${isPair ? 'bg-sky-500' : 'bg-slate-200'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${isPair ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                        </div>
                        {isPair && (
                            <div className="mt-3">
                                <select 
                                    value={linkedWith} 
                                    onChange={(e) => handleLinkedWithChange(e.target.value)}
                                    className="w-full text-sm p-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-sky-300"
                                >
                                    <option value="" disabled>Select a friend</option>
                                    {myFriends.map(f => (
                                        <option key={f.uid} value={f.uid}>{f.displayName || f.email}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                <div className="w-full pt-1">
                    {(() => {
                        const pool = attendees.filter(a => a.isGoingAlone && a.status === 'attending');
                        if (pool.length <= 1) return null; // Suppress UI to prevent isolating the sole attendee

                        return (
                            <>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Looking for company</span>
                                </div>
                                <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => onFindBuddy(event)}>
                                    <div className="flex -space-x-2">
                                        {(() => {
                                            const display = pool.slice(0, 4);
                                            return (
                                                <>
                                                    {display.map((att, i) => (
                                                        <div key={att.id || i} className="relative">
                                                            <Avatar className="w-8 h-8 border-2 border-white">
                                                                <AvatarFallback className="bg-sky-100 text-sky-700 text-xs">U</AvatarFallback>
                                                            </Avatar>
                                                            {att.isPair && (
                                                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 text-[8px] shadow-sm ring-1 ring-slate-100">🔗</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {pool.length > 4 && (
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500 z-10">
                                                            +{pool.length - 4}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <span className="text-xs font-medium text-sky-600 hover:text-sky-700 ml-auto">View All ↗</span>
                                </div>
                            </>
                        );
                    })()}

                    <div className="flex gap-2 w-full mt-2">
                        {attendingStatus === 'attending' && (
                            <Button
                                variant="secondary"
                                className="flex-1 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                onClick={() => onOpenChat(event)}
                            >
                                💬 Event Chat
                            </Button>
                        )}
                        {event.registrationLink && (
                            <Button
                                variant="default"
                                className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-900"
                                onClick={() => window.open(event.registrationLink, '_blank')}
                            >
                                {attendingStatus === 'attending' ? 'Details ↗' : 'In Person ↗'}
                            </Button>
                        )}
                    </div>
                </div>
            </CardFooter>
        </Card>
    );
}
