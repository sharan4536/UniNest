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
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from './client';
import { User } from 'firebase/auth';

// Types
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
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

// Collections
const usersCollection = collection(db, 'users');
const friendRequestsCollection = collection(db, 'friendRequests');
const conversationsCollection = collection(db, 'conversations');
const messagesCollection = collection(db, 'messages');

// Helper: email verification is sufficient for messaging
const isVerifiedEmailUser = () => !!(auth.currentUser && auth.currentUser.emailVerified);

// User Profile Functions
export const createUserProfile = async (user: User, additionalData?: Partial<UserProfile>) => {
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
  if (!auth.currentUser) return;
  
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
  if (!requestId || !senderId || !auth.currentUser) return false;
  
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
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated) return () => {};
  
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
        requests.push({ id: doc.id, ...doc.data() } as FriendRequest);
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
  if (!auth.currentUser) return () => {};

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
        const data = d.data();
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
        const data = d.data();
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
        const data = d.data();
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
        const data = d.data();
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
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated || !auth.currentUser) return () => {};

  const currentUserId = auth.currentUser.uid;

  const unsubscribe = onSnapshot(
    usersCollection,
    (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (!data?.uid || data.uid === currentUserId) return;
        users.push(data);
      });
      callback(users);
    },
    (error) => {
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
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if (auth.currentUser) {
    try { await auth.currentUser.getIdToken(true); } catch {}
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  
  if (!isUserFullyAuthenticated) {
    throw new Error('Authentication required: User must be signed in with a verified VIT email account');
  }
  
  const currentUserId = auth.currentUser.uid;
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
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if (auth.currentUser) {
    try { await auth.currentUser.getIdToken(true); } catch {}
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  
  if (!isUserFullyAuthenticated || !conversationId) {
    throw new Error('Authentication required: User must be signed in with a verified VIT email account');
  }
  
  const senderId = auth.currentUser.uid;
  
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
  // Check comprehensive authentication requirements to match Firestore security rules
  // Trigger token refresh (non-blocking) to update claims before reads
  if (auth.currentUser) {
    auth.currentUser.getIdToken(true).catch(() => {});
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  
  if (!isUserFullyAuthenticated) return () => {};
  
  const userId = auth.currentUser.uid;
  
  // Avoid composite index requirement by removing server-side ordering
  const q = query(
    conversationsCollection,
    where('participants', 'array-contains', userId)
  );
  
  return onSnapshot(
    q,
    (snapshot) => {
      const conversations: Conversation[] = [];
      snapshot.forEach((doc) => {
        conversations.push({ id: doc.id, ...doc.data() } as Conversation);
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
  if (!conversationId) return () => {};
  // Ensure claims (like email_verified) are fresh before reads
  if (auth.currentUser) {
    auth.currentUser.getIdToken(true).catch(() => {});
  }
  const isUserFullyAuthenticated = !!(auth.currentUser && auth.currentUser.emailVerified);
  if (!isUserFullyAuthenticated) return () => {};
  
  const messagesRef = collection(db, `conversations/${conversationId}/messages`);
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  
  return onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() } as Message);
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
  // Check comprehensive authentication requirements to match Firestore security rules
  // Force token refresh to ensure up-to-date email_verified claim in Firestore
  if (auth.currentUser) {
    try { await auth.currentUser.getIdToken(true); } catch {}
  }
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  
  if (!isUserFullyAuthenticated || !conversationId) return;
  
  const userId = auth.currentUser.uid;
  const messagesRef = collection(db, `conversations/${conversationId}/messages`);
  
  const q = query(
    messagesRef,
    where('receiverId', '==', userId),
    where('read', '==', false)
  );
  
  const unreadMessages = await getDocs(q);
  
  const batch = db.batch();
  unreadMessages.forEach((doc) => {
    batch.update(doc.ref, { read: true });
  });
  
  await batch.commit();
  console.log('Messages marked as read');
};

// Subscribe to unread messages across all conversations (collection group)
export const getUnreadMessagesCount = (callback: (count: number) => void) => {
  // Trigger token refresh (non-blocking) to update claims before reads
  if (auth.currentUser) {
    auth.currentUser.getIdToken(true).catch(() => {});
  }
  const isUserFullyAuthenticated = !!(auth.currentUser && auth.currentUser.emailVerified);

  if (!isUserFullyAuthenticated) return () => {};

  const userId = auth.currentUser!.uid;
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

const friendLocationsCollection = collection(db, 'friendLocations');
const timetablesCollection = collection(db, 'timetables');

export const updateUserLocation = async (location: { lat: number; lng: number; name?: string }) => {
  if (!auth.currentUser) return;
  
  const userId = auth.currentUser.uid;
  
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
  if (!auth.currentUser) return;
  const userId = auth.currentUser.uid;
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
  const isUserFullyAuthenticated = isVerifiedEmailUser();
  if (!isUserFullyAuthenticated) return () => {};
  
  const userId = auth.currentUser.uid;
  
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
    
    const friendIds: string[] = [];
    senderRequests.forEach((doc) => {
      const data = doc.data();
      friendIds.push(data.receiverId);
    });
    receiverRequests.forEach((doc) => {
      const data = doc.data();
      friendIds.push(data.senderId);
    });
    
    // Get locations for these friends
    if (friendIds.length === 0) {
      callback([]);
      return () => {};
    }
    
    // Listen to location updates for friends
    const locationQueries = friendIds.map(friendId => 
      doc(friendLocationsCollection, friendId)
    );
    
    const unsubscribes: (() => void)[] = [];
    const locations: { [key: string]: FriendLocation } = {};
    
    locationQueries.forEach(docRef => {
      const unsubscribe = onSnapshot(
        docRef,
        (doc) => {
          if (doc.exists()) {
            const data = doc.data() as FriendLocation;
            locations[doc.id] = { id: doc.id, ...data };
          } else {
            delete locations[doc.id];
          }
          
          // Send updated locations array
          callback(Object.values(locations));
        },
        (error) => {
          console.error('Error subscribing to friend location:', error);
        }
      );
      
      unsubscribes.push(unsubscribe);
    });
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  };
  
  return getFriendsAndLocations();
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
  if (!auth.currentUser) {
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
    console.log('Timetable saved successfully');
  } catch (error) {
    console.error('Error saving timetable:', error);
    throw error;
  }
};

export const loadTimetable = async (): Promise<Record<string, ClassItem[]>> => {
  if (!auth.currentUser) {
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
  if (!auth.currentUser) {
    console.error('User not authenticated');
    throw new Error('User not authenticated');
  }
  
  const userId = auth.currentUser.uid;
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
  const targetUserId = userId || auth.currentUser?.uid;
  
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
  try {
    console.log('🔍 getDiscoverableUsers: Starting...');
    if (!auth.currentUser) {
      console.log('❌ getDiscoverableUsers: No current user');
      return [];
    }
    
    const currentUserId = auth.currentUser.uid;
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
      const data = doc.data();
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
      const data = doc.data();
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
  maxMembers?: number;
  meetingTime?: string;
}

const studyGroupsCollection = collection(db, 'studyGroups');

export const createStudyGroup = async (data: {
  name: string;
  course?: string;
  description?: string;
  maxMembers?: number;
  meetingTime?: string;
}) => {
  if (!auth.currentUser) return null;
  try {
    const docRef = await addDoc(studyGroupsCollection, {
      name: data.name,
      course: data.course || null,
      description: data.description || null,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      members: [auth.currentUser.uid],
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
    return () => {};
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
  if (!auth.currentUser) { callback([]); return () => {}; }
  const q = query(studyGroupsCollection, where('members', 'array-contains', auth.currentUser.uid));
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
  if (!auth.currentUser) return false;
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
  if (!auth.currentUser) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await updateDoc(ref, { members: arrayRemove(auth.currentUser.uid) });
    return true;
  } catch (error) {
    console.error('Error leaving study group:', error);
    return false;
  }
};

// Invite one or more friends to a study group (owner-only per rules)
export const inviteMembersToStudyGroup = async (groupId: string, friendUids: string[]) => {
  if (!auth.currentUser || !groupId || !Array.isArray(friendUids) || friendUids.length === 0) return false;
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
  if (!auth.currentUser || !groupId) return false;
  try {
    const ref = doc(studyGroupsCollection, groupId);
    await deleteDoc(ref);
    return true;
  } catch (error) {
    console.error('Error deleting study group:', error);
    return false;
  }
};
