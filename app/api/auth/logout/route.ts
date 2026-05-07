import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Stateless JWT — client just discards the token from localStorage.
  return NextResponse.json({ success: true });
}
