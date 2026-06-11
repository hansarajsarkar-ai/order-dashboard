import { NextResponse, NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
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

// Exchange a verified Clerk (Google SSO) session for the internal JWT.
// Clerk only proves identity — authorization still comes from
// employeeBase.employee, exactly like /api/auth/email-login. The response
// shape matches email-login so the client-side localStorage contract and
// every Bearer-token API route keep working unchanged.
export async function POST(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'No Google session found. Please sign in with Google first.' },
        { status: 401 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      return NextResponse.json(
        { error: 'Your Google account has no email address Clerk can read.' },
        { status: 400 }
      );
    }

    if (!isAllowedEmail(primaryEmail)) {
      return NextResponse.json(
        { error: `${primaryEmail} is not authorized to access this dashboard.` },
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
      [primaryEmail.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `${primaryEmail} is not registered. Please contact your administrator.` },
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
