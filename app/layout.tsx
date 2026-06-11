import type { Metadata, Viewport } from 'next';
import AuthGuard from './components/AuthGuard';
import PWARegister from './components/PWARegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Order Dashboard',
  description: 'Order status, GMV goal, and per-seller analytics',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Orders' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#7c3aed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-slate-900 text-white">
        <AuthGuard />
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
