"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { differenceInDays, format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Pencil,
  Search,
  Trash2,
  Upload,
  Filter,
} from "lucide-react";
import { api, type LeaseEvent, type LeaseSummary, type PropertySummary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { humanise } from "@/lib/humanise";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RowActions } from "@/components/ui/row-actions";
import { StatusPill } from "@/components/ui/status-pill";

// ---- types --------------------------------------------------------------

const ALL_LEASE_STATUSES = [
  "uploaded",
  "extracting",
  "ready_for_review",
  "approved",
  "failed",
] as const;

type SortKey = "label" | "status" | "uploaded" | "property" | "client";
type SortDir = "asc" | "desc";

type GroupBy = "none" | "status" | "property" | "client";

const CRITICAL_EVENT_TYPES = new Set([
  "break_notice_deadline",
  "rent_review_trigger",
  "lease_expiry",
  "epc_expiry",
]);

interface EnrichedLease extends LeaseSummary {
  client: string | null;
  /** Days until the next critical event, or null if none. Negative = overdue. */
  critical_days: number | null;
}

// ---- page --------------------------------------------------------------

export default function LeasesPage() {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter / sort / group state
  const [search, setSearch] = useState("");
  const [enabledStatuses, setEnabledStatuses] = useState<Set<string>>(
    () => new Set(ALL_LEASE_STATUSES)
  );
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("uploaded");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Initial load + polling while extractions are in flight
  const leasesQ = useApi<LeaseSummary[]>((opts) => api.listLeases(opts));
  const propertiesQ = useApi<PropertySummary[]>((opts) => api.listProperties(opts));
  const eventsQ = useApi<LeaseEvent[]>((opts) =>
    api.listEvents({ days_ahead: 365, days_behind: 30 }, opts)
  );
  const leases = leasesQ.data;
  const properties = propertiesQ.data ?? [];
  const events = eventsQ.data ?? [];

  const refetchAll = () => {
    leasesQ.refetch();
    propertiesQ.refetch();
    eventsQ.refetch();
  };
  const anyError = leasesQ.error || propertiesQ.error || eventsQ.error;
  const anyRetrying = leasesQ.refetching || propertiesQ.refetching || eventsQ.refetching;

  // Poll while any lease is mid-extraction
  useEffect(() => {
    if (!leases?.some((l) => l.status === "uploaded" || l.status === "extracting")) return;
    const id = setInterval(() => leasesQ.refetch(), 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases?.map((l) => l.status).join(",")]);

  // Enrich leases with client + critical-event info
  const enriched = useMemo<EnrichedLease[] | null>(() => {
    if (!leases) return null;
    const propIndex = new Map(properties.map((p) => [p.id, p]));
    const today = new Date();
    return leases.map((l) => {
      const prop = l.property_id ? propIndex.get(l.property_id) : null;
      const leaseEvents = events.filter(
        (e) => e.lease_id === l.id && CRITICAL_EVENT_TYPES.has(e.event_type)
      );
      const days = leaseEvents
        .map((e) => differenceInDays(parseISO(e.event_date), today))
        .sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      return {
        ...l,
        client: prop?.landlord_client ?? null,
        critical_days: days ?? null,
      };
    });
  }, [leases, properties, events]);

  const filtered = useMemo(() => {
    if (!enriched) return null;
    const q = search.trim().toLowerCase();
    return enriched.filter((l) => {
      if (!enabledStatuses.has(l.status)) return false;
      if (criticalOnly && (l.critical_days == null || l.critical_days > 90)) return false;
      if (q) {
        const haystack = `${l.label} ${l.property_address ?? ""} ${l.client ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, enabledStatuses, criticalOnly]);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    const out = [...filtered];
    out.sort((a, b) => cmp(a, b, sortKey));
    if (sortDir === "desc") out.reverse();
    return out;
  }, [filtered, sortKey, sortDir]);

  const grouped = useMemo<Array<{ key: string; rows: EnrichedLease[] }> | null>(() => {
    if (!sorted) return null;
    if (groupBy === "none") return null;
    const m = new Map<string, EnrichedLease[]>();
    for (const r of sorted) {
      let key: string;
      if (groupBy === "status") key = humanise("lease_status", r.status);
      else if (groupBy === "property") key = r.property_address ?? "(no property)";
      else key = r.client ?? "(no client)";
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({ key, rows }));
  }, [sorted, groupBy]);

  // ---- actions ----------------------------------------------------------

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        await api.uploadLease(file);
      }
      leasesQ.refetch();
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "uploaded" ? "desc" : "asc");
    }
  }

  function toggleStatus(s: string) {
    setEnabledStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(rows: EnrichedLease[]) {
    setSelected((prev) => {
      const allSelected = rows.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const r of rows) next.delete(r.id);
      } else {
        for (const r of rows) next.add(r.id);
      }
      return next;
    });
  }

  function exportCsv() {
    const rows = sorted?.filter((r) => selected.has(r.id)) ?? [];
    if (rows.length === 0) return;
    const csv = [
      ["id", "lease_label", "status", "property", "client", "uploaded_at", "critical_days"]
        .map(csvCell)
        .join(","),
      ...rows.map((r) =>
        [
          r.id,
          r.label,
          humanise("lease_status", r.status),
          r.property_address ?? "",
          r.client ?? "",
          r.created_at,
          r.critical_days?.toString() ?? "",
        ]
          .map(csvCell)
          .join(",")
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leases-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- render -----------------------------------------------------------

  const totalLeases = leases?.length ?? 0;
  const visibleCount = sorted?.length ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Leases</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Upload a PDF to abstract every clause with citations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchBox value={search} onChange={setSearch} />
          <label
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium cursor-pointer ${
              uploading
                ? "bg-neutral-200 text-neutral-500"
                : "bg-neutral-900 text-white hover:bg-neutral-700"
            }`}
          >
            <Upload size={14} />
            {uploading ? "Uploading…" : "Upload lease PDF"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </div>
      </header>

      {uploadError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {uploadError}
        </div>
      )}

      {anyError && (
        <div className="mb-6">
          <ErrorState error={anyError} onRetry={refetchAll} retrying={anyRetrying} compact />
        </div>
      )}

      {leasesQ.loading ? (
        <Loading />
      ) : leases === null ? (
        // Errored on first load with no cached data — banner above is the message.
        null
      ) : leases.length === 0 ? (
        <EmptyState onPick={() => fileInputRef.current?.click()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* Filter rail */}
          <aside className="space-y-5">
            <FilterSection title="Status" icon={Filter}>
              {ALL_LEASE_STATUSES.map((s) => (
                <FilterCheckbox
                  key={s}
                  label={humanise("lease_status", s)}
                  checked={enabledStatuses.has(s)}
                  onChange={() => toggleStatus(s)}
                />
              ))}
            </FilterSection>

            <FilterSection title="Quick filters">
              <FilterCheckbox
                label="Critical event ≤ 90d"
                checked={criticalOnly}
                onChange={() => setCriticalOnly((v) => !v)}
              />
            </FilterSection>

            <FilterSection title="Group by">
              <GroupSelect value={groupBy} onChange={setGroupBy} />
            </FilterSection>
          </aside>

          {/* Table area */}
          <div className="min-w-0">
            <Toolbar
              visibleCount={visibleCount}
              totalCount={totalLeases}
              selectedCount={selected.size}
              onClearSelection={() => setSelected(new Set())}
              onExportCsv={exportCsv}
            />

            {grouped ? (
              <div className="space-y-6">
                {grouped.map(({ key, rows }) => (
                  <section key={key}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {key} <span className="text-neutral-400 ml-1">({rows.length})</span>
                    </h2>
                    <LeaseTable
                      rows={rows}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggleSort={toggleSort}
                      selected={selected}
                      onToggleSelect={toggleSelect}
                      onToggleSelectAll={() => toggleSelectAll(rows)}
                      onChanged={leasesQ.refetch}
                    />
                  </section>
                ))}
              </div>
            ) : sorted && sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
                No leases match the current filters.
              </div>
            ) : (
              <LeaseTable
                rows={sorted ?? []}
                sortKey={sortKey}
                sortDir={sortDir}
                onToggleSort={toggleSort}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={() => toggleSelectAll(sorted ?? [])}
                onChanged={leasesQ.refetch}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- pieces -------------------------------------------------------------

function SearchBox({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search leases…"
        aria-label="Search leases"
        className="w-72 rounded-md border border-neutral-300 bg-white pl-8 pr-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
      />
    </div>
  );
}

function FilterSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {Icon && <Icon size={12} />}
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 rounded border-neutral-300"
      />
      <span className="text-neutral-700">{label}</span>
    </label>
  );
}

function GroupSelect({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as GroupBy)}
      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
    >
      <option value="none">No grouping</option>
      <option value="status">Status</option>
      <option value="property">Property</option>
      <option value="client">Client</option>
    </select>
  );
}

function Toolbar({
  visibleCount,
  totalCount,
  selectedCount,
  onClearSelection,
  onExportCsv,
}: {
  visibleCount: number;
  totalCount: number;
  selectedCount: number;
  onClearSelection: () => void;
  onExportCsv: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 text-xs">
      <div className="text-neutral-500 tabular-nums">
        Showing <span className="font-medium text-neutral-700">{visibleCount}</span> of {totalCount}
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-white font-semibold tabular-nums">
            {selectedCount} selected
          </span>
          <button
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-neutral-700 hover:bg-neutral-50"
          >
            <Download size={12} /> Export CSV
          </button>
          <button onClick={onClearSelection} className="text-neutral-500 hover:text-neutral-800">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

interface LeaseTableProps {
  rows: EnrichedLease[];
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (k: SortKey) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

function LeaseTable({
  rows,
  sortKey,
  sortDir,
  onToggleSort,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onChanged,
}: LeaseTableProps & { onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();

  async function rename(l: EnrichedLease) {
    const next = window.prompt("Rename lease", l.label);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === l.label) return;
    try {
      await api.patchLease(l.id, { label: trimmed });
      toast.success("Lease renamed");
      onChanged();
    } catch (e) {
      toast.error("Couldn't rename", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function deleteLease(l: EnrichedLease) {
    const ok = await confirm({
      title: `Delete this lease?`,
      description: (
        <>
          <p className="mb-2">
            <span className="font-medium">{l.label}</span>
          </p>
          <p>
            This removes the lease, every calendar event derived from it, every
            review pack, every reviewer edit, and the original PDF on disk.
            Comparables fed back from settled reviews on this lease are kept
            (the rent evidence stays valid). The Property record is kept too.
          </p>
          <p className="mt-2 font-medium">Cannot be undone.</p>
        </>
      ),
      confirmLabel: "Delete lease",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteLease(l.id);
      toast.success("Lease deleted");
      onChanged();
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : String(e) });
    }
  }


  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-8 px-3 py-3">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-neutral-300"
              />
            </th>
            <SortHeader label="Lease" sortKey="label" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <SortHeader label="Property" sortKey="property" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <SortHeader label="Client" sortKey="client" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <SortHeader label="Status" sortKey="status" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <th className="px-4 py-3">Critical</th>
            <SortHeader label="Uploaded" sortKey="uploaded" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((l) => (
            <tr key={l.id} className={`hover:bg-neutral-50 ${selected.has(l.id) ? "bg-blue-50/50" : ""}`}>
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${l.label}`}
                  checked={selected.has(l.id)}
                  onChange={() => onToggleSelect(l.id)}
                  className="h-3.5 w-3.5 rounded border-neutral-300"
                />
              </td>
              <td className="px-4 py-3">
                <Link href={`/leases/${l.id}`} className="font-medium text-neutral-900 hover:underline">
                  {l.label}
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-600">
                {l.property_id ? (
                  <Link href={`/properties/${l.property_id}`} className="hover:underline">
                    {l.property_address ?? "—"}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-neutral-600">{l.client ?? "—"}</td>
              <td className="px-4 py-3">
                <StatusPill group="lease_status" value={l.status} />
              </td>
              <td className="px-4 py-3">
                <CriticalBadge days={l.critical_days} />
              </td>
              <td className="px-4 py-3 text-neutral-500 tabular-nums">
                {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1">
                  <Link href={`/leases/${l.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
                    Open →
                  </Link>
                  <RowActions
                    label={`Actions for ${l.label}`}
                    actions={[
                      { label: "Rename", icon: Pencil, onClick: () => rename(l) },
                      { label: "Delete", icon: Trash2, onClick: () => deleteLease(l), destructive: true },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === current;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 ${active ? "text-neutral-700" : "text-neutral-500 hover:text-neutral-700"}`}
      >
        {label}
        <Icon size={11} className="opacity-70" />
      </button>
    </th>
  );
}

function CriticalBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-xs text-neutral-400">—</span>;
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        {Math.abs(days)}d overdue
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        in {days}d
      </span>
    );
  }
  if (days <= 90) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        in {days}d
      </span>
    );
  }
  return <span className="text-xs text-neutral-500">in {days}d</span>;
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <SharedEmptyState
      icon={Upload}
      title="No leases yet"
      description="Drop a commercial lease PDF and we'll extract every clause — parties, term, rent review, breaks, repair, alienation — in 2–5 minutes. Calendar events for reviews, breaks and expiries appear automatically."
      actions={[{ label: "Upload first lease", onClick: onPick, variant: "primary" }]}
      hint="PDFs only — text or scanned. ~£0.20 per lease in API costs."
    />
  );
}

function Loading() {
  return <div className="text-sm text-neutral-500">Loading…</div>;
}

// ---- helpers ------------------------------------------------------------

function cmp(a: EnrichedLease, b: EnrichedLease, key: SortKey): number {
  switch (key) {
    case "label":
      return a.label.localeCompare(b.label);
    case "status":
      return a.status.localeCompare(b.status);
    case "uploaded":
      return a.created_at.localeCompare(b.created_at);
    case "property":
      return (a.property_address ?? "").localeCompare(b.property_address ?? "");
    case "client":
      return (a.client ?? "").localeCompare(b.client ?? "");
  }
}

function csvCell(v: string): string {
  if (v == null) return "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
