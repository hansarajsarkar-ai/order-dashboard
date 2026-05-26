import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { query } from './db';

// Same secret + payload shape as /api/auth/email-login. The login flow
// signs { id (= employeeId), email, name, role } with this secret and a
// 7-day expiry; server-side endpoints verify here before trusting any
// "who made this call" claim.

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface AuthClaims {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Pull the Bearer token off Authorization, verify with the shared secret,
// and return the JWT payload. Throws AuthError(401) on missing / invalid
// / expired tokens so route handlers can convert it to a NextResponse.
export function requireAuth(req: NextRequest): AuthClaims {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) throw new AuthError('Authorization header missing', 401);
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new AuthError('Authorization header must be "Bearer <token>"', 401);
  try {
    const decoded = jwt.verify(match[1], JWT_SECRET) as AuthClaims;
    if (!decoded?.id || !decoded?.email) {
      throw new AuthError('Auth token is missing id/email claims', 401);
    }
    return decoded;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(`Auth token verification failed: ${e instanceof Error ? e.message : String(e)}`, 401);
  }
}

// Look the JWT's email back up against employeeBase.employee so we always
// stamp the *current* employeeId — handles edge cases where the row was
// reassigned after the token was minted. Returns the row or throws
// AuthError(403) if no active employee matches.
export async function resolveActiveEmployee(email: string): Promise<{ employeeId: string; email: string; name: string | null }> {
  const rows = await query<{ employeeId: string; email: string; name: string | null; isActive: boolean | null }>(
    `SELECT "employeeId", "email", "name", "isActive"
       FROM "employeeBase"."employee"
      WHERE LOWER("email") = LOWER($1)
      LIMIT 1;`,
    [email],
  );
  if (rows.length === 0) {
    throw new AuthError(`No employee found for ${email}`, 403);
  }
  if (rows[0].isActive !== true) {
    throw new AuthError(`Employee ${email} is inactive`, 403);
  }
  return { employeeId: rows[0].employeeId, email: rows[0].email, name: rows[0].name };
}
