import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
  collectionGroup,
  arrayUnion,
  arrayRemove,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './client';
import { User } from 'firebase/auth';

// Types
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  publicKey?: string; // JWK string
  major?: string;
  year?: string;
  bio?: string;
  interests?: string[];
  clubs?: string[]; // Added clubs field
  university?: string;
  status?: 'in class' | 'in library' | 'in ground' | 'in hostel' | 'available';
  location?: {
    lat: number;
    lng: number;
    name?: string;
    timestamp?: Timestamp;
  };
  lastActive?: Timestamp;
  createdAt: Timestamp;
}

export interface FriendRequest {
  id?: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
}

export interface Message {
  id?: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: Timestamp;
  read: boolean;
}

// Event Types
export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  clubId: string;
  clubName: string;
  startTime: Timestamp;
  endTime: Timestamp;
  location: string;
  collegeId: string; // e.g., 'VIT'
  registrationLink?: string;
  stats: {
    attending: number;
    interested: number;
    views: number;
  };
  tags: string[];
  vibeTags?: string[];
  crowdSize?: string;
  buddyMatchingEnabled?: boolean;
  imageUrl?: string;
  createdBy: string;
  createdAt: Timestamp;
}

export interface EventAttendee {
  id?: string;
  eventId: string;
  userId: string;
  status: 'attending' | 'interested';
  isGoingAlone: boolean;
  isPair?: boolean;
  linkedWith?: string | null;
  updatedAt: Timestamp;
}

export interface EventChatMessage {
  id?: string;
  eventId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: Timestamp;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: {
    content: string;
    timestamp: Timestamp;
    senderId: string;
  };
  createdAt: Timestamp;
}

