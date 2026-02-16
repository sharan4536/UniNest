import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
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
  UserProfile
} from '../utils/firebase/firestore';
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
      auth.currentUser?.getIdToken(true).catch(() => {});
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
                text: convo.lastMessage?.content || 'New conversation',
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
      return () => {};
    }
  }, []);

  // Load messages for selected conversation
  useEffect(() => {
    const isUserFullyAuthenticated = isFirebaseConfigured &&
      auth.currentUser &&
      auth.currentUser.emailVerified;

    if (!selectedConversation || !isUserFullyAuthenticated) {
      return;
    }

    // Refresh auth token to ensure rules see latest verified state
    auth.currentUser?.getIdToken(true).catch(() => {});
    console.log('Loading messages for conversation:', selectedConversation.id);
    
    const unsubscribe = getMessages(selectedConversation.id, (firebaseMessages) => {
      console.log('Messages received:', firebaseMessages.length);
      
      // Convert Firebase messages to our Message type
      const messages: Message[] = firebaseMessages.map((msg) => ({
        id: msg.id || '',
        text: msg.content,
        timestamp: msg.timestamp?.toDate() || new Date(),
        senderId: msg.senderId,
        recipientId: msg.receiverId
      }));

      // Update the selected conversation with real messages
      setSelectedConversation(prev => {
        if (!prev || prev.id !== selectedConversation.id) return prev;
        return {
          ...prev,
          messages
        };
      });

      // Also update the conversation in the conversations list
      setConversations(prev => prev.map(conv => {
        if (conv.id === selectedConversation.id) {
          return {
            ...conv,
            messages
          };
        }
        return conv;
      }));
    });

    return () => unsubscribe();
  }, [selectedConversation?.id]);

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

  const handleSendMessage = async (): Promise<void> => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      // Refresh auth token before sending to satisfy Firestore rules
      auth.currentUser && await auth.currentUser.getIdToken(true);
      const isUserFullyAuthenticated = isFirebaseConfigured &&
        auth.currentUser &&
        auth.currentUser.emailVerified;

      if (isUserFullyAuthenticated) {
        // Send message using Firebase
        await sendMessage(selectedConversation.id, newMessage);
        // Messages will be updated via the real-time listener
      } else {
        // Inform user if Firebase is configured but account isn't verified or not VIT
        if (isFirebaseConfigured && auth.currentUser) {
          alert('Messaging requires a verified email. Please verify your email in Firebase and try again.');
          return;
        }
        // Supabase removed: update local state optimistically in mock mode
        const newMsg: Message = {
          id: `${Date.now()}`,
          text: newMessage,
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
      }).catch(() => {});
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
        } catch {}
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
    <div className="max-w-6xl mx-auto p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl mb-2">Messages</h1>
        <p className="opacity-75">Chat with your friends and study partners</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[80vh] md:h-[85vh] lg:h-[88vh]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 flex flex-col h-full overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('conversations')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'conversations'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Messages
                </button>
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors relative ${
                    activeTab === 'requests'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Requests
                  {friendRequests.length > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 w-5 h-5 p-0 text-xs flex items-center justify-center"
                    >
                      {friendRequests.length}
                    </Badge>
                  )}
                </button>
              </div>
              {/* Friend search to start a new chat */}
              <div className="flex-1 ml-3">
                <Input
                  placeholder="Search friends to start a chat..."
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  className="w-full"
                />
                {friendSearch && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
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
                            className="text-xs"
                            style={{ backgroundColor: '#C6ECFF', color: '#000' }}
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
                        className={`p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                          selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200 border' : ''
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
                              <h4 className="font-medium truncate">
                                {conversation.participant.name}
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
                            {!conversation.participant.online && conversation.participant.lastSeen && (
                              <p className="text-xs opacity-50 mt-1">
                                Last seen {formatTime(conversation.participant.lastSeen)}
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
                                style={{ backgroundColor: '#C6ECFF', color: '#000' }}
                                className="hover:opacity-80"
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
        <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <div className="relative">
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
                    <h3 className="font-medium">{selectedConversation.participant.name}</h3>
                    <p className="text-sm opacity-75">
                      {selectedConversation.participant.online 
                        ? 'Online now' 
                        : `Last seen ${formatTime(selectedConversation.participant.lastSeen)}`
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
                        className={`flex ${message.senderId === myId ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-100 text-black`}
                        >
                          <p className="break-words whitespace-pre-wrap">{message.text}</p>
                          <p className="text-xs opacity-60 mt-1">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                
                <div className="border-t p-4 bg-white shrink-0">
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
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleSendMessage}
                      style={{ backgroundColor: '#C6ECFF', color: '#000' }}
                    >
                      Send
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

      {/* Study Groups (embedded in place of previous stats tiles) */}
      <Card className="mt-6">
        <CardContent className="p-4">
          <StudyGroupsPage currentUser={currentUser as any} />
        </CardContent>
      </Card>
    </div>
  );
}
