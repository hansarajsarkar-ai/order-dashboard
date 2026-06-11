'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

// Mounted once in the root layout. Validates the stored session against
// /api/auth/validate on every route change, every 5 minutes, and whenever the
// tab regains focus — so even a dashboard left open in a background tab gets
// bounced to /login once its token is legacy (pre-Google), expired, or its
// email is dropped from the allowlist. Network failures are ignored — we
// never log someone out because of a flaky connection.
const REVALIDATE_MS = 5 * 60 * 1000;

export default function AuthGuard() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!pathname || pathname.startsWith('/login')) return;

    let cancelled = false;
    const check = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) return; // pages already redirect to /login when no token
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
        // network error — keep the session, retry on the next trigger
      }
    };

    check();
    const interval = setInterval(check, REVALIDATE_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname, signOut]);

  return null;
}
