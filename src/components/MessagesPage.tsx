import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  Edit3,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  createConversation,
  getConversations,
  getEnhancedFriendProfile,
  getFriendRequests,
  getFriends,
  getMessages,
  getProfile,
  getUnreadMessagesCount,
  getUserProfile,
  ignoreFriendRequest,
  markMessagesAsRead,
  acceptFriendRequest,
  sendMessage,
  uploadUserPublicKey,
  getUserPublicKey,
  FriendRequest,
  UserProfile,
} from '../utils/firebase/firestore';
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import {
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
  exportKey,
  generateKeyPair,
  getLocalKeys,
  storeLocalKeys,
} from '../utils/crypto';

type EnhancedFriendRequest = FriendRequest & {
  senderName?: string;
  senderAvatar?: string | null;
};

type Participant = {
  id: string;
  name: string;
  avatar: string | null;
  online: boolean;
  lastSeen: Date | null;
};

type Message = {
  id: string;
  text: string;
  timestamp: Date;
  senderId: string;
  recipientId?: string;
};

type Conversation = {
  id: string;
  participant: Participant;
  lastMessage: { text: string; timestamp: Date; senderId: string };
  unreadCount: number;
  messages: Message[];
};

type MessagesPageProps = {
  currentUser: { id: string; name?: string; displayName?: string };
  onOpenProfile?: (user: any) => void;
};

