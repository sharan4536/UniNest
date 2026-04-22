import React, { useState } from 'react';
import { Eye, EyeOff, GraduationCap, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue, SelectLabel, SelectGroup } from './ui/select';
import { Label } from './ui/label';
import { auth, db, isFirebaseConfigured } from '../utils/firebase/client';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { formatEmailToName } from '../utils/nameUtils';

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
  const [showPassword, setShowPassword] = useState(false);

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

      // Admin Bypass for Testing
      if (email.trim().toLowerCase() === 'admin@uninest.edu' && password === 'admin123') {
        const adminProfile = {
          uid: 'admin-dev-id',
          id: 'admin-dev-id',
          name: 'System Admin',
          email: 'admin@uninest.edu',
          university: 'UniNest HQ',
          isAdmin: true,
          isDevelopmentUser: true
        };
        onLogin(adminProfile);
        setLoading(false);
        return;
      }

    try {
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
          if (isSignUp) {
            const creds = await createUserWithEmailAndPassword(auth, email, password);
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
          }

          const creds = await signInWithEmailAndPassword(auth, email, password);
          if (!creds.user.emailVerified) {
            setError('Please verify your email address. Check your inbox for a verification email.');
            return;
          }
            const uid = creds.user.uid;
            const snap = await getDoc(doc(db, 'profiles', uid));
            const profile = snap.exists() ? snap.data() : { 
              id: uid, 
              name: formatEmailToName(creds.user.displayName || creds.user.email)
            };
            onLogin(profile);
          return;
        } catch (firebaseError: any) {
          console.error('Firebase auth error:', firebaseError);

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

          if (firebaseError.code && firebaseError.code.startsWith('auth/')) {
            setLoading(false);
            return;
          }

          throw firebaseError;
        }
      }

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
    <div className="relative h-screen overflow-y-auto bg-[#f1f7fb] px-6 py-8 text-[#293033]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-6rem] h-[38rem] w-[38rem] rounded-full bg-sky-300/20 blur-[60px]" />
        <div className="absolute bottom-[-9rem] right-[-5rem] h-[30rem] w-[30rem] rounded-full bg-sky-200/20 blur-[50px]" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-[30rem] flex-col items-center justify-start py-8 sm:justify-center">
        <div className="w-full max-w-[30rem]">
          <div className="flex flex-col items-center pb-12">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#006286] shadow-[0_18px_36px_rgba(0,98,134,0.18)]">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-center font-['Plus_Jakarta_Sans'] text-4xl font-extrabold leading-10 tracking-tight">
                <span className="text-[#293033]">Uni</span>
                <span className="text-[#2DB7F2]">Nest</span>
              </h1>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-10 shadow-[0_32px_64px_rgba(41,48,51,0.03)]">
            <div className="mb-8">
              <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold leading-8">Welcome....</h2>
              <p className="mt-2 text-base leading-6 text-[#565C60]">
                Enter your credentials to access
                <br />
                your academic nest.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  {info}
                </div>
              )}

              {isSignUp && (
                <>
                  <Field label="FULL NAME">
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 text-base shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] placeholder:text-[#71787B] focus-visible:ring-2 focus-visible:ring-sky-200"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="UNIVERSITY">
                      <Select value={university} onValueChange={setUniversity}>
                        <SelectTrigger aria-label="Select University" className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 text-left shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectGroup>
                            <SelectLabel>Available Locations</SelectLabel>
                            <SelectItem value="Vellore">Vellore</SelectItem>
                            <SelectItem value="Chennai">Chennai</SelectItem>
                            <SelectItem value="Bhopal">Bhopal</SelectItem>
                            <SelectItem value="AP">AP</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="YEAR">
                      <Select value={year} onValueChange={setYear}>
                        <SelectTrigger aria-label="Select Year" className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 text-left shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="1st Year">1st Year</SelectItem>
                          <SelectItem value="2nd Year">2nd Year</SelectItem>
                          <SelectItem value="3rd Year">3rd Year</SelectItem>
                          <SelectItem value="4th Year">4th Year</SelectItem>
                          <SelectItem value="5th Year">5th Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="PROGRAM">
                    <Select value={major} onValueChange={setMajor}>
                      <SelectTrigger aria-label="Select Major" className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 text-left shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                        <SelectValue placeholder="Select B.Tech Course" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
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
                          className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        />
                      </div>
                    )}
                  </Field>
                </>
              )}

              <Field label="EMAIL ADDRESS">
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="student@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 pe-12 text-base shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] placeholder:text-[#71787B] focus-visible:ring-2 focus-visible:ring-sky-200"
                  />
                  <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#A8AEB2]" />
                </div>
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#006286]">
                    Password
                  </Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#565C60]"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-14 rounded-xl border-0 bg-[#D5DEE4] px-5 pe-12 text-base shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] placeholder:text-[#71787B] focus-visible:ring-2 focus-visible:ring-sky-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A8AEB2]"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {!isSignUp && (
                <label className="flex items-center gap-3 px-1">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded-md border-0 bg-[#D5DEE4] text-sky-600 focus:ring-sky-200"
                  />
                  <span className="text-sm font-medium text-[#565C60]">Keep me signed in</span>
                </label>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-full bg-gradient-to-r from-[#006286] to-[#2DB7F2] text-base font-bold text-[#E7F5FF] shadow-[0_12px_24px_rgba(45,183,242,0.2)] hover:opacity-95"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>

              <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-[#E1E9EE]" />
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#A8AEB2]">Or secure entry</span>
                <div className="h-px flex-1 bg-[#E1E9EE]" />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" className="rounded-full bg-[#EBF2F6] px-6 py-3 text-[#293033] hover:bg-[#E1E9EE]">
                  Google
                </Button>
                <Button type="button" variant="secondary" className="rounded-full bg-[#EBF2F6] px-6 py-3 text-[#293033] hover:bg-[#E1E9EE]">
                  SSO
                </Button>
              </div>
            </form>
          </div>

          <div className="pt-10 text-center">
            <div className="flex justify-center gap-1 text-sm">
              <span className="font-medium text-[#565C60]">
                {isSignUp ? 'Already have an academic account?' : "Don't have an academic account?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp((prev) => !prev);
                  setError('');
                  setInfo('');
                }}
                className="font-bold text-[#006286]"
              >
                {isSignUp ? 'Sign In' : 'Create Account'}
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-6">
              {['Privacy', 'Terms', 'Support'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A8AEB2]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#006286]">{label}</Label>
      {children}
    </div>
  );
}
