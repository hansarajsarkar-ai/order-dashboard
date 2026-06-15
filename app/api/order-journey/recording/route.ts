import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Proxies a call recording so it's same-origin AND seekable. The upstream
 * recording host returns no `Accept-Ranges`, so the browser can't seek to any
 * not-yet-downloaded position (skip/scrub jump to 0). This route fetches the
 * (small) file and serves it WITH range support — honoring the browser's Range
 * header with a 206 slice — so seeking works. Restricted to the recording host
 * to avoid SSRF.
 */
const ALLOWED_HOST = /^https:\/\/[a-z0-9.-]*idcloud\.in\//i;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!ALLOWED_HOST.test(u)) return new NextResponse('Forbidden', { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(u, { next: { revalidate: 3600 } });
  } catch {
    return new NextResponse('Bad gateway', { status: 502 });
  }
  if (!upstream.ok) return new NextResponse('Upstream error', { status: 502 });

  const buf = Buffer.from(await upstream.arrayBuffer());
  const total = buf.length;
  const type = upstream.headers.get('content-type') || 'audio/wav';
  const baseHeaders: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };

  const range = req.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }
    const chunk = buf.subarray(start, end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(chunk.length) },
    });
  }

  return new NextResponse(buf, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(total) } });
}
