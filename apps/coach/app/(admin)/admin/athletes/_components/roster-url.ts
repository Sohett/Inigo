import type { SortingState } from "@tanstack/react-table";
import type { AthleteStatus } from "@/domain/athlete";
import type { AthleteRosterEntry } from "@/domain/athleteRoster";
import { ATHLETE_STATUSES } from "../../_components/labels";

/**
 * The roster's URL contract (`?q=&status=&sort=`): filters and sort live in the URL, so a
 * view can be shared and the back button restores it. Anything unknown in the URL falls
 * back to the default view rather than reaching the table.
 */

export const SORTABLE_COLUMNS = ["name", "status", "plan", "proposition", "createdAt"] as const;
type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

/** Newest athletes first until the admin picks another order. */
export const DEFAULT_SORT: SortingState = [{ id: "createdAt", desc: true }];

/** The status filter: one lifecycle status. */
export type StatusFilter = AthleteStatus;

/** `sort` is a column id, prefixed with `-` when descending. */
export function readSort(value: string | null): SortingState {
  if (!value) return DEFAULT_SORT;
  const desc = value.startsWith("-");
  const id = desc ? value.slice(1) : value;
  const column = SORTABLE_COLUMNS.find((candidate): candidate is SortableColumn => candidate === id);
  if (!column) return DEFAULT_SORT;
  return [{ id: column, desc }];
}

export function writeSort(sorting: SortingState): string | null {
  const first = sorting[0];
  if (!first) return null;
  return first.desc ? `-${first.id}` : first.id;
}

export function readStatus(value: string | null): StatusFilter | null {
  return ATHLETE_STATUSES.find((status) => status === value) ?? null;
}

/** Search by name, number or LID, case-insensitively. */
export function matchesSearch(row: AthleteRosterEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.displayName, row.phoneNum, row.whatsappLid].some((value) =>
    value?.toLowerCase().includes(needle)
  );
}

export function matchesStatus(row: AthleteRosterEntry, filter: StatusFilter | null): boolean {
  if (filter === null) return true;
  return row.status === filter;
}