// Connect Features Types
export interface Pulse {
  id?: string;
  text: string;
  createdBy: string;
  location?: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface SOSAlert {
  id?: string;
  course: string;
  topic: string;
  createdBy: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface CheckIn {
  id?: string;
  location: string;
  note?: string;
  createdBy: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// Collections
const usersCollection = isFirebaseConfigured ? collection(db, 'users') : (undefined as any);
const friendRequestsCollection = isFirebaseConfigured ? collection(db, 'friendRequests') : (undefined as any);
const conversationsCollection = isFirebaseConfigured ? collection(db, 'conversations') : (undefined as any);
const messagesCollection = isFirebaseConfigured ? collection(db, 'messages') : (undefined as any);
const eventsCollection = isFirebaseConfigured ? collection(db, 'events') : (undefined as any);
const eventAttendeesCollection = isFirebaseConfigured ? collection(db, 'eventAttendees') : (undefined as any);
const eventChatsCollection = isFirebaseConfigured ? collection(db, 'eventChats') : (undefined as any);

// Helper: email verification is sufficient for messaging
const isVerifiedEmailUser = () => {
  if (!isFirebaseConfigured) return false;
  try {
    return !!(auth && (auth as any).currentUser && (auth as any).currentUser.emailVerified);
  } catch {
    return false;
  }
};

// User Profile Functions
export const createUserProfile = async (user: User, additionalData?: Partial<UserProfile>) => {
  if (!isFirebaseConfigured) return;
  if (!user.uid) return;

  const userRef = doc(usersCollection, user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    const { email, displayName, photoURL } = user;

    try {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName: displayName || email?.split('@')[0] || 'User',
        photoURL: photoURL || null,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        ...additionalData
      });
      console.log('User profile created successfully');
    } catch (error) {
      console.error('Error creating user profile:', error);
    }
  } else {
    // Update last active
    await updateDoc(userRef, {
      lastActive: serverTimestamp()
    });
  }

  return userRef;
};

export const getUserProfile = async (userId: string) => {
  if (!isFirebaseConfigured) return null;
  if (!userId) return null;

  const userRef = doc(usersCollection, userId);
  const userSnapshot = await getDoc(userRef);

  if (userSnapshot.exists()) {
    const userData = userSnapshot.data();
    return {
      uid: userSnapshot.id,
      ...userData
    } as UserProfile;
  }

  return null;
};

export const updateUserProfile = async (userId: string, data: Partial<UserProfile>) => {
  if (!isFirebaseConfigured) return;
  if (!userId) return;

  const userRef = doc(usersCollection, userId);
  try {
    await updateDoc(userRef, {
      ...data,
      lastActive: serverTimestamp()
    });
    console.log('User profile updated successfully');
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
};

// Update profile in the profiles collection (used by ProfilePage)
export const updateProfile = async (userId: string, data: any) => {
  if (!isFirebaseConfigured) return;
  if (!userId) return;

  const profileRef = doc(db, 'profiles', userId);
  try {
    await setDoc(profileRef, {
      ...data,
      id: userId
    }, { merge: true });
    console.log('Profile updated successfully in profiles collection');
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

// Get profile from the profiles collection (used by ProfilePage)
export const getProfile = async (userId: string) => {
  if (!isFirebaseConfigured) return null;
  if (!userId) return null;

  const profileRef = doc(db, 'profiles', userId);
  try {
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      console.log('Profile loaded successfully from profiles collection');
      return profileSnap.data();
    } else {
      console.log('No profile found in profiles collection');
      return null;
    }
  } catch (error) {
    console.error('Error getting profile:', error);
    throw error;
  }
};

// Friend Requests Functions
export const sendFriendRequest = async (receiverId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;

  const senderId = auth.currentUser.uid;

  // Check if request already exists
  const q = query(
    friendRequestsCollection,
    where('senderId', '==', senderId),
    where('receiverId', '==', receiverId)
  );

  const existingRequests = await getDocs(q);
  if (!existingRequests.empty) {
    console.log('Friend request already sent');
    return;
  }

  try {
    await addDoc(friendRequestsCollection, {
      senderId,
      receiverId,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    console.log('Friend request sent successfully');
  } catch (error) {
    console.error('Error sending friend request:', error);
  }
};

export const respondToFriendRequest = async (requestId: string, status: 'accepted' | 'rejected') => {
  if (!isFirebaseConfigured) return;
  if (!requestId) return;

  const requestRef = doc(friendRequestsCollection, requestId);

  try {
    await updateDoc(requestRef, { status });
    console.log(`Friend request ${status} successfully`);
  } catch (error) {
    console.error(`Error ${status} friend request:`, error);
  }
};

// Enhanced function to accept friend request and create conversation
export const acceptFriendRequest = async (requestId: string, senderId: string) => {
  if (!isFirebaseConfigured || !requestId || !senderId || !(auth as any)?.currentUser) return false;

  try {
    // Update friend request status
    const requestRef = doc(friendRequestsCollection, requestId);
    await updateDoc(requestRef, { status: 'accepted' });

    // Create conversation between users
    const conversationId = await createConversation(senderId);

    console.log('Friend request accepted and conversation created successfully');
    return { success: true, conversationId };
  } catch (error) {
    console.error('Error accepting friend request:', error);
    return { success: false, error };
  }
};

// Enhanced function to ignore/reject friend request
export const ignoreFriendRequest = async (requestId: string) => {
  if (!isFirebaseConfigured) return false;
  if (!requestId) return false;

  try {
    const requestRef = doc(friendRequestsCollection, requestId);
    await updateDoc(requestRef, { status: 'rejected' });

    console.log('Friend request ignored successfully');
    return { success: true };
  } catch (error) {
    console.error('Error ignoring friend request:', error);
    return { success: false, error };
  }
};

export const getFriendRequests = (callback: (requests: FriendRequest[]) => void) => {
  if (!isFirebaseConfigured) return () => { };
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated) return () => { };

  const userId = auth.currentUser.uid;

  // Get received requests
  const q = query(
    friendRequestsCollection,
    where('receiverId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const requests: FriendRequest[] = [];
      snapshot.forEach((doc) => {
        requests.push({ id: doc.id, ...(doc.data() as any) } as FriendRequest);
      });
      callback(requests);
    },
    (error) => {
      console.error('Error subscribing to friend requests:', error);
      callback([]);
    }
  );
};

export const getFriends = (callback: (friends: UserProfile[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return () => { };

  const userId = auth.currentUser.uid;

  // Queries for accepted requests where the current user is sender or receiver
  const q1 = query(
    friendRequestsCollection,
    where('senderId', '==', userId),
    where('status', '==', 'accepted')
  );
  const q2 = query(
    friendRequestsCollection,
    where('receiverId', '==', userId),
    where('status', '==', 'accepted')
  );
  // Backward compatibility: support legacy schema with boolean `accepted: true`
  const q1Legacy = query(
    friendRequestsCollection,
    where('senderId', '==', userId),
    where('accepted', '==', true)
  );
  const q2Legacy = query(
    friendRequestsCollection,
    where('receiverId', '==', userId),
    where('accepted', '==', true)
  );

  // Track both sides and emit a UNION list to the callback
  let senderAcceptedIds: string[] = [];
  let receiverAcceptedIds: string[] = [];
  let senderAcceptedLegacyIds: string[] = [];
  let receiverAcceptedLegacyIds: string[] = [];

  const emitUnion = async () => {
    const allIds = Array.from(new Set([
      ...senderAcceptedIds,
      ...receiverAcceptedIds,
      ...senderAcceptedLegacyIds,
      ...receiverAcceptedLegacyIds,
    ]));
    const friends: UserProfile[] = [];
    for (const friendId of allIds) {
      const friend = await getUserProfile(friendId);
      if (friend) friends.push(friend);
    }
    callback(friends);
  };

  const unsubscribe1 = onSnapshot(
    q1,
    async (snapshot) => {
      senderAcceptedIds = snapshot.docs.map((d) => {
        const data: any = d.data() as any;
        return data.receiverId as string;
      });
      await emitUnion();
    },
    (error) => {
      console.error('Error subscribing to sent accepted friend requests:', error);
      callback([]);
    }
  );

  const unsubscribe2 = onSnapshot(
    q2,
    async (snapshot) => {
      receiverAcceptedIds = snapshot.docs.map((d) => {
        const data: any = d.data() as any;
        return data.senderId as string;
      });
      await emitUnion();
    },
    (error) => {
      console.error('Error subscribing to received accepted friend requests:', error);
      callback([]);
    }
  );

  const unsubscribe3 = onSnapshot(
    q1Legacy,
    async (snapshot) => {
      senderAcceptedLegacyIds = snapshot.docs.map((d) => {
        const data: any = d.data() as any;
        return (data.receiverId || data.receiver || data.to) as string;
      }).filter(Boolean);
      await emitUnion();
    },
    (error) => {
      console.error('Error subscribing to sent accepted (legacy) friend requests:', error);
      callback([]);
    }
  );

  const unsubscribe4 = onSnapshot(
    q2Legacy,
    async (snapshot) => {
      receiverAcceptedLegacyIds = snapshot.docs.map((d) => {
        const data: any = d.data() as any;
        return (data.senderId || data.sender || data.from) as string;
      }).filter(Boolean);
      await emitUnion();
    },
    (error) => {
      console.error('Error subscribing to received accepted (legacy) friend requests:', error);
      callback([]);
    }
  );

  return () => {
    unsubscribe1();
    unsubscribe2();
    unsubscribe3();
    unsubscribe4();
  };
};

// Get all registered users (excluding the current user) via realtime subscription
export const getAllUsers = (callback: (users: UserProfile[]) => void) => {
  if (!isFirebaseConfigured) return () => { };
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated || !auth.currentUser) return () => { };

  const currentUserId = (auth as any).currentUser.uid;

  const unsubscribe = onSnapshot(
    usersCollection,
    (snapshot: any) => {
      const users: UserProfile[] = [];
      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data() as UserProfile;
        if (!data?.uid || data.uid === currentUserId) return;
        users.push(data);
      });
      callback(users);
    },
    (error: any) => {
      console.error('Error subscribing to all users:', error);
      callback([]);
    }
  );

  return () => {
    unsubscribe();
  };
};

// Messaging Functions
export const createConversation = async (participantId: string) => {
  if (!isFirebaseConfigured) return null;
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if ((auth as any)?.currentUser) {
    try { await (auth as any).currentUser.getIdToken(true); } catch { }
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();

  if (!isUserFullyAuthenticated) {
    throw new Error('Authentication required: User must be signed in with a verified VIT email account');
  }

  const currentUserId = (auth as any).currentUser.uid;
  const participants = [currentUserId, participantId].sort();

  // Check if conversation already exists
  const q = query(
    conversationsCollection,
    where('participants', '==', participants)
  );

  const existingConversations = await getDocs(q);
  if (!existingConversations.empty) {
    return existingConversations.docs[0].id;
  }

  try {
    const newConversation = await addDoc(conversationsCollection, {
      participants,
      createdAt: serverTimestamp()
    });
    console.log('Conversation created successfully');
    return newConversation.id;
  } catch (error) {
    console.error('Error creating conversation:', error);
    return null;
  }
};

export const sendMessage = async (conversationId: string, content: string) => {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if ((auth as any)?.currentUser) {
    try { await (auth as any).currentUser.getIdToken(true); } catch { }
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();

  if (!isUserFullyAuthenticated || !conversationId) {
    throw new Error('Authentication required: User must be signed in with a verified VIT email account');
  }

  const senderId = (auth as any).currentUser.uid;

  try {
    // Get conversation to find receiver
    const conversationRef = doc(conversationsCollection, conversationId);
    const conversationSnapshot = await getDoc(conversationRef);

    if (!conversationSnapshot.exists()) {
      console.error('Conversation does not exist');
      return;
    }

    const conversationData = conversationSnapshot.data();
    const receiverId = conversationData.participants.find((id: string) => id !== senderId);

    // Add message
    const messageRef = await addDoc(collection(db, `conversations/${conversationId}/messages`), {
      senderId,
      receiverId,
      content,
      timestamp: serverTimestamp(),
      read: false
    });

    // Update conversation with last message
    await updateDoc(conversationRef, {
      lastMessage: {
        content,
        timestamp: serverTimestamp(),
        senderId
      }
    });

    console.log('Message sent successfully');
    return messageRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

export const getConversations = (callback: (conversations: Conversation[]) => void) => {
  if (!isFirebaseConfigured) return () => { };
  // Check comprehensive authentication requirements to match Firestore security rules
  // Trigger token refresh (non-blocking) to update claims before reads
  if ((auth as any)?.currentUser) {
    (auth as any).currentUser.getIdToken(true).catch(() => { });
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();

  if (!isUserFullyAuthenticated) return () => { };

  const userId = (auth as any).currentUser.uid;

  // Avoid composite index requirement by removing server-side ordering
  const q = query(
    conversationsCollection,
    where('participants', 'array-contains', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations: Conversation[] = [];
      snapshot.forEach((doc: any) => {
        conversations.push({ id: doc.id, ...(doc.data() as any) } as Conversation);
      });
      // Sort client-side by lastMessage.timestamp or createdAt
      const sorted = conversations.sort((a, b) => {
        const ta = a.lastMessage?.timestamp || a.createdAt;
        const tb = b.lastMessage?.timestamp || b.createdAt;
        const va = ta?.toMillis ? ta.toMillis() : (ta as any);
        const vb = tb?.toMillis ? tb.toMillis() : (tb as any);
        return vb - va;
      });
      callback(sorted);
    },
    (error) => {
      console.error('Error subscribing to conversations:', error);
      callback([]);
    }
  );
};

export const getMessages = (conversationId: string, callback: (messages: Message[]) => void) => {
  if (!isFirebaseConfigured) return () => { };
  if (!conversationId) return () => { };
  // Ensure claims (like email_verified) are fresh before reads
  if ((auth as any)?.currentUser) {
    (auth as any).currentUser.getIdToken(true).catch(() => { });
  }
  const isUserFullyAuthenticated = !!((auth as any)?.currentUser && (auth as any).currentUser.emailVerified);
  if (!isUserFullyAuthenticated) return () => { };

  const messagesRef = collection(db, `conversations/${conversationId}/messages`);
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = [];
      snapshot.forEach((doc: any) => {
        messages.push({ id: doc.id, ...(doc.data() as any) } as Message);
      });
      callback(messages);
    },
    (error) => {
      console.error('Error subscribing to messages:', error);
      callback([]);
    }
  );
};

export const markMessagesAsRead = async (conversationId: string) => {
  if (!isFirebaseConfigured) return;
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if ((auth as any)?.currentUser) {
    try { await (auth as any).currentUser.getIdToken(true); } catch { }
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();

  if (!isUserFullyAuthenticated || !conversationId) return;

  const userId = (auth as any).currentUser.uid;
  const messagesRef = collection(db, `conversations/${conversationId}/messages`);

  const q = query(
    messagesRef,
    where('receiverId', '==', userId),
    where('read', '==', false)
  );

  const unreadMessages = await getDocs(q);

  const batch = writeBatch(db);
  unreadMessages.forEach((doc) => {
    batch.update(doc.ref, { read: true });
  });

  await batch.commit();
  console.log('Messages marked as read');
};

// Subscribe to unread messages across all conversations (collection group)
export const getUnreadMessagesCount = (callback: (count: number) => void) => {
  if (!isFirebaseConfigured) return () => { };
  // Trigger token refresh (non-blocking) to update claims before reads
  if ((auth as any)?.currentUser) {
    (auth as any).currentUser.getIdToken(true).catch(() => { });
  }
  const isUserFullyAuthenticated = !!((auth as any)?.currentUser && (auth as any).currentUser.emailVerified);

  if (!isUserFullyAuthenticated) return () => { };

  const userId = (auth as any)!.currentUser.uid;
  const q = query(
    collectionGroup(db, 'messages'),
    where('receiverId', '==', userId),
    where('read', '==', false)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.size);
    },
    (error) => {
      console.error('Error subscribing to unread messages count:', error);
      callback(0);
    }
  );
};

// Location Functions
export interface FriendLocation {
  id?: string;
  uid: string;
  displayName: string;
  major?: string;
  photoURL?: string;
  location: {
    lat: number;
    lng: number;
    name?: string;
  };
  updatedAt: Timestamp;
}

// Timetable Types
export interface ClassItem {
  id: number;
  course: string;
  title: string;
  time: string;
  duration: number;
  location: string;
  academicBlock?: string;
  professor?: string;
}

export interface UserTimetable {
  uid: string;
  timetable: Record<string, ClassItem[]>; // day -> classes
  lastUpdated: Timestamp;
}

const friendLocationsCollection = isFirebaseConfigured ? collection(db, 'friendLocations') : (undefined as any);
const timetablesCollection = isFirebaseConfigured ? collection(db, 'timetables') : (undefined as any);

export const updateUserLocation = async (location: { lat: number; lng: number; name?: string }) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;

  const userId = (auth as any).currentUser.uid;

  try {
    // Update user profile with location
    await updateUserProfile(userId, {
      location: {
        ...location,
        timestamp: serverTimestamp() as any
      }
    });

    // Also update the friendLocations collection for real-time map updates
    const userProfile = await getUserProfile(userId);
    if (userProfile) {
      const locationRef = doc(friendLocationsCollection, userId);
      await setDoc(locationRef, {
        uid: userId,
        displayName: userProfile.displayName,
        major: userProfile.major || 'Unknown Major',
        photoURL: userProfile.photoURL || null,
        location,
        updatedAt: serverTimestamp()
      });
    }

    console.log('Location updated successfully');
  } catch (error) {
    console.error('Error updating location:', error);
  }
};

// Clear current user's location from both profile and friendLocations collection
export const clearUserLocation = async () => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;
  try {
    // Remove real-time location document
    const locationRef = doc(friendLocationsCollection, userId);
    await deleteDoc(locationRef);

    // Null out profile location; using null to explicitly clear in Firestore
    await updateUserProfile(userId, {
      location: null as any,
    });

    console.log('Location cleared successfully');
  } catch (error) {
    console.error('Error clearing location:', error);
  }
};

export const getFriendLocations = (callback: (locations: FriendLocation[]) => void) => {
  if (!isFirebaseConfigured) return () => { };
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated) return () => { };

  const userId = (auth as any).currentUser.uid;

  // Get friend locations for accepted friends only
  const getFriendsAndLocations = async () => {
    // Get accepted friend requests where user is sender
    const q1 = query(
      friendRequestsCollection,
      where('senderId', '==', userId),
      where('status', '==', 'accepted')
    );

    // Get accepted friend requests where user is receiver
    const q2 = query(
      friendRequestsCollection,
      where('receiverId', '==', userId),
      where('status', '==', 'accepted')
    );

    const [senderRequests, receiverRequests] = await Promise.all([
      getDocs(q1),
      getDocs(q2)
    ]);

    // Extract friend IDs
    const friendIds = new Set<string>();
    senderRequests.forEach(doc => friendIds.add((doc.data() as any).receiverId));
    receiverRequests.forEach(doc => friendIds.add((doc.data() as any).senderId));

    // Get locations for these friends
    const locations: FriendLocation[] = [];

    // We can't query with "in" because of limits (max 10), so we'll query all locations
    // This isn't scalable for huge userbase but fine for MVP
    const locationsSnapshot = await getDocs(friendLocationsCollection);

    locationsSnapshot.forEach(doc => {
      const data = doc.data() as FriendLocation;
      // Only include if they are in the friend list
      if (friendIds.has(data.uid)) {
        locations.push({ id: doc.id, ...data });
      }
    });

    callback(locations);
  };

  getFriendsAndLocations();

  // Return empty unsubscribe since we're not setting up a real listener here
  // Real implementation woud require complex listeners
  return () => { };
};

// Event Functions
export const getUpcomingEvents = async (collegeId: string = 'VIT'): Promise<CampusEvent[]> => {
  if (!isFirebaseConfigured) return [];

  const now = Timestamp.now();
  const q = query(
    eventsCollection,
    where('collegeId', '==', collegeId),
    where('endTime', '>=', now),
    orderBy('endTime', 'asc') // Firestore requires index for inequality filter on same field if ordering
    // Ideally order by startTime, but that requires composite index. 
    // For now, simple query, sort client side if needed
  );

  try {
    const snapshot = await getDocs(q);
    const events: CampusEvent[] = [];
    snapshot.forEach(doc => {
      events.push({ id: doc.id, ...(doc.data() as any) } as CampusEvent);
    });
    // Sort by startTime
    return events.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
};

export const markEventInterest = async (eventId: string, status: 'attending' | 'interested' | 'none', isGoingAlone: boolean = false, isPair: boolean = false, linkedWith: string | null = null) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;

  try {
    // Check if record exists
    const q = query(
      eventAttendeesCollection,
      where('eventId', '==', eventId),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);

    const eventRef = doc(eventsCollection, eventId);

    if (!snapshot.empty) {
      const docId = snapshot.docs[0].id;
      const docRef = doc(eventAttendeesCollection, docId);
      const oldStatus = (snapshot.docs[0].data() as any).status;

      if (status === 'none') {
        await deleteDoc(docRef);
        // Decrement stats
        await updateDoc(eventRef, {
          [`stats.${oldStatus}`]: increment(-1)
        } as any);
      } else {
        await updateDoc(docRef, {
          status,
          isGoingAlone,
          isPair,
          linkedWith,
          updatedAt: serverTimestamp()
        });

        // Update stats if status changed
        if (oldStatus !== status) {
          const batch = writeBatch(db);
          await updateDoc(eventRef, {
            [`stats.${oldStatus}`]: increment(-1),
            [`stats.${status}`]: increment(1)
          } as any);
        }
      }
    } else if (status !== 'none') {
      await addDoc(eventAttendeesCollection, {
        eventId,
        userId,
        status,
        isGoingAlone,
        isPair,
        linkedWith,
        updatedAt: serverTimestamp()
      });
      // Increment stats
      await updateDoc(eventRef, {
        [`stats.${status}`]: increment(1)
      } as any);
    }
  } catch (error) {
    console.error('Error updating event interest:', error);
  }
};

export const getEventAttendees = async (eventId: string): Promise<EventAttendee[]> => {
  if (!isFirebaseConfigured) return [];
  const q = query(
    eventAttendeesCollection,
    where('eventId', '==', eventId)
  );
  try {
    const snapshot = await getDocs(q);
    const attendees: EventAttendee[] = [];
    snapshot.forEach(doc => attendees.push({ id: doc.id, ...(doc.data() as any) } as EventAttendee));
    return attendees;
  } catch (e) {
    console.error('Error fetching event attendees', e);
    return [];
  }
};

// Seed function for testing
export const seedTestEvent = async () => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;

  // Create a time 2 hours from now
  const start = new Date();
  start.setHours(start.getHours() + 2);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  await addDoc(eventsCollection, {
    title: "Hackathon 2026 Kickoff",
    description: "Join us for the biggest hackathon of the semester! Free food, prizes, and mentorship.",
    clubId: "club_123",
    clubName: "Google Developer Student Club",
    startTime: Timestamp.fromDate(start),
    endTime: Timestamp.fromDate(end),
    location: "SJT 4th Floor",
    collegeId: "VIT",
    registrationLink: "https://vit.ac.in",
    stats: { attending: 12, interested: 45, views: 120 },
    tags: ["Coding", "Hackathon", "Tech"],
    createdBy: userId,
    createdAt: serverTimestamp()
  });
  console.log("Seeded test event");
};

export const createCampusEvent = async (eventData: Partial<CampusEvent>) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return null;
  const userId = (auth as any).currentUser.uid;

