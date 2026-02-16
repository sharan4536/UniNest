import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Production configuration only
const isUsingEmulators = false;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_APP_ID?.split(':')[1],
};

// Log Firebase config for debugging (without sensitive data)
console.log('Firebase config check:', {
  apiKeyExists: Boolean(firebaseConfig.apiKey),
  authDomainExists: Boolean(firebaseConfig.authDomain),
  projectIdExists: Boolean(firebaseConfig.projectId),
  appIdExists: Boolean(firebaseConfig.appId),
  usingEmulators: isUsingEmulators
});

// Check if Firebase is properly configured with production credentials
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

// Initialize Firebase app
export const app = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : undefined as any;

// Initialize Firebase services
export const auth = isFirebaseConfigured ? getAuth(app) : undefined as any;
// Use long polling to avoid network issues in local dev and restricted networks
export const db = isFirebaseConfigured 
  ? initializeFirestore(app, { 
      // Improve reliability in restrictive/dev networks
      experimentalForceLongPolling: true,
      // Disable fetch streams to avoid proxy/CDN issues causing 400s
      useFetchStreams: false,
    })
  : undefined as any;

// Initialize Firebase Storage
export const storage = isFirebaseConfigured ? getStorage(app) : undefined as any;

// No emulators in production mode
