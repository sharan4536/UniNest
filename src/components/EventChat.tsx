import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { sendEventMessage, subEventMessages, EventChatMessage } from '../utils/firebase/firestore';
import { auth } from '../utils/firebase/client';
import { Timestamp } from 'firebase/firestore';

interface EventChatProps {
    eventId: string;
    eventTitle: string;
    onClose: () => void;
}

export function EventChat({ eventId, eventTitle, onClose }: EventChatProps) {
    const [messages, setMessages] = useState<EventChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = subEventMessages(eventId, (msgs) => {
            setMessages(msgs);
            // Scroll to bottom on new message
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);
        });
        return () => unsubscribe();
    }, [eventId]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim()) return;

        const content = newMessage;
        setNewMessage(''); // Optimistic clear
        await sendEventMessage(eventId, content);
    };

    const currentUserId = auth.currentUser?.uid;

    const formatTime = (t: Timestamp) => {
        // If today, show time only. If other day, show date.
        const date = t.toDate();
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex flex-col h-[500px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.length === 0 ? (
                    <div className="text-center text-slate-400 py-10">
                        <p>👋 Be the first to say hi!</p>
                        <p className="text-xs">Start the hype for {eventTitle}</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.userId === currentUserId;
                        return (
                            <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <Avatar className="w-8 h-8 mt-1">
                                    {msg.userAvatar && <AvatarImage src={msg.userAvatar} />}
                                    <AvatarFallback className={isMe ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-600'}>
                                        {msg.userName.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isMe
                                        ? 'bg-sky-500 text-white rounded-tr-none'
                                        : 'bg-slate-100 text-slate-800 rounded-tl-none'
                                    }`}>
                                    {!isMe && <div className="text-[10px] opacity-70 mb-1">{msg.userName}</div>}
                                    {msg.content}
                                    <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-sky-100' : 'text-slate-400'}`}>
                                        {formatTime(msg.timestamp)}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <form onSubmit={handleSend} className="flex gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="rounded-full border-slate-200 bg-white"
                    />
                    <Button type="submit" size="icon" className="rounded-full bg-sky-500 hover:bg-sky-600 shrink-0">
                        ➤
                    </Button>
                </form>
            </div>
        </div>
    );
}
