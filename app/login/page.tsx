'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, bounce to dashboard
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('authToken')) {
      router.replace('/badho');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
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
    } catch {
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
          <p className="text-purple-200 text-sm mt-1">Enter the dashboard password</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder-purple-300/50 focus:outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/30 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(217,70,239,0.3)]"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && (
          <div className="mt-6 px-4 py-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm">
            {error}
          </div>
        )}

        <p className="text-center text-xs text-white/40 mt-6">
          Access is restricted to authorized users only.
        </p>
      </div>
    </div>
  );
}
