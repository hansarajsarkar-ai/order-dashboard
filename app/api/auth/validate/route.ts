import { NextResponse, NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Session validity check called by AuthGuard. Reads the httpOnly session
// cookie (sent automatically same-origin) and verifies it.
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookie);
  if (session) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
}