  try {
    const docRef = await addDoc(eventsCollection, {
      ...eventData,
      stats: { attending: 0, interested: 0, views: 0 },
      createdBy: userId,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    return null;
  }
};

// Event Chat Functions
export const sendEventMessage = async (eventId: string, content: string, userAvatar?: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const user = (auth as any).currentUser;
  const userId = user.uid;
  const userName = user.displayName || 'Anonymous';

  try {
    await addDoc(eventChatsCollection, {
      eventId,
      userId,
      userName,
      userAvatar: userAvatar || user.photoURL || '',
      content,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error sending event message:', error);
  }
};

export const subEventMessages = (eventId: string, callback: (msgs: EventChatMessage[]) => void) => {
  if (!isFirebaseConfigured) return () => { };

  const q = query(
    eventChatsCollection,
    where('eventId', '==', eventId),
    orderBy('timestamp', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const msgs: EventChatMessage[] = [];
    snapshot.forEach(doc => msgs.push({ id: doc.id, ...(doc.data() as any) } as EventChatMessage));
    callback(msgs);
  }, (err) => {
    console.error('Error subscribing to event messages:', err);
  });
};

export const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });
};

// Timetable Functions
export const saveTimetable = async (timetableData: Record<string, ClassItem[]>) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) {
    console.error('User not authenticated');
    return;
  }

  const userId = auth.currentUser.uid;
  const timetableRef = doc(timetablesCollection, userId);

  try {
    await setDoc(timetableRef, {
      uid: userId,
      timetable: timetableData,
      lastUpdated: serverTimestamp()
    });
    // Mirror to a public-readable snapshot used by the iOS / Android
    // home-screen widgets (no auth = no token refresh issues for widgets).
    // If the rule doesn't allow the write (e.g. older deployment), silently
    // swallow the error — the main timetable save already succeeded.
    try {
      await setDoc(doc(db, 'publicWidgets', userId), {
        uid: userId,
        timetable: timetableData,
        updatedAt: serverTimestamp(),
      });
    } catch (mirrorErr) {
      console.warn('publicWidgets mirror skipped:', (mirrorErr as Error)?.message);
    }
    console.log('Timetable saved successfully');
  } catch (error) {
    console.error('Error saving timetable:', error);
    throw error;
  }
};

