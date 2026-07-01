import { query } from './db';
import { cached } from './memoCache';
import { COHORT_WHERE, IS_META, CAMPAIGN_NAME } from './marketingCohort';

// A campaign's LAUNCH = its earliest install across ALL history (first appearance).
// The name's date suffix is unreliable (e.g. "…creatives_12April" first ran Apr 22),
// so first-install is the trustworthy signal. This map is effectively static — a
// campaign's first-install date never changes — so it scans all history once and is
// cached with a long TTL, independent of the dashboard's date window.
export async function campaignLaunchDates(): Promise<Record<string, string>> {
  return cached('mkt:campaign-launch-map', 6 * 60 * 60_000, async () => {
    const sql = `
      SELECT ${CAMPAIGN_NAME} AS campaign, MIN(created_at)::date::text AS launch
      FROM history.session
      WHERE ${COHORT_WHERE} AND ${IS_META} AND ${CAMPAIGN_NAME} IS NOT NULL
      GROUP BY 1;
    `;
    const rows = await query<{ campaign: string; launch: string }>(sql);
    const m: Record<string, string> = {};
    for (const r of rows) m[r.campaign] = r.launch;
    return m;
  });
}

// Default recency window for "keep only recently-launched campaigns".
export const LAUNCH_MONTHS = 4;

// Cutoff date (YYYY-MM-DD) for "launched within the last N months".
export function launchCutoff(months: number = LAUNCH_MONTHS): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return d.toISOString().slice(0, 10);
}
