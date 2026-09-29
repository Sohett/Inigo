/**
 * The date arithmetic the default read windows need.
 *
 * Lives beside the tools rather than in one of them: three of these modules apply a
 * `DEFAULT_READ_BOUNDS` window, and importing it from a sibling tool made `activities` look
 * like a dependency of `fitness`.
 */

/** ISO date (YYYY-MM-DD) for `days` ago, used as a default range start. */
export function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
