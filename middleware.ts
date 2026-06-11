import { clerkMiddleware } from '@clerk/nextjs/server';

// clerkMiddleware only attaches the Clerk session to the request context —
// it does NOT protect any route. Pages keep their existing client-side
// localStorage gate, and API routes keep verifying the internal Bearer JWT
// (lib/auth.ts). Clerk is used solely to prove "who is this Google user"
// during login; /api/auth/google-login reads that session via auth() and
// exchanges it for the internal JWT.
export default clerkMiddleware();

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
