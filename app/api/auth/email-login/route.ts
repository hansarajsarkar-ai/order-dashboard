import { NextResponse, NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { isAllowedEmail } from '@/lib/allowlist';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

interface EmployeeRow {
  employeeId: string;
  email: string;
  name: string | null;
  role: string | null;
  isActive: boolean | null;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (!isAllowedEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: 'This email is not authorized to access this dashboard.' },
        { status: 403 }
      );
    }

    const rows = await query<EmployeeRow>(
      `SELECT
         "employeeId",
         "email",
         "name",
         "role",
         "isActive"
       FROM "employeeBase"."employee"
       WHERE LOWER("email") = LOWER($1)`,
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'This email is not registered. Please contact your administrator.' },
        { status: 401 }
      );
    }

    const employee = rows[0];

    if (employee.isActive !== true) {
      return NextResponse.json(
        { error: 'Your account is inactive. Please contact your administrator.' },
        { status: 403 }
      );
    }

    const token = jwt.sign(
      {
        id: employee.employeeId,
        email: employee.email,
        name: employee.name,
        role: employee.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      token,
      employeeId: employee.employeeId,
      employeeName: employee.name || employee.email,
      email: employee.email,
      role: employee.role,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
