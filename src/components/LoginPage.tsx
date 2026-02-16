import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectLabel, SelectGroup } from './ui/select';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { auth, db, isFirebaseConfigured } from '../utils/firebase/client';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export function LoginPage({ onLogin }: { onLogin: (profile: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [university, setUniversity] = useState('');
  const [year, setYear] = useState('');
  const [major, setMajor] = useState('');
  const [majorOther, setMajorOther] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo('Password reset email sent! Check your inbox.');
      setError('');
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address');
      } else {
        setError('Error sending password reset email. Please try again.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      // Enforce VIT student email restriction for registration
      if (isSignUp) {
        const allowedDomain = '@vitstudent.ac.in';
        const emailLc = email.trim().toLowerCase();
        if (!emailLc.endsWith(allowedDomain)) {
          setError(`Only VIT student emails are allowed. Please use an email ending with ${allowedDomain}`);
          return;
        }
      }

      if (isFirebaseConfigured) {
        try {
          // Firebase-first path
          if (isSignUp) {
            const creds = await createUserWithEmailAndPassword(auth, email, password);
            // Send verification email and do NOT log in until verified
            await sendEmailVerification(creds.user);
            const uid = creds.user.uid;
            const profile = {
              id: uid,
              name,
              university,
              year,
              major: major === 'OTHER' ? majorOther : major,
            };
            await setDoc(doc(db, 'profiles', uid), profile, { merge: true });
            setInfo('Verification email sent. Please verify your email to continue.');
            return;
          } else {
            const creds = await signInWithEmailAndPassword(auth, email, password);
            if (!creds.user.emailVerified) {
              setError('Please verify your email address. Check your inbox for a verification email.');
              return;
            }
            const uid = creds.user.uid;
            const snap = await getDoc(doc(db, 'profiles', uid));
            const profile = snap.exists() ? snap.data() : { id: uid, name: 'New User' };
            onLogin(profile);
          }
          return;
        } catch (firebaseError: any) {
          console.error('Firebase auth error:', firebaseError);
          
          // Handle specific Firebase errors with user-friendly messages
          if (firebaseError.code === 'auth/invalid-credential') {
            setError('Invalid email or password. Please try again.');
          } else if (firebaseError.code === 'auth/user-not-found') {
            setError('No account found with this email. Please sign up first.');
          } else if (firebaseError.code === 'auth/wrong-password') {
            setError('Incorrect password. Please try again.');
          } else if (firebaseError.code === 'auth/email-already-in-use') {
            setError('This email is already registered. Please sign in instead.');
          } else if (firebaseError.code === 'auth/weak-password') {
            setError('Password is too weak. Please use a stronger password.');
          } else if (firebaseError.code === 'auth/network-request-failed') {
            setError('Network error. Please check your internet connection.');
          } else {
            setError(`Authentication error: ${firebaseError.message}`);
          }
          
          // Don't proceed to fallback for specific Firebase errors
          if (firebaseError.code && firebaseError.code.startsWith('auth/')) {
            setLoading(false);
            return;
          }
          
          // For other errors, continue to fallback
          throw firebaseError;
        }
      }

      // No mock fallback: require Firebase for authentication
      setError('Authentication service not configured. Please configure Firebase.');
      setLoading(false);
      return;
    } catch (error) {
      console.error('Authentication error:', error);
      setError('Unable to authenticate. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#C6ECFF' }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C6ECFF' }}>
            <span className="text-2xl">🏫</span>
          </div>
          <CardTitle className="text-2xl">UniNest</CardTitle>
          <CardDescription>
            Connect with fellow students at your university
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                {error}
              </div>
            )}
            {info && (
              <div className="p-3 bg-blue-100 border border-blue-300 rounded text-blue-700 text-sm">
                {info}
              </div>
            )}
            
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="university">University</Label>
                    <Select value={university} onValueChange={setUniversity}>
                      <SelectTrigger aria-label="Select University">
                        <SelectValue placeholder="Select University" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Available Locations</SelectLabel>
                          <SelectItem value="Vellore">Vellore</SelectItem>
                          <SelectItem value="Chennai">Chennai</SelectItem>
                          <SelectItem value="Bhopal">Bhopal</SelectItem>
                          <SelectItem value="AP">AP</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger aria-label="Select Year">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1st Year">1st Year</SelectItem>
                        <SelectItem value="2nd Year">2nd Year</SelectItem>
                        <SelectItem value="3rd Year">3rd Year</SelectItem>
                        <SelectItem value="4th Year">4th Year</SelectItem>
                        <SelectItem value="5th Year">5th Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="major">Major</Label>
                  <Select value={major} onValueChange={setMajor}>
                    <SelectTrigger aria-label="Select Major">
                      <SelectValue placeholder="Select B.Tech Course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Popular B.Tech</SelectLabel>
                        <SelectItem value="CSE">Computer Science and Engineering (CSE)</SelectItem>
                        <SelectItem value="ECE">Electronics and Communication (ECE)</SelectItem>
                        <SelectItem value="EEE">Electrical and Electronics (EEE)</SelectItem>
                        <SelectItem value="MECH">Mechanical Engineering</SelectItem>
                        <SelectItem value="CIVIL">Civil Engineering</SelectItem>
                        <SelectItem value="CHE">Chemical Engineering</SelectItem>
                        <SelectItem value="IT">Information Technology</SelectItem>
                        <SelectItem value="AIML">AI & ML</SelectItem>
                        <SelectItem value="DS">Data Science</SelectItem>
                        <SelectItem value="BIOTECH">Biotechnology</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectItem value="OTHER">Other...</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {major === 'OTHER' && (
                    <div className="mt-2">
                      <Input id="major-custom" placeholder="Enter your branch" value={majorOther} onChange={(e) => setMajorOther(e.target.value)} />
                    </div>
                  )}
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">University Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@vitstudent.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {isSignUp && (
                <p className="text-xs opacity-70">Only VIT emails are accepted for registration (must end with @vitstudent.ac.in)</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    title="Forgot Password?"
                  >
                    <span>❓</span>
                    <span>Forgot?</span>
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {!isSignUp && error.includes('verify') && (
              <div className="flex items-center justify-between">
                <span className="text-xs opacity-70">Didn’t get the email?</span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={async () => {
                    try {
                      if (auth.currentUser) {
                        await sendEmailVerification(auth.currentUser);
                        setInfo('Verification email re-sent. Please check your inbox.');
                        setError('');
                      } else {
                        // Attempt sign-in silently to get user, then resend
                        const creds = await signInWithEmailAndPassword(auth, email, password);
                        await sendEmailVerification(creds.user);
                        setInfo('Verification email re-sent. Please check your inbox.');
                        setError('');
                      }
                    } catch (err) {
                      setError('Could not send verification email. Please try again later.');
                    }
                  }}
                >
                  Resend verification email
                </button>
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full" 
              style={{ backgroundColor: '#C6ECFF', color: '#000' }}
              disabled={loading}
            >
              {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm underline"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
