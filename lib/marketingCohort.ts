// ───────────────────────────────────────────────────────────────────────────
// Shared cohort + channel logic for the Marketing dashboard.
//
// Every marketing query over history.session is scoped to the SAME cohort:
// a genuine new-buyer install — a buyer, on the buyer app, on their first
// session, not a master login, not a test. Centralised here so all routes
// (installs-trend, channel-mix, campaigns, creatives, conversion, geography,
// signup-funnel, whatsapp-campaigns) stay in lock-step.
//
// Columns are referenced unqualified, so callers must select from
// history.session with no table alias (or one that exposes these columns).
// ───────────────────────────────────────────────────────────────────────────

export const COHORT_WHERE = `"userType" = 'buyer'
  AND "appUsed" = 'buyer-app'
  AND "isFirstSession" = TRUE
  AND "isMasterLogin" = FALSE
  AND "isTest" = FALSE`;

// standardizedAttribution (inside additionalDetails) is the platform's own
// normalized attribution — clean source/medium/campaign/adGroup/originalSource,
// ~100% populated on recent rows but absent on older ones (≈79% at 90d). So
// channel classification PREFERS it and falls back to installReferrer parsing
// when it's missing.
export const SA = `"additionalDetails"->'standardizedAttribution'`;
const SA_PRESENT = `jsonb_typeof(${SA}) = 'object'`;

// Fallback: Meta paid installs also arrive as installReferrer string deeplinks
// (utm_source=meta/fb/an or utm_medium=paid/app_installs). (&|$) anchors the
// value so utm_source=an doesn't match "android".
export const IS_PAID_STRING = `(
  "installReferrer" #>> '{}' ~ 'utm_source=(meta|fb|an)(&|$)'
  OR "installReferrer" #>> '{}' ~ 'utm_medium=(paid|app_installs)(&|$)'
)`;

// True when the install is a paid ad — used by geography's paid/other split.
export const IS_PAID = `(
  ${SA}->>'medium' IN ('paid','app_installs','cpc','ads')
  OR (NOT (${SA_PRESENT}) AND (jsonb_typeof("installReferrer") = 'object' OR ${IS_PAID_STRING}))
)`;

// Acquisition channel — identical across channel-mix, conversion(by=channel) and
// signup-funnel. SA first (clean), installReferrer fallback for older rows.
export const CHANNEL_CASE = `CASE
  WHEN ${SA}->>'source' = 'meta' THEN 'Paid (Meta)'
  WHEN ${SA}->>'source' = 'google' AND ${SA}->>'medium' <> 'organic' THEN 'Paid (Google)'
  WHEN ${SA}->>'medium' = 'whatsapp' THEN 'WhatsApp'
  WHEN ${SA}->>'medium' = 'organic' OR ${SA}->>'source' IN ('organic','google') THEN 'Organic (Play Store)'
  WHEN ${SA_PRESENT} AND ${SA}->>'source' IS NOT NULL THEN 'Other'
  WHEN jsonb_typeof("installReferrer") = 'object' THEN 'Paid (Meta)'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_source=whatsapp%' THEN 'WhatsApp'
  WHEN ${IS_PAID_STRING} THEN 'Paid (Meta)'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_medium=organic%'
    OR "installReferrer" #>> '{}' ILIKE '%google-play%' THEN 'Organic (Play Store)'
  WHEN "installReferrer" IS NULL OR "installReferrer" #>> '{}' IN ('unknown', '') THEN 'Unknown'
  ELSE 'Other'
END`;

// ─── Date filtering ─────────────────────────────────────────────────────────
// Three modes, parsed from the query string:
//   • trailing days   ?days=30                         (default)
//   • custom range     ?from=2026-01-01&to=2026-03-15
//   • months of a year ?year=2026&months=1,3,6
export interface DateParams { days: number; from: string | null; to: string | null; year: number | null; months: number[] }

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseDateParams(sp: URLSearchParams): DateParams {
  const d = parseInt(sp.get('days') || '30', 10);
  const days = Number.isFinite(d) && d > 0 && d <= 730 ? d : 30;
  const from = isDate(sp.get('from')) ? sp.get('from') : null;
  const to = isDate(sp.get('to')) ? sp.get('to') : null;
  const y = parseInt(sp.get('year') || '', 10);
  const year = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : null;
  const months = Array.from(new Set((sp.get('months') || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12))).sort((a, b) => a - b);
  return { days, from, to, year, months };
}

// Stable cache-key segment for the active period.
export function dateKey(dp: DateParams): string {
  if (dp.from && dp.to) return `r:${dp.from}:${dp.to}`;
  if (dp.year && dp.months.length) return `m:${dp.year}:${dp.months.join('-')}`;
  return `d:${dp.days}`;
}

// SQL clause restricting `col` to the chosen period (pushes params for the range
// mode; months/days are validated ints so they're inlined safely). `lowerBound`
// is a param-free SQL date expr for the conversion order-join optimization.
export function dateClause(col: string, dp: DateParams, params: (string | number)[]): { clause: string; lowerBound: string } {
  if (dp.from && dp.to) {
    params.push(dp.from, dp.to);
    const i = params.length;
    return { clause: `AND ${col} >= $${i - 1}::date AND ${col} < ($${i}::date + 1)`, lowerBound: `$${i - 1}::date` };
  }
  if (dp.year && dp.months.length) {
    const ranges = dp.months.map((m) => {
      const start = `${dp.year}-${String(m).padStart(2, '0')}-01`;
      const ny = m === 12 ? dp.year! + 1 : dp.year!;
      const nm = m === 12 ? 1 : m + 1;
      const end = `${ny}-${String(nm).padStart(2, '0')}-01`;
      return `(${col} >= '${start}'::date AND ${col} < '${end}'::date)`;
    });
    const minStart = `${dp.year}-${String(Math.min(...dp.months)).padStart(2, '0')}-01`;
    return { clause: `AND (${ranges.join(' OR ')})`, lowerBound: `'${minStart}'::date` };
  }
  params.push(dp.days);
  return { clause: `AND ${col} >= current_date - $${params.length}::int`, lowerBound: `current_date - ${dp.days}` };
}

// Optional "filter to one Meta campaign" clause. Matches the value against EITHER
// campaign_name OR campaign_id, so the UI can filter by whichever the user typed.
// Pushes one param and returns the SQL fragment (or '' when no campaign given).
// Restricts to object referrers since only paid-ad installs carry a campaign.
export function campaignClause(
  campaign: string | null | undefined,
  params: (string | number)[],
): string {
  const c = (campaign || '').trim();
  if (!c) return '';
  params.push(c);
  const i = params.length;
  // Match name or id, in EITHER the installReferrer object or standardizedAttribution.
  return `AND (
    ("installReferrer"->>'campaign_name' = $${i} OR "installReferrer"->>'campaign_id' = $${i})
    OR (${SA}->>'campaign' = $${i} OR ${SA}->>'campaignId' = $${i})
  )`;
}
