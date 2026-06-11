'use client';

import { useEffect } from 'react';

// Registers the service worker so the dashboard is installable on phones
// (Add to Home Screen / Install app).
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
