'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSignIn, useAuth, useClerk } from '@clerk/nextjs';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const exchangeStarted = useRef(false);

  // If already logged in, bounce to dashboard
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('authToken')) {
      router.replace('/badho');
    }
  }, [router]);

  // Returning from the Google OAuth redirect: Clerk session exists but the
  // internal JWT doesn't yet. Exchange one for the other, then enter the
  // dashboard. If the Google email isn't an active employee, drop the Clerk
  // session so the next attempt can pick a different account.
  useEffect(() => {
    if (!authLoaded || !isSignedIn || exchangeStarted.current) return;
    if (localStorage.getItem('authToken')) return;
    exchangeStarted.current = true;
    setGoogleLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/auth/google-login', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Google sign-in failed');
          await signOut();
          return;
        }
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('employeeId', data.employeeId);
        localStorage.setItem('employeeName', data.employeeName);
        localStorage.setItem('employeeEmail', data.email);
        router.replace('/badho');
      } catch (err) {
        console.error(err);
        setError('Something went wrong completing Google sign-in.');
      } finally {
        setGoogleLoading(false);
        exchangeStarted.current = false;
      }
    })();
  }, [authLoaded, isSignedIn, router, signOut]);

  const handleGoogleLogin = async () => {
    if (!signInLoaded || !signIn) return;
    setError('');
    setGoogleLoading(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/login/sso-callback',
        redirectUrlComplete: '/login',
      });
    } catch (err) {
      console.error(err);
      setError('Could not start Google sign-in. Please try again.');
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmed = email.toLowerCase().trim();
      if (!trimmed) {
        setError('Please enter your email');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('employeeId', data.employeeId);
      localStorage.setItem('employeeName', data.employeeName);
      localStorage.setItem('employeeEmail', data.email);
      router.replace('/badho');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>

      <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 mb-4 shadow-[0_0_30px_rgba(217,70,239,0.4)]">
            <span className="text-2xl">📊</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Order Dashboard</h1>
          <p className="text-purple-200 text-sm mt-1">Sign in with your work account</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || !signInLoaded}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white text-slate-800 font-semibold hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? 'Signing in with Google…' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-white/40 text-xs uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-purple-200 uppercase tracking-wide mb-2">
              Work Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@badho.in"
              autoComplete="email"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:border-transparent transition-all"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white font-semibold shadow-[0_0_24px_rgba(217,70,239,0.5)] hover:shadow-[0_0_36px_rgba(217,70,239,0.7)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-white/40 mt-6">
          Access is restricted to active employees in <code className="text-white/60">employeeBase.employee</code>.
        </p>
      </div>
    </div>
  );
}
