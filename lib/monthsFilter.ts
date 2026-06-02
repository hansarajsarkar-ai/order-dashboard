/**
 * Shared "filter to selected months" helper for the order-dashboard P&L/trend
 * routes. The frontend month multi-select sends `months=1,3,6` (1-12). When
 * present, the cohort is restricted to those calendar months (on the given
 * timestamp column) while the route's own granularity bucketing is untouched.
 *
 * Call it AFTER pushing every other param for the query and inject the returned
 * clause anywhere in the WHERE — the placeholder index is bound at push time, so
 * its position in the SQL text does not matter.
 *
 * Returns '' (and pushes nothing) when no valid months are selected — i.e. the
 * default "All months" behaviour.
 */
export function appendMonthsFilter(
  monthsRaw: string | null | undefined,
  tsColumn: string,
  params: (string | number)[],
): string {
  const months = (monthsRaw || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  if (months.length === 0) return '';
  // Dedupe + sort for a stable, cache-friendly param value.
  const unique = Array.from(new Set(months)).sort((a, b) => a - b);
  params.push(unique.join(','));
  return ` AND EXTRACT(MONTH FROM ${tsColumn})::int = ANY(string_to_array($${params.length}, ',')::int[])`;
}