export const loadTimetable = async (): Promise<Record<string, ClassItem[]>> => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) {
    console.error('User not authenticated');
    return {};
  }

  const userId = auth.currentUser.uid;
  const timetableRef = doc(timetablesCollection, userId);

  try {
    const timetableSnapshot = await getDoc(timetableRef);

    if (timetableSnapshot.exists()) {
      const data = timetableSnapshot.data() as UserTimetable;
      console.log('Timetable loaded successfully');
      return data.timetable || {};
    } else {
      console.log('No timetable found for user, returning empty timetable');
      return {};
    }
  } catch (error) {
    console.error('Error loading timetable:', error);
    return {};
  }
};

// Friend Timetable Functions
export const getFriendTimetable = async (friendUserId: string): Promise<Record<string, ClassItem[]>> => {
  if (!isFirebaseConfigured) return {};
  try {
    const timetableRef = doc(timetablesCollection, friendUserId);
    const timetableSnapshot = await getDoc(timetableRef);

    if (timetableSnapshot.exists()) {
      const data = timetableSnapshot.data() as UserTimetable;
      console.log('Friend timetable loaded successfully for user:', friendUserId);
      return data.timetable || {};
    } else {
      console.log('No timetable found for friend:', friendUserId);
      return {};
    }
  } catch (error) {
    console.error('Error loading friend timetable:', error);
    return {};
  }
};

