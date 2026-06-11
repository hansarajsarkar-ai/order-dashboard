import { NextResponse, NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Simple shared-password login for this self-hosted copy. POST { password }.
// On match it mints the same internal JWT shape the rest of the app expects
// (id/email/method) so AuthGuard + any Bearer-token route keep working.
export async function POST(req: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'DASHBOARD_PASSWORD is not configured on the server.' }, { status: 500 });
  }
  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    /* empty / invalid body */
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }
  const token = jwt.sign(
    { id: 'dashboard', email: 'dashboard@local', name: 'Dashboard', role: 'admin', method: 'password' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return NextResponse.json({
    token,
    employeeId: 'dashboard',
    employeeName: 'Dashboard',
    email: 'dashboard@local',
    role: 'admin',
  });
}
