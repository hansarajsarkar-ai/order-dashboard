import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Pulls ad spend per campaign from the Meta (Facebook) Marketing API so the UI
// can join it against installs + GMV (matched on campaign_name) to compute
// CPI / CAC / ROAS. Requires two env vars:
//   META_ACCESS_TOKEN   — a long-lived token with ads_read on the ad account
//   META_AD_ACCOUNT_ID  — the numeric ad account id (with or without "act_")
// When either is missing the route returns { configured: false } and the UI
// shows a setup prompt instead of erroring.

const GRAPH_VERSION = 'v21.0';

interface InsightRow {
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
}

function isoDaysAgo(days: number): string {
  const ms = Date.now() - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN;
  const acctRaw = process.env.META_AD_ACCOUNT_ID;

  if (!token || !acctRaw) {
    return NextResponse.json({
      configured: false,
      message: 'Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to enable spend / CAC / ROAS.',
    });
  }

  const { searchParams } = new URL(req.url);
  const daysParam = parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const acct = acctRaw.startsWith('act_') ? acctRaw : `act_${acctRaw}`;
  const since = isoDaysAgo(days);
  const until = isoDaysAgo(0);

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${acct}/insights`);
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('fields', 'campaign_name,spend,impressions,clicks');
  url.searchParams.set('time_range', JSON.stringify({ since, until }));
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', token);

  try {
    const rows: InsightRow[] = [];
    let next: string | null = url.toString();
    let guard = 0;
    // Follow paging.next up to a few pages so large accounts aren't truncated.
    while (next && guard < 10) {
      const res = await fetch(next, { cache: 'no-store' });
      const json: { data?: InsightRow[]; paging?: { next?: string }; error?: { message?: string } } = await res.json();
      if (!res.ok || json.error) {
        return NextResponse.json(
          { configured: true, error: json.error?.message || `Meta API error (${res.status})` },
          { status: 502 }
        );
      }
      rows.push(...(json.data || []));
      next = json.paging?.next || null;
      guard += 1;
    }

    const data = rows.map((r) => ({
      campaign: r.campaign_name || '(unnamed)',
      spend: parseFloat(r.spend || '0'),
      impressions: parseInt(r.impressions || '0', 10),
      clicks: parseInt(r.clicks || '0', 10),
    }));
    const totalSpend = data.reduce((a, b) => a + b.spend, 0);

    return NextResponse.json({
      configured: true,
      data,
      totalSpend,
      currency: process.env.META_SPEND_CURRENCY || 'INR',
      windowDays: days,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ configured: true, error: msg }, { status: 502 });
  }
}