export function MessagesPage({ currentUser, onOpenProfile }: MessagesPageProps) {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friendRequests, setFriendRequests] = useState<EnhancedFriendRequest[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendProfileNames, setFriendProfileNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [surface, setSurface] = useState<'messages' | 'requests'>('messages');
  const [showComposer, setShowComposer] = useState(false);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const [myKeys, setMyKeys] = useState<any>(null);
  const [sharedKeys, setSharedKeys] = useState<Record<string, CryptoKey>>({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const myId = auth.currentUser?.uid || currentUser.id;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initKeys = async () => {
      if (!(isFirebaseConfigured && auth.currentUser)) return;
      let keys = await getLocalKeys();
      if (!keys) {
        const newKeys = await generateKeyPair();
        await storeLocalKeys(newKeys);
        keys = newKeys;
        const pubJwk = await exportKey(newKeys.publicKey);
        await uploadUserPublicKey(pubJwk);
      }
      setMyKeys(keys);
    };
    initKeys();
  }, [currentUser.id]);

  useEffect(() => {
    const setupEncryption = async () => {
      if (!myKeys || conversations.length === 0) return;
      const nextKeys = { ...sharedKeys };
      let changed = false;

      for (const conversation of conversations) {
        const otherId = conversation.participant.id;
        if (!otherId || nextKeys[otherId]) continue;
        const theirPubJwk = await getUserPublicKey(otherId);
        if (!theirPubJwk) continue;

        try {
          const theirKey = await window.crypto.subtle.importKey(
            'jwk',
            theirPubJwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
          );
          nextKeys[otherId] = await deriveSharedKey(myKeys.privateKey, theirKey);
          changed = true;
        } catch (error) {
          console.warn('Failed to derive shared key for', otherId, error);
        }
      }

      if (changed) {
        setSharedKeys(nextKeys);
      }
    };

    setupEncryption();
  }, [conversations, myKeys]);

  useEffect(() => {
    if (!(isFirebaseConfigured && auth.currentUser?.emailVerified)) {
      setConversations([]);
      setLoading(false);
      return;
    }

    auth.currentUser.getIdToken(true).catch(() => {});
    const unsubscribe = getConversations(async (firebaseConversations) => {
      const next = await Promise.all(
        firebaseConversations.map(async (conversation) => {
          const otherParticipantId =
            conversation.participants.find((id) => id !== auth.currentUser?.uid) || '';

          const [participantProfile, participantProfileDoc] = await Promise.all([
            getUserProfile(otherParticipantId),
            getProfile(otherParticipantId),
          ]);

          let lastMessageText = conversation.lastMessage?.content || 'New conversation';
          const currentSharedKey = sharedKeys[otherParticipantId];
          if (currentSharedKey && lastMessageText !== 'New conversation') {
            try {
              const decrypted = await decryptMessage(lastMessageText, currentSharedKey);
              if (!decrypted.startsWith('[E2EE Error')) {
                lastMessageText = decrypted;
              }
            } catch {}
          }

          return {
            id: conversation.id || '',
            participant: {
              id: otherParticipantId,
              name: (participantProfileDoc as any)?.name || participantProfile?.displayName || 'User',
              avatar: participantProfile?.photoURL || null,
              online: !!participantProfile?.lastActive,
              lastSeen: participantProfile?.lastActive?.toDate() || null,
            },
            lastMessage: {
              text: lastMessageText,
              timestamp: conversation.lastMessage?.timestamp?.toDate() || new Date(),
              senderId: conversation.lastMessage?.senderId || '',
            },
            unreadCount: 0,
            messages: [],
          } as Conversation;
        })
      );

      setConversations(next);
      setLoading(false);
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return next.find((conversation) => conversation.id === prev.id) || prev;
      });
    });

    return () => unsubscribe();
  }, [sharedKeys]);

  useEffect(() => {
    if (!(isFirebaseConfigured && auth.currentUser?.emailVerified)) return;
    const unsubscribe = getUnreadMessagesCount((count) => setUnreadTotal(count));
    return () => unsubscribe();
  }, [currentUser.id]);

  useEffect(() => {
    if (!selectedConversation || !(isFirebaseConfigured && auth.currentUser?.emailVerified)) return;

    auth.currentUser.getIdToken(true).catch(() => {});
    const unsubscribe = getMessages(selectedConversation.id, async (firebaseMessages) => {
      const otherId = selectedConversation.participant.id;
      const currentSharedKey = sharedKeys[otherId];

      const mappedMessages = await Promise.all(
        firebaseMessages.map(async (message) => {
          let text = message.content;
          if (currentSharedKey) {
            const decrypted = await decryptMessage(message.content, currentSharedKey);
            if (!decrypted.startsWith('[E2EE Error')) {
              text = decrypted;
            }
          }

          return {
            id: message.id || '',
            text,
            timestamp: message.timestamp?.toDate() || new Date(),
            senderId: message.senderId,
            recipientId: message.receiverId,
          } as Message;
        })
      );

      setSelectedConversation((prev) =>
        prev && prev.id === selectedConversation.id ? { ...prev, messages: mappedMessages } : prev
      );
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                messages: mappedMessages,
                lastMessage:
                  mappedMessages.length > 0
                    ? {
                        text: mappedMessages[mappedMessages.length - 1].text,
                        timestamp: mappedMessages[mappedMessages.length - 1].timestamp,
                        senderId: mappedMessages[mappedMessages.length - 1].senderId,
                      }
                    : conversation.lastMessage,
              }
            : conversation
        )
      );
    });

    return () => unsubscribe();
  }, [selectedConversation?.id, sharedKeys]);

  useEffect(() => {
    if (!(isFirebaseConfigured && auth.currentUser)) {
      setRequestsLoading(false);
      return;
    }

    const unsubscribe = getFriendRequests(async (requests) => {
      const enhanced = await Promise.all(
        requests.map(async (request) => {
          try {
            const [senderProfile, senderProfileDoc] = await Promise.all([
              getUserProfile(request.senderId),
              getProfile(request.senderId),
            ]);
            return {
              ...request,
              senderName: (senderProfileDoc as any)?.name || senderProfile?.displayName || 'Unknown User',
              senderAvatar: senderProfile?.photoURL || null,
            } as EnhancedFriendRequest;
          } catch {
            return {
              ...request,
              senderName: 'Unknown User',
              senderAvatar: null,
            } as EnhancedFriendRequest;
          }
        })
      );

      setFriendRequests(enhanced);
      setRequestsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser.id]);

  useEffect(() => {
    const unsubscribe = getFriends((list) => {
      setFriends(list);
      Promise.all(list.map((friend) => getProfile(friend.uid)))
        .then((profiles) => {
          const nextMap: Record<string, string> = {};
          profiles.forEach((profile, index) => {
            const uid = list[index]?.uid;
            const name = profile?.name;
            if (uid && typeof name === 'string' && name.trim()) {
              nextMap[uid] = name.trim();
            }
          });
          setFriendProfileNames((prev) => ({ ...prev, ...nextMap }));
        })
        .catch(() => {});
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages]);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        conversation.participant.name,
        conversation.lastMessage.text,
        conversation.participant.online ? 'online' : 'offline',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, searchQuery]);

  const activeNow = useMemo(() => {
    return conversations
      .filter((conversation) => conversation.participant.online)
      .slice(0, 8);
  }, [conversations]);

  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return [];
    const query = friendSearch.toLowerCase();
    return friends.filter((friend) => {
      const resolved =
        friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'User';
      return resolved.toLowerCase().includes(query);
    });
  }, [friendProfileNames, friendSearch, friends]);

  const formatTime = (timestamp: Date | null) => {
    if (!timestamp) return '';
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days === 1) return 'Yesterday';
    return timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatChatTimestamp = (timestamp: Date) =>
    timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatLastActive = (timestamp: Date | null) => {
    if (!timestamp) return null;
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) return 'Recently active';
    return null;
  };

  const selectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setSurface('messages');
    if (isFirebaseConfigured && auth.currentUser?.emailVerified) {
      markMessagesAsRead(conversation.id);
    }
    setConversations((prev) =>
      prev.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item))
    );
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      auth.currentUser && (await auth.currentUser.getIdToken(true));
      if (!(isFirebaseConfigured && auth.currentUser?.emailVerified)) {
        alert('Messaging requires a verified email.');
        return;
      }

      let contentToSend = newMessage;
      const otherId = selectedConversation.participant.id;
      if (sharedKeys[otherId]) {
        contentToSend = await encryptMessage(newMessage, sharedKeys[otherId]);
      }

      const optimisticMessage: Message = {
        id: `${Date.now()}`,
        text: newMessage,
        timestamp: new Date(),
        senderId: myId,
        recipientId: selectedConversation.participant.id,
      };

      setSelectedConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, optimisticMessage],
              lastMessage: {
                text: optimisticMessage.text,
                timestamp: optimisticMessage.timestamp,
                senderId: myId,
              },
            }
          : prev
      );

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                messages: [...conversation.messages, optimisticMessage],
                lastMessage: {
                  text: optimisticMessage.text,
                  timestamp: optimisticMessage.timestamp,
                  senderId: myId,
                },
              }
            : conversation
        )
      );

      setNewMessage('');
      await sendMessage(selectedConversation.id, contentToSend);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!request.id || !request.senderId) return;
    setProcessingRequests((prev) => new Set(prev).add(request.id!));
    try {
      const result = await acceptFriendRequest(request.id, request.senderId);
      if (result?.success) {
        setSurface('messages');
      }
    } finally {
      setProcessingRequests((prev) => {
        const next = new Set(prev);
        next.delete(request.id!);
        return next;
      });
    }
  };

  const handleIgnoreRequest = async (request: FriendRequest) => {
    if (!request.id) return;
    setProcessingRequests((prev) => new Set(prev).add(request.id!));
    try {
      await ignoreFriendRequest(request.id);
    } finally {
      setProcessingRequests((prev) => {
        const next = new Set(prev);
        next.delete(request.id!);
        return next;
      });
    }
  };

  const openFriendProfile = async (friendUid: string) => {
    try {
      if (!onOpenProfile || !friendUid) return;
      const enhanced = await getEnhancedFriendProfile(friendUid);
      let profileDoc: any = null;
      try {
        profileDoc = await getProfile(friendUid);
      } catch {}
      onOpenProfile({
        id: friendUid,
        name: profileDoc?.name || enhanced?.displayName || 'User',
        major: profileDoc?.major ?? enhanced?.major,
        year: profileDoc?.year ?? enhanced?.year,
        university: profileDoc?.university ?? enhanced?.university,
        email: enhanced?.email,
        bio: profileDoc?.bio ?? enhanced?.bio,
        interests: profileDoc?.interests ?? enhanced?.interests,
        clubs: profileDoc?.clubs ?? enhanced?.clubs,
        timetable: enhanced?.timetable,
        sharedCourses: enhanced?.sharedCourses,
      });
    } catch (error) {
      console.warn('Failed to open friend profile', error);
    }
  };

  const handleStartChat = async (friendUid: string) => {
    try {
      const conversationId = await createConversation(friendUid);
      setShowComposer(false);
      setFriendSearch('');
      setSurface('messages');

      if (!conversationId) return;
      const existing = conversations.find((conversation) => conversation.id === conversationId);
      if (existing) {
        selectConversation(existing);
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const currentUserInitial = (currentUser.name || currentUser.displayName || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/50 bg-slate-50/75 px-4 shadow-sm backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sm font-bold text-sky-700">
            {currentUserInitial}
          </div>
          <div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-xl font-bold tracking-tight text-sky-600">UniNest</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-xl p-2 text-sky-500 transition hover:bg-sky-50/80" aria-label="Search">
            <Search className="h-5 w-5" />
          </button>
          <button className="relative rounded-xl p-2 text-sky-500 transition hover:bg-sky-50/80" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {unreadTotal > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
          </button>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className={`${selectedConversation ? 'hidden lg:block' : 'block'} border-r border-slate-200/60 bg-background`}>
          <div className="px-4 pb-32 pt-6 md:px-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setSurface((prev) => (prev === 'messages' ? 'requests' : 'messages'))}
                className="rounded-2xl bg-slate-100 p-3 text-sky-700"
                aria-label="Toggle inbox surface"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
            </div>

            <section className="mb-8 overflow-x-auto pb-2">
              <div className="flex gap-5">
                <button
                  type="button"
                  onClick={() => setShowComposer(true)}
                  className="flex shrink-0 flex-col items-center gap-2"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-sky-500 bg-white">
                    <Edit3 className="h-5 w-5 text-sky-600" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-wide text-slate-500">New Chat</span>
                </button>

                {activeNow.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => selectConversation(conversation)}
                    className="flex shrink-0 flex-col items-center gap-2"
                  >
                    <div className="relative h-16 w-16 rounded-full bg-gradient-to-tr from-sky-400 to-sky-600 p-[2px]">
                      <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-white">
                        {conversation.participant.avatar ? (
                          <img
                            src={conversation.participant.avatar}
                            alt={conversation.participant.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-sky-100 text-sm font-bold text-sky-700">
                            {conversation.participant.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                    </div>
                    <span className="max-w-16 truncate text-[11px] font-semibold tracking-wide text-slate-500">
                      {conversation.participant.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <div className="mb-4 flex items-center justify-between">
              <h2 className="ml-1 text-sm font-bold uppercase tracking-[0.1em] text-slate-500">
                {surface === 'messages' ? 'Recent Messages' : 'Friend Requests'}
              </h2>
              <div className="rounded-full bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setSurface('messages')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${surface === 'messages' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Messages
                </button>
                <button
                  type="button"
                  onClick={() => setSurface('requests')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${surface === 'requests' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Requests
                </button>
              </div>
            </div>

            {surface === 'messages' ? (
              <div className="space-y-1">
                {loading ? (
                  <EmptyState title="Loading conversations..." subtitle="Syncing your live inbox." />
                ) : filteredConversations.length === 0 ? (
                  <EmptyState title="No conversations yet" subtitle="Start a new chat with a friend to see it here." />
                ) : (
                  filteredConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation)}
                      className="group flex w-full items-center gap-4 rounded-[1.75rem] p-4 text-left transition-all duration-300 hover:bg-slate-100/80"
                    >
                      <div className="relative shrink-0">
                        <div className="h-14 w-14 overflow-hidden rounded-full bg-sky-100">
                          {conversation.participant.avatar ? (
                            <img
                              src={conversation.participant.avatar}
                              alt={conversation.participant.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-sky-700">
                              {conversation.participant.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background ${
                            conversation.participant.online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h3 className="truncate font-bold text-slate-900">{conversation.participant.name}</h3>
                            {sharedKeys[conversation.participant.id] && (
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            )}
                          </div>
                          <span className={`shrink-0 text-[11px] ${conversation.unreadCount > 0 ? 'font-bold text-sky-700' : 'font-medium text-slate-400'}`}>
                            {formatTime(conversation.lastMessage.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className={`truncate pr-2 text-sm ${conversation.unreadCount > 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-500'}`}>
                            {conversation.lastMessage.senderId === myId ? 'You: ' : ''}
                            {conversation.lastMessage.text}
                          </p>
                          {conversation.unreadCount > 0 ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : conversation.lastMessage.senderId === myId ? (
                            <CheckCheck className="h-4 w-4 text-sky-600/60" />
                          ) : null}
                        </div>
                        {!conversation.participant.online && formatLastActive(conversation.participant.lastSeen) && (
                          <p className="mt-1 text-xs text-slate-400">{formatLastActive(conversation.participant.lastSeen)}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : requestsLoading ? (
              <EmptyState title="Loading requests..." subtitle="Checking who wants to connect." />
            ) : friendRequests.length === 0 ? (
              <EmptyState title="No pending requests" subtitle="When someone sends you a request, it will show up here." />
            ) : (
              <div className="space-y-3">
                {friendRequests.map((request) => (
                  <div key={request.id} className="rounded-[1.75rem] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>{(request.senderName || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="truncate font-semibold text-slate-900">{request.senderName || 'Friend Request'}</h4>
                          <span className="text-xs text-slate-400">{request.createdAt?.toDate ? formatTime(request.createdAt.toDate()) : ''}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Wants to connect with you.</p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAcceptRequest(request)}
                            disabled={processingRequests.has(request.id || '')}
                            className="rounded-full bg-sky-600 text-white hover:bg-sky-700"
                          >
                            {processingRequests.has(request.id || '') ? 'Processing...' : 'Accept'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleIgnoreRequest(request)}
                            disabled={processingRequests.has(request.id || '')}
                            className="rounded-full"
                          >
                            Ignore
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={`${selectedConversation ? 'block' : 'hidden lg:block'} relative min-h-[calc(100vh-4rem)] bg-white/50`}>
          {selectedConversation ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-slate-200/60 bg-white/70 px-4 py-4 backdrop-blur-xl md:px-6">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <button
                  type="button"
                  onClick={() => openFriendProfile(selectedConversation.participant.id)}
                  className="relative"
                >
                  <Avatar className="h-11 w-11">
                    <AvatarFallback>{selectedConversation.participant.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  {selectedConversation.participant.online && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-slate-900">{selectedConversation.participant.name}</h3>
                    {sharedKeys[selectedConversation.participant.id] && (
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {selectedConversation.participant.online
                      ? 'Online now'
                      : formatLastActive(selectedConversation.participant.lastSeen) || 'Offline'}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.12),_transparent_24%),linear-gradient(180deg,_rgba(241,247,251,0.7),_rgba(255,255,255,0.92))] px-4 py-6 md:px-6">
                <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
                  {selectedConversation.messages.length === 0 ? (
                    <EmptyState title="No messages yet" subtitle="Say hi and start the conversation." compact />
                  ) : (
                    selectedConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderId === myId ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-[1.5rem] px-5 py-3 shadow-sm ${
                            message.senderId === myId
                              ? 'rounded-tr-md bg-gradient-to-tr from-sky-700 to-sky-400 text-white'
                              : 'rounded-tl-md bg-white text-slate-800 ring-1 ring-slate-200/70'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                          <p
                            className={`mt-1 text-right text-[10px] ${
                              message.senderId === myId ? 'text-white/70' : 'text-slate-400'
                            }`}
                          >
                            {formatChatTimestamp(message.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-slate-200/60 bg-white/85 px-4 py-4 backdrop-blur-xl md:px-6">
                <div className="mx-auto max-w-3xl">
                  {sharedKeys[selectedConversation.participant.id] && (
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                      <ShieldCheck className="h-3 w-3" />
                      End-to-end encrypted
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="h-12 rounded-full border-slate-200 bg-slate-50 pl-4"
                    />
                    <Button
                      onClick={handleSendMessage}
                      className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-sky-700 to-sky-400 p-0 text-white"
                    >
                      <MessageCircle className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden h-full items-center justify-center lg:flex">
              <EmptyState title="Choose a conversation" subtitle="Your live chats will open here." compact />
            </div>
          )}
        </section>
      </main>

      <button
        type="button"
        onClick={() => setShowComposer(true)}
        className="fixed bottom-28 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-700 to-sky-400 text-white shadow-xl transition active:scale-90"
        aria-label="Compose"
      >
        <Edit3 className="h-6 w-6" />
      </button>

      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-['Plus_Jakarta_Sans'] text-xl font-bold text-slate-900">Start a conversation</h3>
                <p className="text-sm text-slate-500">Search your real friend list and jump straight into chat.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowComposer(false);
                  setFriendSearch('');
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Search friends..."
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
              />
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {!friendSearch ? (
                <EmptyState title="Search by name" subtitle="Type to find a friend and open a real-time conversation." compact />
              ) : filteredFriends.length === 0 ? (
                <EmptyState title="No matching friends" subtitle="Try a different name." compact />
              ) : (
                filteredFriends.slice(0, 8).map((friend) => {
                  const resolvedName =
                    friendProfileNames[friend.uid] || friend.displayName || friend.email?.split('@')[0] || 'User';

                  return (
                    <div key={friend.uid} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback>{resolvedName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openFriendProfile(friend.uid)}
                      >
                        <p className="truncate font-semibold text-slate-900">{resolvedName}</p>
                        <p className="truncate text-sm text-slate-500">{friend.major || friend.email}</p>
                      </button>
                      <Button
                        size="sm"
                        onClick={() => handleStartChat(friend.uid)}
                        className="rounded-full bg-sky-600 text-white hover:bg-sky-700"
                      >
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        Chat
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  compact = false,
}: {
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
        <MessageCircle className="h-5 w-5" />
      </div>
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
