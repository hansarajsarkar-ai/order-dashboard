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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parse the launch date marketing embeds at the END of a Meta campaign name, e.g.
//   "..._4may"        -> 2026-05-04
//   "..._5thFeb"      -> 2026-02-05
//   "..._31Dec"       -> 2025-12-31   (year inferred: most-recent past occurrence)
//   "..._27March_NEW" -> 2026-03-27   (date need not be the very last token)
//   "..._14May" in "...otp_mayDB..._14May" -> picks 14 May, not the bare "may"
// Requires a leading day number so stray month words ("mayDB") don't match. Takes the
// LAST day+month token in the string. Returns YYYY-MM-DD, or null if there's no date.
export function parseCampaignNameDate(name: string, todayIso: string): string | null {
  if (!name) return null;
  const re = /(\d{1,2})(?:st|nd|rd|th)?[\s_\-./]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/gi;
  let m: RegExpExecArray | null;
  let last: { day: number; mon: number } | null = null;
  while ((m = re.exec(name)) !== null) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2].toLowerCase()];
    if (day >= 1 && day <= 31 && mon) last = { day, mon };
  }
  if (!last) return null;
  const today = new Date(todayIso + 'T00:00:00');
  let year = today.getFullYear();
  // A month/day that falls after today must belong to the previous year (e.g. Dec).
  if (new Date(year, last.mon - 1, last.day).getTime() > today.getTime()) year -= 1;
  return `${year}-${String(last.mon).padStart(2, '0')}-${String(last.day).padStart(2, '0')}`;
}

// Effective launch date for a campaign: the date parsed from its NAME, falling back to
// its first-ever install date when the name carries no date. Returns { date, source }.
export function resolveLaunch(
  name: string | null,
  firstInstall: Record<string, string>,
  todayIso: string,
): { date: string | null; source: 'name' | 'install' | null } {
  if (!name) return { date: null, source: null };
  const fromName = parseCampaignNameDate(name, todayIso);
  if (fromName) return { date: fromName, source: 'name' };
  const fi = firstInstall[name];
  return fi ? { date: fi, source: 'install' } : { date: null, source: null };
}

// Default recency window for "keep only recently-launched campaigns".
export const LAUNCH_MONTHS = 4;

// Cutoff date (YYYY-MM-DD) for "launched within the last N months".
export function launchCutoff(months: number = LAUNCH_MONTHS): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return d.toISOString().slice(0, 10);
}