// Enhanced Friend Profile Data
export interface EnhancedFriendProfile extends UserProfile {
  timetable?: Array<{ day: string; time: string; title: string; where?: string }>;
  sharedCourses?: string[];
  mutualFriends?: number;
}

export const getEnhancedFriendProfile = async (friendUserId: string): Promise<EnhancedFriendProfile | null> => {
  if (!isFirebaseConfigured) return null;
  try {
    // Get basic profile
    const profile = await getUserProfile(friendUserId);
    if (!profile) return null;

    // Get timetable
    const timetableData = await getFriendTimetable(friendUserId);

    // Convert timetable format for UI
    const timetableArray: Array<{ day: string; time: string; title: string; where?: string }> = [];
    Object.entries(timetableData).forEach(([day, classes]) => {
      classes.forEach((classItem) => {
        timetableArray.push({
          day: day,
          time: classItem.time,
          title: classItem.title || classItem.course,
          where: classItem.location || classItem.academicBlock
        });
      });
    });

    // TODO: Calculate shared courses and mutual friends
    const sharedCourses: string[] = [];
    const mutualFriends = 0;

    return {
      ...profile,
      timetable: timetableArray,
      sharedCourses,
      mutualFriends
    };
  } catch (error) {
    console.error('Error getting enhanced friend profile:', error);
    return null;
  }
};

