import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/refund-order-amount/notify
 *
 * Posts an alert message to Slack via an incoming webhook.
 * Configure SLACK_WEBHOOK_URL in env. The webhook is bound to a single
 * channel — modern Slack webhooks ignore any "channel" override in the
 * payload, so we don't expose recipient choice for Slack on the UI side.
 *
 * Body:
 *   { text: string }   // Slack mrkdwn — `*bold*`, ```code blocks```, etc.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string | undefined = body?.text;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required and must be a non-empty string' }, { status: 400 });
    }
    if (text.length > 40_000) {
      return NextResponse.json({ error: `text too long (${text.length} chars, limit 40,000)` }, { status: 400 });
    }

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'SLACK_WEBHOOK_URL env var not set on the server. Add it in Vercel → Project → Settings → Environment Variables.' },
        { status: 503 },
      );
    }

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mrkdwn: true }),
    });

    if (!slackRes.ok) {
      const errBody = await slackRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Slack rejected the message: ${slackRes.status} ${errBody.slice(0, 300)}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, channel: 'slack', timestamp: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err) || 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
