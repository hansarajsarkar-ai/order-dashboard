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

// CANONICAL "is this a Meta paid install" — the single source of truth for the
// Meta bucket, so every panel classifies Meta identically. Prefers
// standardizedAttribution (source='meta', plus the rare audience-network case the
// platform labels source='other (an)' with medium='paid'); installReferrer fallback
// (object form or paid deeplink) only for older rows that lack SA. Verified
// equivalent to the hand-written channel query (±1 install / 30d).
export const IS_META = `(
  ${SA}->>'source' = 'meta'
  OR (${SA}->>'source' LIKE 'other (%' AND ${SA}->>'medium' = 'paid')
  OR (NOT (${SA_PRESENT}) AND (jsonb_typeof("installReferrer") = 'object' OR ${IS_PAID_STRING}))
)`;

// Campaign-level attribution fields, coalesced installReferrer(object) → SA so the
// campaign/creative panels cover the SAME Meta installs as IS_META (the object form
// alone misses ~3% string-deeplink Meta installs).
//
// IMPORTANT — Meta's install-referrer field names are offset one level from the
// ad-manager UI (verified against the exported campaign sheet):
//   campaign_group_name = the CAMPAIGN   (what the UI/CSV calls "Campaign")
//   campaign_name       = the AD SET     (Meta's "campaign_name" is actually the ad set)
//   adgroup_name        = the AD / creative variant
// standardizedAttribution has NO campaign-group field, so the true campaign is only on
// the object form (null for old string-deeplink installs → shown as "(unnamed)").
export const CAMPAIGN_NAME = `NULLIF("installReferrer"->>'campaign_group_name','')`;                                  // true Campaign
export const ADSET_NAME = `COALESCE(NULLIF("installReferrer"->>'campaign_name',''), NULLIF(${SA}->>'campaign',''))`;  // Ad Set ("creative")
export const ADGROUP_NAME = `COALESCE(NULLIF("installReferrer"->>'adgroup_name',''), NULLIF(${SA}->>'adGroup',''))`;  // Ad
export const AD_PLATFORM = `COALESCE(NULLIF("installReferrer"->>'publisher_platform',''), NULLIF(${SA}->>'originalSource',''))`;

// True when the install is a paid ad — used by geography's paid/other split and the
// efficiency panel. Intentionally BROADER than IS_META: this is "all paid marketing
// intensity" (Meta + Google + any paid), the correct denominator for paid-vs-organic.
export const IS_PAID = `(
  ${SA}->>'medium' IN ('paid','app_installs','cpc','ads')
  OR (NOT (${SA_PRESENT}) AND (jsonb_typeof("installReferrer") = 'object' OR ${IS_PAID_STRING}))
)`;

// Acquisition channel — identical across channel-mix, conversion(by=channel) and
// signup-funnel. Meta via the canonical IS_META; SA next (clean), installReferrer
// fallback for older rows.
export const CHANNEL_CASE = `CASE
  WHEN ${IS_META} THEN 'Paid (Meta)'
  WHEN ${SA}->>'source' = 'google' AND ${SA}->>'medium' <> 'organic' THEN 'Paid (Google)'
  WHEN ${SA}->>'medium' = 'whatsapp' THEN 'WhatsApp'
  WHEN ${SA}->>'medium' = 'organic' OR ${SA}->>'source' IN ('organic','google') THEN 'Organic (Play Store)'
  WHEN ${SA_PRESENT} AND ${SA}->>'source' IS NOT NULL THEN 'Other'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_source=whatsapp%' THEN 'WhatsApp'
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
  // Match the true CAMPAIGN (campaign_group) by name or id. Only the installReferrer
  // object carries the campaign group — standardizedAttribution has no such field.
  return `AND (
    "installReferrer"->>'campaign_group_name' = $${i}
    OR "installReferrer"->>'campaign_group_id' = $${i}
  )`;
}