// Status update functions
export const updateUserStatus = async (status: 'in class' | 'in library' | 'in ground' | 'in hostel' | 'available') => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) {
    console.error('User not authenticated');
    throw new Error('User not authenticated');
  }

  const userId = (auth as any).currentUser.uid;
  const userRef = doc(usersCollection, userId);

  try {
    await updateDoc(userRef, {
      status,
      lastActive: serverTimestamp()
    });
    console.log('User status updated successfully');
  } catch (error: any) {
    console.error('Error updating user status:', error);

    // If document doesn't exist, create it with setDoc and merge
    if (error.code === 'not-found') {
      console.log('User document not found, creating with setDoc...');
      try {
        await setDoc(userRef, {
          uid: userId,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
          status,
          lastActive: serverTimestamp(),
          createdAt: serverTimestamp()
        }, { merge: true });
        console.log('User document created and status updated successfully');
      } catch (createError) {
        console.error('Error creating user document:', createError);
        throw createError;
      }
    } else {
      throw error;
    }
  }
};

export const getUserStatus = async (userId?: string): Promise<string | null> => {
  const targetUserId = userId || (isFirebaseConfigured ? (auth as any)?.currentUser?.uid : undefined);

  if (!targetUserId) {
    console.error('No user ID provided');
    return null;
  }

  const userRef = doc(usersCollection, targetUserId);

  try {
    const userSnapshot = await getDoc(userRef);

    if (userSnapshot.exists()) {
      const userData = userSnapshot.data() as UserProfile;
      return userData.status || 'available';
    } else {
      console.log('User not found');
      return null;
    }
  } catch (error) {
    console.error('Error getting user status:', error);
    return null;
  }
};

