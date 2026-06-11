/**
 * Session cookie utilities — employee auth (phone or email), mirroring the
 * Badho DaaS dashboard. Cookie format: `<b64url(payload)>.<b64url(hmac)>`
 * where payload = JSON { sub, name, via, exp } and the signature is
 * HMAC-SHA256 over the payload. Web Crypto is used so this runs in both the
 * Edge runtime (middleware.ts) and the Node runtime (API routes).
 *
 * The HMAC secret reuses JWT_SECRET (already configured), so no new env var.
 */

export const SESSION_COOKIE_NAME = 'qps_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  sub: string;        // employeeId
  name?: string;
  via?: string;       // the phone/email used to log in
  exp: number;        // unix seconds
};

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 ? 4 - (padded.length % 4) : 0;
  const decoded = atob(padded + '='.repeat(padding));
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var must be set');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(sub: string, name?: string, via?: string): Promise<string> {
  const payload: SessionPayload = {
    sub,
    ...(name ? { name } : {}),
    ...(via ? { via } : {}),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await getKey();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

export async function verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(parts[0]);
    sigBytes = b64urlDecode(parts[1]);
  } catch {
    return null;
  }
  const key = await getKey();
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, payloadBytes as BufferSource);
  if (!ok) return null;
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

/** Normalize an Indian mobile number to 10 digits, or null if not valid. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.length === 10) return cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned.slice(2);
  if (cleaned.length === 11 && cleaned.startsWith('0')) return cleaned.slice(1);
  return null;
}

/** Normalize an email (lowercase + trim), or null if it doesn't look like one. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
