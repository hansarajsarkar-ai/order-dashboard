'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

// Mounted once in the root layout. On every route change it validates the
// stored session against /api/auth/validate; tokens minted before Google SSO
// (or for emails dropped from the allowlist) are purged and the user is sent
// to /login to sign in with Google. Network failures are ignored — we never
// log someone out because of a flaky connection.
export default function AuthGuard() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/login')) return;
    const token = localStorage.getItem('authToken');
    if (!token) return; // pages already redirect to /login when no token

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/validate', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || res.ok) return;
        localStorage.removeItem('authToken');
        localStorage.removeItem('employeeId');
        localStorage.removeItem('employeeName');
        localStorage.removeItem('employeeEmail');
        try {
          await signOut();
        } catch {}
        window.location.replace('/login');
      } catch {
        // network error — keep the session, retry on next navigation
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, signOut]);

  return null;
}