// Get discoverable users (all users except current user and existing friends)
export const getDiscoverableUsers = async (): Promise<UserProfile[]> => {
  if (!isFirebaseConfigured) return [];
  try {
    console.log('🔍 getDiscoverableUsers: Starting...');
    if (!(auth as any)?.currentUser) {
      console.log('❌ getDiscoverableUsers: No current user');
      return [];
    }

    const currentUserId = (auth as any).currentUser.uid;
    console.log('👤 getDiscoverableUsers: Current user ID:', currentUserId);

    // Get all users
    console.log('📊 getDiscoverableUsers: Fetching all users...');
    const usersSnapshot = await getDocs(usersCollection);
    console.log('📊 getDiscoverableUsers: Total documents in users collection:', usersSnapshot.size);

    const allUsers: UserProfile[] = [];

    usersSnapshot.forEach((doc) => {
      const userData = doc.data() as UserProfile;
      console.log('👥 getDiscoverableUsers: Found user:', userData.uid, userData.displayName);
      // Exclude current user
      if (userData.uid !== currentUserId) {
        allUsers.push(userData);
      } else {
        console.log('🚫 getDiscoverableUsers: Excluding current user:', userData.uid);
      }
    });

    console.log('👥 getDiscoverableUsers: All users (excluding current):', allUsers.length);

    // Get existing friends to exclude them
    const friendIds = new Set<string>();

    // Get friend requests where current user is sender
    console.log('🤝 getDiscoverableUsers: Checking sent friend requests...');
    const sentRequestsQuery = query(
      friendRequestsCollection,
      where('senderId', '==', currentUserId),
      where('status', '==', 'accepted')
    );
    const sentRequestsSnapshot = await getDocs(sentRequestsQuery);
    console.log('📤 getDiscoverableUsers: Sent friend requests:', sentRequestsSnapshot.size);
    sentRequestsSnapshot.forEach((doc) => {
      const data: any = doc.data() as any;
      friendIds.add(data.receiverId);
      console.log('🤝 getDiscoverableUsers: Friend (sent request):', data.receiverId);
    });

    // Get friend requests where current user is receiver
    console.log('🤝 getDiscoverableUsers: Checking received friend requests...');
    const receivedRequestsQuery = query(
      friendRequestsCollection,
      where('receiverId', '==', currentUserId),
      where('status', '==', 'accepted')
    );
    const receivedRequestsSnapshot = await getDocs(receivedRequestsQuery);
    console.log('📥 getDiscoverableUsers: Received friend requests:', receivedRequestsSnapshot.size);
    receivedRequestsSnapshot.forEach((doc) => {
      const data: any = doc.data() as any;
      friendIds.add(data.senderId);
      console.log('🤝 getDiscoverableUsers: Friend (received request):', data.senderId);
    });

    console.log('🤝 getDiscoverableUsers: Total friends to exclude:', friendIds.size);

    // Filter out existing friends
    const discoverableUsers = allUsers.filter(user => !friendIds.has(user.uid));
    console.log('✅ getDiscoverableUsers: Final discoverable users:', discoverableUsers.length);

    return discoverableUsers;
  } catch (error) {
    console.error('❌ getDiscoverableUsers: Error:', error);
    return [];
  }
};

// Study Groups types and helpers
export interface StudyGroup {
  id?: string;
  name: string;
  course?: string;
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  members: string[];
  joinRequests?: string[];
  maxMembers?: number;
  meetingTime?: string;
}

const studyGroupsCollection = isFirebaseConfigured ? collection(db, 'studyGroups') : (undefined as any);

export const createStudyGroup = async (data: {
  name: string;
  course?: string;
  description?: string;
  maxMembers?: number;
  meetingTime?: string;
}) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return null;
  try {
    const docRef = await addDoc(studyGroupsCollection, {
      name: data.name,
      course: data.course || null,
      description: data.description || null,
      createdBy: (auth as any).currentUser.uid,
      createdAt: serverTimestamp(),
      members: [(auth as any).currentUser.uid],
      joinRequests: [],
      maxMembers: data.maxMembers || null,
      meetingTime: data.meetingTime || null,
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating study group:', error);
    return null;
  }
};

export const getStudyGroups = (callback: (groups: StudyGroup[]) => void) => {
  // Guard subscription behind authentication to align with Firestore rules
  if (!auth.currentUser) {
    callback([]);
    return () => { };
  }

  const q = query(studyGroupsCollection, orderBy('createdAt'));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const groups: StudyGroup[] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      callback(groups);
    },
    (error) => {
      console.error('Error subscribing to study groups:', error);
      callback([]);
    }
  );
  return unsubscribe;
};

export const getMyStudyGroups = (callback: (groups: StudyGroup[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) { callback([]); return () => { }; }
  const q = query(studyGroupsCollection, where('members', 'array-contains', (auth as any).currentUser.uid));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const groups: StudyGroup[] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    callback(groups);
  }, (error) => {
    console.error('Error subscribing to my study groups:', error);
    callback([]);
  });
  return unsubscribe;
};

export const joinStudyGroup = async (groupId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { members: arrayUnion(auth.currentUser.uid) });
    return true;
  } catch (error) {
    console.error('Error joining study group:', error);
    return false;
  }
};

export const leaveStudyGroup = async (groupId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { members: arrayRemove(auth.currentUser.uid) });
    return true;
  } catch (error) {
    console.error('Error leaving study group:', error);
    return false;
  }
};

export const requestToJoinStudyGroup = async (groupId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { joinRequests: arrayUnion(auth.currentUser.uid) });
    return true;
  } catch (error) {
    console.error('Error requesting to join study group:', error);
    return false;
  }
};

export const approveJoinRequest = async (groupId: string, userId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    // Requires two operations: remove from requests, add to members
    await updateDoc(ref, {
      joinRequests: arrayRemove(userId),
      members: arrayUnion(userId)
    });
    return true;
  } catch (error) {
    console.error('Error approving join request:', error);
    return false;
  }
};

export const rejectJoinRequest = async (groupId: string, userId: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { joinRequests: arrayRemove(userId) });
    return true;
  } catch (error) {
    console.error('Error rejecting join request:', error);
    return false;
  }
};

// Invite one or more friends to a study group (owner-only per rules)
export const inviteMembersToStudyGroup = async (groupId: string, friendUids: string[]) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser || !groupId || !Array.isArray(friendUids) || friendUids.length === 0) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { members: arrayUnion(...friendUids) });
    return true;
  } catch (error) {
    console.error('Error inviting members to study group:', error);
    return false;
  }
};

