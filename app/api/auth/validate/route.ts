import { NextResponse, NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { isAllowedEmail } from '@/lib/allowlist';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Session validity check called by AuthGuard on every page load. A token is
// only good if it (1) verifies against the shared secret, (2) was minted via
// Google SSO (method claim — legacy email-login tokens don't have it), and
// (3) belongs to an allowlisted email. Anything else gets 401/403 and the
// client purges the session, forcing a fresh Google sign-in.
export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return NextResponse.json({ ok: false, error: 'No token' }, { status: 401 });
  }
  try {
    const claims = jwt.verify(match[1], JWT_SECRET) as {
      email?: string;
      method?: string;
    };
    if (claims.method !== 'google') {
      return NextResponse.json(
        { ok: false, error: 'Legacy session — please sign in with Google' },
        { status: 401 }
      );
    }
    if (!isAllowedEmail(claims.email)) {
      return NextResponse.json(
        { ok: false, error: 'Email no longer authorized' },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
  }
}
