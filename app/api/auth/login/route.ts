import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  normalizePhone,
  normalizeEmail,
} from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allowed only for active Support employees (same constraint as the Badho DaaS
// dashboard). Login by phone OR email — whichever is entered.
const ALLOWED_ROLE = 'Support';

interface EmployeeRow {
  employeeId: string;
  name: string | null;
}

export async function POST(req: NextRequest) {
  let identifier = '';
  try {
    const body = await req.json();
    identifier = typeof body?.identifier === 'string' ? body.identifier : '';
  } catch {
    /* invalid body */
  }
  identifier = identifier.trim();
  if (!identifier) {
    return NextResponse.json({ error: 'Enter your phone number or email.' }, { status: 400 });
  }

  // Decide phone vs email and build the matching lookup.
  const email = identifier.includes('@') ? normalizeEmail(identifier) : null;
  const phone = email ? null : normalizePhone(identifier);
  if (!email && !phone) {
    return NextResponse.json({ error: 'Enter a valid 10-digit phone number or email.' }, { status: 400 });
  }

  let employee: EmployeeRow | undefined;
  try {
    const rows = email
      ? await query<EmployeeRow>(
          `SELECT "employeeId", "name" FROM "employeeBase"."employee"
           WHERE "isActive" = TRUE AND "role" = $1 AND LOWER("email") = $2 LIMIT 1`,
          [ALLOWED_ROLE, email]
        )
      : await query<EmployeeRow>(
          `SELECT "employeeId", "name" FROM "employeeBase"."employee"
           WHERE "isActive" = TRUE AND "role" = $1 AND "phoneNumber" = $2 LIMIT 1`,
          [ALLOWED_ROLE, phone]
        );
    employee = rows[0];
  } catch (e) {
    console.error('Employee lookup failed:', e);
    return NextResponse.json({ error: 'Login is temporarily unavailable. Please try again.' }, { status: 500 });
  }

  if (!employee) {
    return NextResponse.json(
      { error: 'Not authorized. This dashboard is limited to active Support team members.' },
      { status: 401 }
    );
  }

  const via = email ?? phone ?? '';
  const token = await signSession(employee.employeeId, employee.name ?? undefined, via);

  const res = NextResponse.json({
    ok: true,
    employeeId: employee.employeeId,
    employeeName: employee.name || via,
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
