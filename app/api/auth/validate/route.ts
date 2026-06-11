import { NextResponse, NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Session validity check called by AuthGuard. Valid = the token verifies
// against the shared secret (issued by /api/auth/login). No external identity
// provider — this copy uses a single shared password.
export async function GET(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return NextResponse.json({ ok: false, error: 'No token' }, { status: 401 });
  try {
    jwt.verify(match[1], JWT_SECRET);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
  }
}
