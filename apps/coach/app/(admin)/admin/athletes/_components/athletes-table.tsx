"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn
} from "@tanstack/react-table";
import type { AthleteRosterEntry } from "@/domain/athleteRoster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  matchesSearch,
  matchesStatus,
  readSort,
  readStatus,
  writeSort,
  type StatusFilter
} from "./roster-url";
import {
  ATHLETE_STATUSES,
  contactOf,
  DATE_FORMAT,
  formatDay,
  PLAN_STATUS_LABEL,
  PROPOSITION_STATUS_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT
} from "../../_components/labels";

const searchFilter: FilterFn<AthleteRosterEntry> = (row, _columnId, query: string) =>
  matchesSearch(row.original, query);

const columns: ColumnDef<AthleteRosterEntry>[] = [
  {
    id: "name",
    header: "Athlète",
    accessorFn: (row) => row.displayName ?? "",
    cell: ({ row }) => (
      <div className="grid">
        {/* Stretched over the whole row: one real link, so cmd click and middle click behave. */}
        <Link
          href={`/admin/athletes/${row.original.id}`}
          className="font-medium after:absolute after:inset-0 hover:underline"
        >
          {row.original.displayName ?? "Sans nom"}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{contactOf(row.original)}</span>
      </div>
    )
  },
  {
    id: "status",
    header: "Statut",
    accessorFn: (row) => ATHLETE_STATUSES.indexOf(row.status),
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
    )
  },
  {
    id: "plan",
    header: "Plan",
    accessorFn: (row) => row.plan?.name ?? "",
    cell: ({ row }) =>
      row.original.plan ? (
        <span>
          {row.original.plan.name}{" "}
          <span className="text-muted-foreground">({PLAN_STATUS_LABEL[row.original.plan.status]})</span>
        </span>
      ) : (
        <span className="text-muted-foreground">aucun</span>
      )
  },
  {
    id: "proposition",
    header: "Dernière semaine",
    accessorFn: (row) => row.latestProposition?.weekStart ?? "",
    cell: ({ row }) =>
      row.original.latestProposition ? (
        <span>
          {formatDay(row.original.latestProposition.weekStart)}{" "}
          <span className="text-muted-foreground">
            ({PROPOSITION_STATUS_LABEL[row.original.latestProposition.status]})
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">aucune</span>
      )
  },
  {
    id: "createdAt",
    header: "Arrivé le",
    accessorFn: (row) => row.createdAt.getTime(),
    cell: ({ row }) => DATE_FORMAT.format(row.original.createdAt)
  }
];

export function AthletesTable({ rows }: { rows: AthleteRosterEntry[] }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  // The box follows the URL when it changes from outside (sidebar link, back button).
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  const statusFilter = readStatus(searchParams.get("status"));
  // Everything fed to the table keeps its reference across renders: TanStack recomputes its row
  // models on a new `data` or `sorting` and resets the page index, which re-renders, which would
  // build a new one again. Inlined, either froze the whole tab on the first re-render.
  const sortParam = searchParams.get("sort");
  const sorting = useMemo(() => readSort(sortParam), [sortParam]);

  /**
   * Update the URL in place. The native History API keeps `useSearchParams` in sync without
   * a server round-trip, so typing in the search box never refetches the roster.
   */
  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    const search = next.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }

  const data = useMemo(() => rows.filter((row) => matchesStatus(row, statusFilter)), [rows, statusFilter]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: query },
    onSortingChange: (updater) =>
      setParam("sort", writeSort(typeof updater === "function" ? updater(sorting) : updater)),
    globalFilterFn: searchFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const filters: { value: StatusFilter | null; label: string }[] = [
    { value: null, label: "Tous" },
    ...ATHLETE_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }))
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Nom, numéro ou LID"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setParam("q", event.target.value);
          }}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {filters.map(({ value, label }) => (
            <Button
              key={label}
              size="sm"
              variant={statusFilter === value ? "default" : "outline"}
              onClick={() => setParam("status", value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === "asc" && <ArrowUp className="size-3" />}
                      {sorted === "desc" && <ArrowDown className="size-3" />}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                Aucun athlète ne correspond.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="relative">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
