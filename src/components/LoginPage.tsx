import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectLabel, SelectGroup } from './ui/select';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
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

  const handleGoogleLogin = () => {
    setError('Google login not implemented yet.');
  };

  const handleDemoLogin = (role: string) => {
    setError(`Demo login for ${role} not implemented yet.`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-sky-50 relative overflow-hidden">
      {/* Background decoration with dreamy clouds/blobs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200/30 blur-[100px] floating" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-sky-200/30 blur-[100px] floating" style={{ animationDelay: '-2s' }} />
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] rounded-full bg-indigo-200/20 blur-[80px] floating" style={{ animationDelay: '-4s' }} />
      </div>

      <Card className="w-full max-w-md glass-panel border-white/60 relative z-10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] slide-up-fade">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-sky-400 to-blue-500 shadow-lg shadow-sky-200/50 text-white transform hover:scale-110 transition-transform duration-300">
            <span className="text-4xl drop-shadow-sm">🏫</span>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600 font-heading tracking-tight">UniNest</CardTitle>
            <CardDescription className="text-slate-500 text-lg font-medium">
              Connect. Collaborate. Campus Life.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50/80 border border-red-100 rounded-2xl text-red-600 text-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-2 flex items-center justify-center">
                {error}
              </div>
            )}
            {info && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-primary text-sm backdrop-blur-sm">
                {info}
              </div>
            )}

            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name" className="ml-1 text-slate-600 font-medium">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="rounded-xl border-slate-200 bg-white/50 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all duration-300 h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="university">University</Label>
                    <Select value={university} onValueChange={setUniversity}>
                      <SelectTrigger aria-label="Select University" className="bg-white/50 border-input">
                        <SelectValue placeholder="Select University" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-input">
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
                      <SelectTrigger aria-label="Select Year" className="bg-white/50 border-input">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-input">
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
                    <SelectTrigger aria-label="Select Major" className="bg-white/50 border-input">
                      <SelectValue placeholder="Select B.Tech Course" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-input">
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
                      <Input
                        id="major-custom"
                        placeholder="Enter your branch"
                        value={majorOther}
                        onChange={(e) => setMajorOther(e.target.value)}
                        className="bg-white/50 border-input"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="ml-1 text-slate-600 font-medium">University Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@vitstudent.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl border-slate-200 bg-white/50 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all duration-300 h-11"
              />
              {isSignUp && (
                <p className="text-xs text-slate-400 ml-1">Must end with @vitstudent.ac.in</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="ml-1 text-slate-600 font-medium">Password</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-sky-500 hover:text-sky-600 flex items-center gap-1 transition-colors font-medium"
                    title="Forgot Password?"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border-slate-200 bg-white/50 focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 transition-all duration-300 h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-bold shadow-lg shadow-sky-200/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? <span className="animate-pulse">Processing...</span> : (isSignUp ? 'Create Account' : 'Sign In')}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-slate-500 hover:text-sky-600 transition-colors font-medium"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-slate-100/50 pt-6">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white/80 backdrop-blur px-2 text-slate-400 font-medium">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full">
            <Button
              variant="outline"
              onClick={() => handleDemoLogin('student')}
              disabled={loading}
              className="rounded-xl border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 h-10 transition-all duration-300"
            >
              Student Demo
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDemoLogin('admin')}
              disabled={loading}
              className="rounded-xl border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 h-10 transition-all duration-300"
            >
              Admin Demo
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Footer credits */}
      <div className="absolute bottom-4 text-center text-slate-400 text-xs font-medium opacity-60">
        © 2024 UniNest • Campus Social Network
      </div>
    </div>
  );
}
