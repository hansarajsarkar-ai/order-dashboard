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

// Acquisition channel derived from installReferrer. Kept here so the CASE is
// identical across channel-mix, conversion (by=channel) and signup-funnel.
export const CHANNEL_CASE = `CASE
  WHEN jsonb_typeof("installReferrer") = 'object' THEN 'Paid (Meta)'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_source=whatsapp%' THEN 'WhatsApp'
  WHEN "installReferrer" #>> '{}' ILIKE '%utm_medium=organic%'
    OR "installReferrer" #>> '{}' ILIKE '%google-play%' THEN 'Organic (Play Store)'
  WHEN "installReferrer" IS NULL OR "installReferrer" #>> '{}' IN ('unknown', '') THEN 'Unknown'
  ELSE 'Other'
END`;

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
  return `AND jsonb_typeof("installReferrer") = 'object'
    AND ("installReferrer"->>'campaign_name' = $${i} OR "installReferrer"->>'campaign_id' = $${i})`;
}