// Delete a study group (owner-only per rules)
export const deleteStudyGroup = async (groupId: string): Promise<boolean> => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser || !groupId) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await deleteDoc(ref);
    return true;
  } catch (error) {
    console.error('Error deleting study group:', error);
    return false;
  }
};

// --- Study Group Chat ---
export interface StudyGroupMessage {
  id?: string;
  senderId: string;
  content: string;
  timestamp: Timestamp;
}

export const sendGroupMessage = async (groupId: string, content: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return null;
  try {
    const messagesRef = collection(db, 'studyGroups', groupId, 'messages');
    const docRef = await addDoc(messagesRef, {
      senderId: (auth as any).currentUser.uid,
      content,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error sending group message:', error);
    return null;
  }
};

export const getGroupMessages = (groupId: string, callback: (messages: StudyGroupMessage[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) {
    callback([]);
    return () => { };
  }

  const messagesRef = collection(db, 'studyGroups', groupId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StudyGroupMessage[];
    callback(messages);
  }, (error) => {
    console.error('Error getting group messages:', error);
    callback([]);
  });

  return unsubscribe;
};

// E2EE Key Management
export const uploadUserPublicKey = async (publicKeyJWK: JsonWebKey) => {
  if (!isFirebaseConfigured || !(auth as any).currentUser) return;
  const uid = (auth as any).currentUser.uid;
  try {
    const userRef = doc(usersCollection, uid);
    await updateDoc(userRef, {
      publicKey: JSON.stringify(publicKeyJWK),
      updatedAt: serverTimestamp()
    });
    console.log("Public Key uploaded to Firestore");
  } catch (error) {
    console.error("Error uploading public key", error);
  }
};

export const getUserPublicKey = async (userId: string): Promise<JsonWebKey | null> => {
  if (!isFirebaseConfigured) return null;
  try {
    const userRef = doc(usersCollection, userId);
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data().publicKey) {
      return JSON.parse(snap.data().publicKey);
    }
    return null;
  } catch (error) {
    console.warn(`Could not fetch public key for user ${userId}`, error);
    return null;
  }
};
// ------ CONNECT FEATURES HELPER FUNCTIONS ------

// 1. Pulses
export const createPulse = async (text: string, durationMinutes: number, location?: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;
  const expiresAt = new Date(Date.now() + durationMinutes * 60000);
  
  try {
    const pulseRef = doc(db, 'pulses', userId);
    await setDoc(pulseRef, {
      text,
      createdBy: userId,
      location: location || null,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating pulse:', error);
  }
};

export const getPulses = (callback: (pulses: Pulse[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return () => {};
  
  const q = query(
    collection(db, 'pulses'),
    where('expiresAt', '>', Timestamp.now())
  );

  return onSnapshot(q, (snapshot) => {
    const pulses: Pulse[] = [];
    snapshot.forEach(doc => pulses.push({ id: doc.id, ...doc.data() } as Pulse));
    callback(pulses);
  }, error => {
    console.error('Error listening to pulses:', error);
    callback([]);
  });
};

// 2. Private Interest
export const markPrivateInterest = async (eventId: string, interested: boolean) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;
  
  const interestRef = doc(db, `eventInterest/${eventId}/interested/${userId}`);
  
  try {
    if (interested) {
      await setDoc(interestRef, { timestamp: serverTimestamp() });
    } else {
      await deleteDoc(interestRef);
    }
  } catch (error) {
    console.error('Error marking private interest:', error);
  }
};

export const getPrivateInterestCount = (eventId: string, callback: (count: number) => void) => {
  if (!isFirebaseConfigured) return () => {};
  
  const q = collection(db, `eventInterest/${eventId}/interested`);
  
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size);
  }, error => {
    console.error('Error in private interest count:', error);
    callback(0);
  });
};

// 4. Study SOS
export const createSOSAlert = async (course: string, topic: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;
  const expiresAt = new Date(Date.now() + 2 * 60 * 60000); // 2 hours
  
  try {
    const sosRef = doc(db, 'sos', userId);
    await setDoc(sosRef, {
      course,
      topic,
      createdBy: userId,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating SOS alert:', error);
  }
};

export const getSOSAlerts = (callback: (alerts: SOSAlert[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return () => {};
  
  const q = query(
    collection(db, 'sos'),
    where('expiresAt', '>', Timestamp.now())
  );

  return onSnapshot(q, (snapshot) => {
    const alerts: SOSAlert[] = [];
    snapshot.forEach(doc => alerts.push({ id: doc.id, ...doc.data() } as SOSAlert));
    callback(alerts);
  }, error => {
    console.error('Error listening to SOS alerts:', error);
    callback([]);
  });
};

// 5. Canteen/Location Check-In
export const createCheckIn = async (location: string, note?: string) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return;
  const userId = (auth as any).currentUser.uid;
  const expiresAt = new Date(Date.now() + 60 * 60000); // 1 hour
  
  try {
    const checkinRef = doc(db, 'checkins', userId);
    await setDoc(checkinRef, {
      location,
      note: note || null,
      createdBy: userId,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating checkin:', error);
  }
};

export const getCheckIns = (callback: (checkins: CheckIn[]) => void) => {
  if (!isFirebaseConfigured || !(auth as any)?.currentUser) return () => {};
  
  const q = query(
    collection(db, 'checkins'),
    where('expiresAt', '>', Timestamp.now())
  );

  return onSnapshot(q, (snapshot) => {
    const checkins: CheckIn[] = [];
    snapshot.forEach(doc => checkins.push({ id: doc.id, ...doc.data() } as CheckIn));
    callback(checkins);
  }, error => {
    console.error('Error listening to CheckIns:', error);
    callback([]);
  });
};
