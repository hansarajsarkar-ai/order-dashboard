import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Order Dashboard',
  description: 'Order status, GMV goal, and per-seller analytics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-slate-900 text-white">
        {children}
      </body>
    </html>
  );
}
