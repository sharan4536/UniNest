import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { ProfilePage } from './components/ProfilePage';
import { AboutPage } from './components/AboutPage';
import { DiscoverPage } from './components/DiscoverPage';
import { FriendProfilePage } from './components/FriendProfilePage';
import { TimetablePage } from './components/TimetablePage';
import { MessagesPage } from './components/MessagesPage';
import { Navigation } from './components/Navigation';
import { auth, isFirebaseConfigured } from './utils/firebase/client';
import { getUserProfile, createUserProfile, getProfile } from './utils/firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
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
                isDevelopmentUser: false
              });
              setIsLoggedIn(true);
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
        return <FriendProfilePage user={viewedProfile as any} onBack={() => setCurrentPage('discover')} />;
      default:
        return <HomePage currentUser={currentUser} />;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAFA' }}>
      <Navigation 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage}
        onLogout={handleLogout}
        currentUser={currentUser}
      />
      <main className="pb-20">
        {renderPage()}
      </main>
    </div>
  );
}
