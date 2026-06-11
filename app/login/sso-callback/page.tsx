'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

// Google redirects here after the OAuth consent screen. Clerk finishes the
// handshake (including first-time sign-up transfer) and then sends the user
// back to /login, where the page exchanges the fresh Clerk session for the
// internal JWT via /api/auth/google-login.
export default function SsoCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-purple-200 text-sm">Completing Google sign-in…</div>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/login"
        signUpFallbackRedirectUrl="/login"
      />
    </div>
  );
}
