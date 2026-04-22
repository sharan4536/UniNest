import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
// Supabase removed
import { auth, isFirebaseConfigured } from '../utils/firebase/client';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  getUserProfile,
  getProfile,
  getEnhancedFriendProfile,
  markMessagesAsRead,
  getFriendRequests,
  acceptFriendRequest,
  ignoreFriendRequest,
  FriendRequest,
  getFriends,
  UserProfile,
  uploadUserPublicKey,
  getUserPublicKey,
  createSOSAlert
} from '../utils/firebase/firestore';
import {
  generateKeyPair,
  storeLocalKeys,
  getLocalKeys,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  initializeE2EE,
  exportKey
} from '../utils/crypto';
// E2EE Key Management
import { Plus, Upload, Edit, MoreVertical, ShieldCheck, Lock, ChevronLeft } from 'lucide-react';
import { StudyGroupsPage } from './StudyGroupsPage';

// Enhanced friend request with sender profile
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

export function MessagesPage({ currentUser, onOpenProfile }: { currentUser: { id: string }; onOpenProfile?: (user: any) => void }) {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'conversations' | 'requests'>('conversations');
  const [friendRequests, setFriendRequests] = useState<EnhancedFriendRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const myId = auth.currentUser?.uid || currentUser.id;

  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosCourse, setSosCourse] = useState("");
  const [sosTopic, setSosTopic] = useState("");

  // E2EE State
  const [myKeys, setMyKeys] = useState<any>(null); // CryptoKeyPair
  const [sharedKeys, setSharedKeys] = useState<Record<string, CryptoKey>>({}); // userId -> SharedKey
  const [isE2EEReady, setIsE2EEReady] = useState(false);

  // Initialize E2EE Keys
  useEffect(() => {
    const initKeys = async () => {
      if (isFirebaseConfigured && auth.currentUser) {
        let keys = await getLocalKeys();
        if (!keys) {
          const newKeys = await generateKeyPair();
          await storeLocalKeys(newKeys);
          keys = newKeys;
          // Upload public key
          const pubJWK = await exportKey(newKeys.publicKey);
          await uploadUserPublicKey(pubJWK);
        }
        setMyKeys(keys);
        setIsE2EEReady(true);
      }
    };
    initKeys();
  }, [currentUser.id]);

  // Derive Shared Keys for all conversations
  useEffect(() => {
    const setupEncryption = async () => {
      if (!myKeys || !isE2EEReady || conversations.length === 0) return;

      const newSharedKeys = { ...sharedKeys };
      let updated = false;

      for (const conv of conversations) {
        const otherId = conv.participant.id;
        if (!newSharedKeys[otherId]) {
          // Fetch their public key
          const theirPubJWK = await getUserPublicKey(otherId);
          if (theirPubJWK) {
            try {
              const theirKey = await window.crypto.subtle.importKey(
                "jwk",
                theirPubJWK,
                { name: "ECDH", namedCurve: "P-256" },
                false,
                []
              );
              const shared = await deriveSharedKey(myKeys.privateKey, theirKey);
              newSharedKeys[otherId] = shared;
              updated = true;
            } catch (e) {
              console.warn("Error importing key for", otherId, e);
            }
          }
        }
      }

      if (updated) {
        setSharedKeys(newSharedKeys);
      }
    };
    setupEncryption();
  }, [conversations, myKeys, isE2EEReady]);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  // Load conversations
  useEffect(() => {
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified;

    if (isUserFullyAuthenticated) {
      // Load real-time conversations from Firebase
      // Refresh auth token to ensure rules see latest verified state
      auth.currentUser?.getIdToken(true).catch(() => { });
      const unsubscribe = getConversations(async (firebaseConversations) => {
        const conversationsWithDetails = await Promise.all(
          firebaseConversations.map(async (convo) => {
            // Find the other participant (not current user)
            const otherParticipantId = convo.participants.find(
              (id) => id !== auth.currentUser?.uid
            ) || '';

            // Get participant profile (from users) and profile doc (from profiles)
            const [participantProfile, participantProfileDoc] = await Promise.all([
              getUserProfile(otherParticipantId),
              getProfile(otherParticipantId)
            ]);

            // Decrypt last message if possible
            let lastMessageText = convo.lastMessage?.content || 'New conversation';
            const currentSharedKey = sharedKeys[otherParticipantId];
            if (currentSharedKey && lastMessageText !== 'New conversation') {
              try {
                const decrypted = await decryptMessage(lastMessageText, currentSharedKey);
                if (!decrypted.startsWith('[E2EE Error')) {
                  lastMessageText = decrypted;
                }
              } catch (e) {
                // Ignore decryption errors for last message preview
              }
            }

            // Create conversation object
            return {
              id: convo.id || '',
              participant: {
                id: otherParticipantId,
                name: (participantProfileDoc as any)?.name || participantProfile?.displayName || 'User',
                avatar: participantProfile?.photoURL || null,
                online: !!participantProfile?.lastActive,
                lastSeen: participantProfile?.lastActive?.toDate() || null
              },
              lastMessage: {
                text: lastMessageText,
                timestamp: convo.lastMessage?.timestamp?.toDate() || new Date(),
                senderId: convo.lastMessage?.senderId || ''
              },
              unreadCount: 0, // We'll implement this later
              messages: [] // Messages will be loaded when conversation is selected
            };
          })
        );

        setConversations(conversationsWithDetails);
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // No mock fallback; show empty state when not authenticated
      setConversations([]);
      setLoading(false);
      return () => { };
    }
  }, [sharedKeys]); // Re-run when sharedKeys update to decrypt last messages

  // Load messages for selected conversation
  useEffect(() => {
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified;

    if (!selectedConversation || !isUserFullyAuthenticated) {
      return;
    }

    // Refresh auth token to ensure rules see latest verified state
    auth.currentUser?.getIdToken(true).catch(() => { });
    console.log('Loading messages for conversation:', selectedConversation.id);

    const unsubscribe = getMessages(selectedConversation.id, async (firebaseMessages) => {
      console.log('Messages received:', firebaseMessages.length);

      const otherId = selectedConversation.participant.id;
      let currentSharedKey = sharedKeys[otherId];

      // Convert Firebase messages to our Message type
      const messages = await Promise.all(firebaseMessages.map(async (msg) => {
        let text = msg.content;
        // Attempt decryption if shared key exists and message looks encrypted (base64)
        // Simple check: no spaces, ends with =, reasonable length. 
        // Better: add isEncrypted flag in Firestore. For now, try-catch decrypt.
        if (currentSharedKey) {
          // Try decrypting
          const decrypted = await decryptMessage(msg.content, currentSharedKey);
          if (!decrypted.startsWith('[E2EE Error')) {
            text = decrypted;
          }
        }

        return {
          id: msg.id || '',
          text: text,
          timestamp: msg.timestamp?.toDate() || new Date(),
          senderId: msg.senderId,
          recipientId: msg.receiverId
        };
      }));

      // Update the selected conversation with real messages
      setSelectedConversation(prev => {
        if (!prev || prev.id !== selectedConversation.id) return prev;

        // Preserve unencrypted optimistic messages if Firebase returned encrypted versions we couldn't decrypt
        const mergedMessages = messages.map(newMsg => {
          if (newMsg.text.startsWith('[E2EE Error') && newMsg.senderId === myId) {
            const existingMsg = prev.messages.find(m =>
              // Match by timestamp since optimistic ID might differ from Firebase ID
              Math.abs(m.timestamp.getTime() - newMsg.timestamp.getTime()) < 5000
              && m.senderId === myId
            );
            if (existingMsg && !existingMsg.text.startsWith('[E2EE Error')) {
              return { ...newMsg, text: existingMsg.text };
            }
          }
          return newMsg;
        });

        return {
          ...prev,
          messages: mergedMessages
        };
      });

      // Also update the conversation in the conversations list
      setConversations(prev => prev.map(conv => {
        if (conv.id === selectedConversation.id) {

          // Apply same preservation logic for the conversation list
          const mergedMessages = messages.map(newMsg => {
            if (newMsg.text.startsWith('[E2EE Error') && newMsg.senderId === myId) {
              const existingMsg = conv.messages.find(m =>
                Math.abs(m.timestamp.getTime() - newMsg.timestamp.getTime()) < 5000
                && m.senderId === myId
              );
              if (existingMsg && !existingMsg.text.startsWith('[E2EE Error')) {
                return { ...newMsg, text: existingMsg.text };
              }
            }
            return newMsg;
          });

          return {
            ...conv,
            messages: mergedMessages
          };
        }
        return conv;
      }));
    });

    return () => unsubscribe();
  }, [selectedConversation?.id, sharedKeys]);

  // Load friend requests
  useEffect(() => {
    if (isFirebaseConfigured && auth.currentUser) {
      console.log('Loading friend requests from Firebase...');
      setRequestsLoading(true);

      const unsubscribe = getFriendRequests(async (requests) => {
        console.log('Friend requests received:', requests.length);

        // Enhance requests with sender profiles
        const enhancedRequests = await Promise.all(
          requests.map(async (request) => {
            try {
              const [senderProfile, senderProfileDoc] = await Promise.all([
                getUserProfile(request.senderId),
                getProfile(request.senderId)
              ]);
              return {
                ...request,
                senderName: (senderProfileDoc as any)?.name || senderProfile?.displayName || 'Unknown User',
                senderAvatar: senderProfile?.photoURL || null
              } as EnhancedFriendRequest;
            } catch (error) {
              console.error('Error fetching sender profile:', error);
              return {
                ...request,
                senderName: 'Unknown User',
                senderAvatar: null
              } as EnhancedFriendRequest;
            }
          })
        );

        setFriendRequests(enhancedRequests);
        setRequestsLoading(false);
      });

      return () => unsubscribe();
    } else {
      setRequestsLoading(false);
    }
  }, [currentUser.id]);

  // Removed mock conversation loader; conversations rely solely on real-time Firebase

  const formatTime = (timestamp: Date | null): string => {
    if (!timestamp) return '';
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatLastActive = (timestamp: Date | null): string | null => {
    if (!timestamp) return null;
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return 'Recently active';
    return null;
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      // Refresh auth token before sending to satisfy Firestore rules
      auth.currentUser && await auth.currentUser.getIdToken(true);
      const isUserFullyAuthenticated = isFirebaseConfigured &&
        auth.currentUser &&
        auth.currentUser.emailVerified;

      if (isUserFullyAuthenticated) {
        // E2EE: Encrypt if shared key exists
        let contentToSend = newMessage;
        const otherId = selectedConversation.participant.id;
        if (sharedKeys[otherId]) {
          contentToSend = await encryptMessage(newMessage, sharedKeys[otherId]);
        }

        // Optimistically update conversation list with unencrypted text
        const newMsg: Message = {
          id: `${Date.now()}`,
          text: newMessage, // Store unencrypted text locally 
          timestamp: new Date(),
          senderId: myId,
          recipientId: selectedConversation.participant.id
        };

        setConversations((prev: Conversation[]) => prev.map((conv) => {
          if (conv.id === selectedConversation.id) {
            const updatedConv: Conversation = {
              ...conv,
              messages: [...conv.messages, newMsg],
              lastMessage: {
                text: newMessage,
                timestamp: new Date(),
                senderId: myId
              }
            };
            setSelectedConversation(updatedConv);
            return updatedConv;
          }
          return conv;
        }));

        // Send message using Firebase with potentially encrypted content
        await sendMessage(selectedConversation.id, contentToSend);

      } else {
        // Inform user if Firebase is configured but account isn't verified or not VIT
        if (isFirebaseConfigured && auth.currentUser) {
          alert('Messaging requires a verified email. Please verify your email in Firebase and try again.');
          return;
        }
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const markAsRead = (conversationId: string): void => {
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified;

    if (isUserFullyAuthenticated) {
      // Mark messages as read in Firebase
      markMessagesAsRead(conversationId);
    }

    setConversations((prev: Conversation[]) => prev.map((conv) =>
      conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
    ));
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!request.id || !request.senderId) return;

    setProcessingRequests(prev => new Set(prev).add(request.id!));

    try {
      const result = await acceptFriendRequest(request.id, request.senderId);
      if (result && result.success) {
        console.log('Friend request accepted successfully');
        // The real-time listener will automatically update the friendRequests state
        // Optionally switch to conversations tab to show the new conversation
        setActiveTab('conversations');
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(request.id!);
        return newSet;
      });
    }
  };

  const handleIgnoreRequest = async (request: FriendRequest) => {
    if (!request.id) return;

    setProcessingRequests(prev => new Set(prev).add(request.id!));

    try {
      const result = await ignoreFriendRequest(request.id);
      if (result && result.success) {
        console.log('Friend request ignored successfully');
        // The real-time listener will automatically update the friendRequests state
      }
    } catch (error) {
      console.error('Error ignoring friend request:', error);
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(request.id!);
        return newSet;
      });
    }
  };

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [friendProfileNames, setFriendProfileNames] = useState<Record<string, string>>({});
  const [friendSearch, setFriendSearch] = useState('');

  useEffect(() => {
    const unsubscribeFriends = getFriends((list) => {
      setFriends(list);
      // Resolve profile names from profiles collection
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
      unsubscribeFriends && unsubscribeFriends();
    };
  }, []);

  const filteredFriends = friendSearch
    ? friends.filter((f) => {
      const resolved = (friendProfileNames[f.uid] || f.displayName || f.email?.split('@')[0] || 'User').toLowerCase();
      return resolved.includes(friendSearch.toLowerCase());
    })
    : [];

  const openFriendProfile = async (friendUid: string) => {
    try {
      if (onOpenProfile && friendUid) {
        const enhanced = await getEnhancedFriendProfile(friendUid);
        let profileDoc: any = null;
        try {
          profileDoc = await getProfile(friendUid);
        } catch { }
        const user = {
          id: friendUid,
          name: (profileDoc?.name || enhanced?.displayName || 'User'),
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
      }
    } catch (e) {
      console.warn('Failed to open friend profile', e);
    }
  };

  const handleStartChat = async (friendUid: string) => {
    try {
      const convId = await createConversation(friendUid);
      setActiveTab('conversations');
      setFriendSearch('');
      if (convId) {
        const existing = conversations.find((c) => c.id === convId);
        if (existing) {
          setSelectedConversation(existing);
          markAsRead(convId);
        }
      }
    } catch (e) {
      console.error('Failed to start chat:', e);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-2 lg:p-4 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row items-center justify-between mb-4 animate-in fade-in duration-200" style={{ animationDelay: '0.1s' }}>
        <div className="text-center md:text-left mb-3 md:mb-0">
          <h1 className="text-3xl font-bold text-gradient mb-1">Messages</h1>
          <p className="text-slate-500 font-medium text-sm">Chat with your friends and study partners</p>
        </div>
        <Button 
          className="rounded-full bg-red-500 text-white hover:bg-red-600 font-bold shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-400"
          onClick={() => setSosModalOpen(true)}
        >
          🆘 Broadcast Study SOS
        </Button>
      </div>

      <Tabs defaultValue="direct" className="flex-1 flex flex-col min-h-0">
        <div className={`flex justify-center mb-4 ${selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
          <TabsList className="bg-slate-100/80 p-1 rounded-full">
            <TabsTrigger value="direct" className="rounded-full px-6 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all">Direct Messages</TabsTrigger>
            <TabsTrigger value="groups" className="rounded-full px-6 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-sky-600 data-[state=active]:shadow-sm transition-all">Study Groups</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="direct" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 animate-in fade-in duration-200" style={{ animationDelay: '0.2s' }}>
            {/* Conversations List */}
            <Card className={`lg:col-span-1 flex-col h-full overflow-hidden glass-card border-none shadow-lg ${selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
              <CardHeader className="pb-3 border-b border-gray-100/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex space-x-1 bg-slate-100/80 p-1.5 rounded-full">
                    <button
                      onClick={() => setActiveTab('conversations')}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-300 ${activeTab === 'conversations'
                        ? 'bg-white text-sky-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      Messages
                    </button>
                    <button
                      onClick={() => setActiveTab('requests')}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-300 relative ${activeTab === 'requests'
                        ? 'bg-white text-sky-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      Requests
                      {friendRequests.length > 0 && (
                        <Badge
                          variant="destructive"
                          className="absolute -top-1 -right-1 w-5 h-5 p-0 text-[10px] flex items-center justify-center shadow-sm animate-pulse"
                        >
                          {friendRequests.length}
                        </Badge>
                      )}
                    </button>
                  </div>
                </div>
                {/* Friend search to start a new chat */}
                <div className="relative">
                  <Input
                    placeholder="Search friends..."
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    className="w-full pl-10 rounded-full border-slate-200 bg-slate-50/50 focus:bg-white transition-all h-10 text-sm"
                  />
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                    🔍
                  </div>
                  {friendSearch && (
                    <div className="absolute top-12 left-0 right-0 max-h-60 overflow-y-auto rounded-2xl border border-gray-100 bg-white/95 backdrop-blur-md shadow-xl z-20 p-2">
                      {filteredFriends.length > 0 ? (
                        filteredFriends.slice(0, 6).map((f) => (
                          <div key={f.uid} className="flex items-center justify-between p-2 hover:bg-gray-50">
                            <button
                              className="text-sm truncate text-left flex-1 mr-2"
                              onClick={() => openFriendProfile(f.uid)}
                            >
                              {friendProfileNames[f.uid] || f.displayName || f.email?.split('@')[0] || 'User'}
                            </button>
                            <Button
                              size="sm"
                              className="text-xs bg-primary/20 hover:bg-primary/30 text-black transition-colors"
                              onClick={() => handleStartChat(f.uid)}
                            >
                              Start chat
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-xs opacity-75">No matching friends</div>
                      )}
                    </div>
                  )}
                </div>
                <CardTitle className="flex items-center justify-between">
                  <span>{activeTab === 'conversations' ? 'Conversations' : 'Friend Requests'}</span>
                  <Badge variant="secondary">
                    {activeTab === 'conversations'
                      ? conversations.length
                      : friendRequests.length
                    }
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <ScrollArea className="flex-1 h-full overflow-y-auto">
                  <div className="space-y-2 p-4">
                    {activeTab === 'conversations' ? (
                      // Conversations Tab Content
                      loading ? (
                        <div className="text-center py-8">Loading conversations...</div>
                      ) : conversations.length === 0 ? (
                        <div className="text-center py-8 opacity-75">
                          <p>No conversations yet</p>
                          <p className="text-sm mt-2">Start chatting with friends from the Discover page!</p>
                        </div>
                      ) : (
                        conversations.map((conversation) => (
                          <div
                            key={conversation.id}
                            className={`p-3 rounded-2xl cursor-pointer transition-all duration-300 hover:bg-white hover:shadow-sm mb-2 group ${selectedConversation?.id === conversation.id ? 'bg-white shadow-md ring-1 ring-sky-100' : 'bg-transparent border border-transparent hover:border-slate-100'
                              }`}
                            onClick={() => {
                              setSelectedConversation(conversation);
                              markAsRead(conversation.id);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative">
                                <Avatar className="w-10 h-10">
                                  <AvatarFallback>
                                    {conversation.participant.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                {conversation.participant.online && (
                                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium truncate flex items-center gap-1">
                                    {conversation.participant.name}
                                    {sharedKeys[conversation.participant.id] && (
                                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                    )}
                                  </h4>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs opacity-60">{formatTime(conversation.lastMessage.timestamp as Date)}</span>
                                    {conversation.unreadCount > 0 && (
                                      <Badge variant="destructive" className="w-5 h-5 p-0 text-xs flex items-center justify-center">
                                        {conversation.unreadCount}
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <p className="text-sm opacity-75 truncate mt-1">
                                  {conversation.lastMessage.senderId === myId ? 'You: ' : ''}
                                  {conversation.lastMessage.text}
                                </p>
                                {!conversation.participant.online && formatLastActive(conversation.participant.lastSeen) && (
                                  <p className="text-xs opacity-50 mt-1">
                                    {formatLastActive(conversation.participant.lastSeen)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      // Friend Requests Tab Content
                      requestsLoading ? (
                        <div className="text-center py-8">Loading friend requests...</div>
                      ) : friendRequests.length === 0 ? (
                        <div className="text-center py-8 opacity-75">
                          <p>No pending friend requests</p>
                          <p className="text-sm mt-2">When someone sends you a friend request, it will appear here!</p>
                        </div>
                      ) : (
                        friendRequests.map((request) => (
                          <div
                            key={request.id}
                            className="p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative">
                                <Avatar className="w-12 h-12">
                                  <AvatarFallback>
                                    {(request.senderName || request.senderId).charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full"></div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-medium text-gray-900">
                                    {request.senderName || 'Friend Request'}
                                  </h4>
                                  <span className="text-xs text-gray-500">
                                    {formatTime(request.createdAt.toDate())}
                                  </span>
                                </div>

                                <p className="text-sm text-gray-600 mb-3">
                                  Wants to connect with you
                                </p>

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleAcceptRequest(request)}
                                    disabled={processingRequests.has(request.id || '')}
                                    className="bg-primary/20 hover:bg-primary/30 text-black transition-colors"
                                  >
                                    {processingRequests.has(request.id || '') ? 'Processing...' : 'Accept'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleIgnoreRequest(request)}
                                    disabled={processingRequests.has(request.id || '')}
                                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                                  >
                                    {processingRequests.has(request.id || '') ? 'Processing...' : 'Ignore'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Chat Window */}
            <Card className={`lg:col-span-2 flex-col h-full overflow-hidden glass-card border-none shadow-lg ${!selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
              {selectedConversation ? (
                <>
                  <CardHeader className="border-b p-3 lg:p-6">
                    <div className="flex items-center gap-2 lg:gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden mr-1 -ml-2 shrink-0 h-8 w-8"
                        onClick={() => setSelectedConversation(null)}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <div className="relative shrink-0">
                        <Avatar>
                          <AvatarFallback>
                            {selectedConversation.participant.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {selectedConversation.participant.online && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium flex items-center gap-2">
                          {selectedConversation.participant.name}
                          {sharedKeys[selectedConversation.participant.id] && (
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          )}
                        </h3>
                        <p className="text-sm opacity-75">
                          {selectedConversation.participant.online
                            ? 'Online now'
                            : formatLastActive(selectedConversation.participant.lastSeen) || ''
                          }
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0 flex flex-col flex-1 min-h-0 relative">
                    <ScrollArea className="flex-1 h-full p-4 overflow-y-auto">
                      <div className="space-y-4">
                        {selectedConversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.senderId === myId ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                          >
                            <div
                              className={`max-w-[75%] lg:max-w-[70%] px-5 py-3 rounded-2xl shadow-sm ${message.senderId === myId
                                ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white rounded-tr-sm'
                                : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                                }`}
                            >
                              <p className="break-words whitespace-pre-wrap leading-relaxed">{message.text}</p>
                              <p className={`text-[10px] mt-1 text-right ${message.senderId === myId ? 'text-white/70' : 'text-slate-400'}`}>
                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>

                    <div className="border-t p-4 bg-white shrink-0">
                      {/* E2EE Indicator */}
                      {selectedConversation && sharedKeys[selectedConversation.participant.id] && (
                        <div className="flex items-center justify-center gap-1.5 mb-3 text-[10px] text-emerald-600 font-medium opacity-80 bg-emerald-50 py-1 px-3 rounded-full w-fit mx-auto border border-emerald-100/50">
                          <Lock className="w-3 h-3" />
                          <span>Messages are end-to-end encrypted</span>
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
                          className="flex-1 rounded-full border-slate-200 bg-slate-50 focus:bg-white transition-all h-11 pl-4"
                        />
                        <Button
                          onClick={handleSendMessage}
                          className="rounded-full w-11 h-11 p-0 bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-200/50 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                        >
                          ➤
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex items-center justify-center h-full">
                  <div className="text-center opacity-50">
                    <div className="text-4xl mb-4">💬</div>
                    <p>Select a conversation to start chatting</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="groups" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden glass-card border-none shadow-lg animate-in fade-in duration-200" style={{ animationDelay: '0.2s' }}>
            <CardContent className="p-0 flex flex-col flex-1 h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto w-full h-full pb-8">
                <StudyGroupsPage currentUser={currentUser as any} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* SOS Modal */}
      <Dialog open={sosModalOpen} onOpenChange={setSosModalOpen}>
        <DialogContent className="bottom-sheet-content border-red-200 p-6 sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
              🆘 Broadcast Study SOS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-500">Need immediate help? Broadcast an SOS to friends and coursemates. (Expires in 2 hours)</p>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500">COURSE CODE</Label>
              <Input 
                placeholder="e.g. CS 301 (Optional)" 
                value={sosCourse} 
                onChange={(e) => setSosCourse(e.target.value)} 
                className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500">TOPIC (Max 80 chars)</Label>
              <Input 
                placeholder="e.g. Need help with linked lists" 
                maxLength={80}
                value={sosTopic} 
                onChange={(e) => setSosTopic(e.target.value)} 
                className="rounded-xl bg-slate-50 border-slate-200 focus:bg-white" 
              />
            </div>
            <Button 
              onClick={async () => {
                if (!sosTopic.trim() || !sosCourse) return;
                await createSOSAlert(sosCourse, sosTopic);
                setSosModalOpen(false);
                setSosTopic("");
                setSosCourse("");
              }} 
              className="w-full h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-200/50"
            >
              Confirm Broadcast
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
