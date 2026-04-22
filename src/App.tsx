import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { ProfilePage } from './components/ProfilePage';
import { AboutPage } from './components/AboutPage';
import { DiscoverPage } from './components/DiscoverPage';
import { FriendProfilePage } from './components/FriendProfilePage';
import { TimetablePage } from './components/TimetablePage';
import { TimetableWidget } from './components/TimetableWidget';
import { MessagesPage } from './components/MessagesPage';
import { Navigation } from './components/Navigation';
import { auth, isFirebaseConfigured } from './utils/firebase/client';
import { getUserProfile, createUserProfile, getProfile, uploadUserPublicKey } from './utils/firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { initializeE2EE } from './utils/crypto';

export default function App() {
  // Standalone widget route — short-circuits the main app shell.
  // Used for PWA home-screen shortcut, iframe embeds, and mobile widget apps.
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/widget') {
    return <TimetableWidget />;
  }

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewedProfile, setViewedProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Handle authentication state changes and load user data
  useEffect(() => {
    if (isFirebaseConfigured) {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          // User is signed in, load their profile data
          try {
            // Load both collections: users (displayName) and profiles (name)
            const [userProfile, profileDoc] = await Promise.all([
              getUserProfile(user.uid),
              getProfile(user.uid)
            ]);

            if (userProfile || profileDoc) {
              const resolvedName = profileDoc?.name
                || userProfile?.displayName
                || user.displayName
                || user.email?.split('@')[0]
                || 'User';

              setCurrentUser({
                uid: user.uid,
                name: resolvedName,
                email: userProfile?.email || (profileDoc as any)?.email || user.email,
                university: userProfile?.university || (profileDoc as any)?.university,
                year: userProfile?.year || (profileDoc as any)?.year,
                major: userProfile?.major || (profileDoc as any)?.major,
                location: userProfile?.location,
                photoURL: (profileDoc as any)?.photoURL || (userProfile as any)?.photoURL || user.photoURL || undefined,
                isDevelopmentUser: false
              });
              setIsLoggedIn(true);
            } else {
              // User profile doesn't exist, create it (users collection)
              console.log('User profile not found, creating new profile for:', user.uid);
              await createUserProfile(user);

              // Prefer profile name if exists; otherwise fallback to auth/displayName/email
              const profileAfterCreate = await getProfile(user.uid).catch(() => null);
              const fallbackName = profileAfterCreate?.name
                || user.displayName
                || user.email?.split('@')[0]
                || 'User';

              setCurrentUser({
                uid: user.uid,
                name: fallbackName,
                email: user.email,
                photoURL: (profileAfterCreate as any)?.photoURL || user.photoURL || undefined,
                isDevelopmentUser: false
              });
              setIsLoggedIn(true);
            }

            // Always attempt E2EE initialization for signed-in users
            try {
              const pubJWK = await initializeE2EE();
              if (pubJWK) {
                await uploadUserPublicKey(pubJWK);
                console.log('E2EE initialized and public key uploaded automatically.');
              }
            } catch (e) {
              console.error('Failed to initialize E2EE keys:', e);
            }
          } catch (error) {
            console.error('Error loading user profile:', error);
            // Fallback to basic auth data
            setCurrentUser({
              uid: user.uid,
              name: user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email,
              isDevelopmentUser: false
            });
            setIsLoggedIn(true);
          }
        } else {
          // User is signed out
          setCurrentUser(null);
          setIsLoggedIn(false);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // Development mode - check localStorage for demo user
      const savedUser = localStorage.getItem('userProfile');
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          setCurrentUser({ ...userData, isDevelopmentUser: true });
          setIsLoggedIn(true);
        } catch (error) {
          console.error('Error parsing saved user data:', error);
        }
      }
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData: any) => {
    setCurrentUser(userData);
    setIsLoggedIn(true);
    setCurrentPage('home');

    // Save to localStorage in development mode
    if (!isFirebaseConfigured && userData.isDevelopmentUser) {
      localStorage.setItem('userProfile', JSON.stringify(userData));
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentPage('home');

    // Clear localStorage in development mode
    if (!isFirebaseConfigured) {
      localStorage.removeItem('userProfile');
    }

    // Sign out from Firebase if configured
    if (isFirebaseConfigured && auth.currentUser) {
      auth.signOut();
    }
  };

  const handleProfileUpdate = (updatedUser: any) => {
    setCurrentUser(updatedUser);
    console.log('🔄 App: Updated currentUser state with profile changes:', updatedUser);
  };

  // Show loading state while determining authentication status
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <HomePage
            currentUser={currentUser as any}
            onOpenProfile={(user: any) => { setViewedProfile(user); setCurrentPage('friendProfile'); }}
            onNavigate={setCurrentPage}
          />
        );
      case 'profile':
        return <ProfilePage currentUser={currentUser as any} onProfileUpdate={handleProfileUpdate} goToAbout={() => setCurrentPage('about')} />;
      case 'about':
        return <AboutPage />;
      case 'discover':
        return (
          <DiscoverPage
            currentUser={currentUser as any}
            onOpenProfile={(user: any) => { setViewedProfile(user); setCurrentPage('friendProfile'); }}
            onMessage={() => setCurrentPage('messages')}
          />
        );
      case 'timetable':
        return <TimetablePage currentUser={currentUser as any} />;
      case 'messages':
        return (
          <MessagesPage
            currentUser={currentUser as any}
            onOpenProfile={(user: any) => { setViewedProfile(user); setCurrentPage('friendProfile'); }}
          />
        );
      case 'friendProfile':
        return <FriendProfilePage user={viewedProfile as any} onBack={() => setCurrentPage('discover')} onMessage={() => setCurrentPage('messages')} />;
      default:
        return <HomePage currentUser={currentUser} />;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground selection:bg-sky-100 selection:text-sky-900 md:flex-row pb-24 md:pb-0">
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onLogout={handleLogout}
        currentUser={currentUser}
      />
      <main className="relative flex-1 overflow-y-auto bg-background no-scrollbar">
        <div className={currentPage === 'home' ? 'w-full' : 'w-full max-w-4xl mx-auto px-0 md:px-8 py-0 md:py-8'}>
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
