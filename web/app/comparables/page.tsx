"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Upload as UploadIcon,
  X,
} from "lucide-react";
import { api, type Comparable } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { parseCsv } from "@/lib/csv";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

// ---- enums --------------------------------------------------------------

const USE_CLASSES = [
  { value: "E", label: "E — Commercial / business / service" },
  { value: "E(a)", label: "E(a) — Display or retail sale" },
  { value: "E(b)", label: "E(b) — Restaurant / café" },
  { value: "E(c)", label: "E(c) — Financial / professional services" },
  { value: "E(d)", label: "E(d) — Indoor sport / fitness" },
  { value: "E(g)", label: "E(g) — Office / R&D / light industrial" },
  { value: "F1",   label: "F1 — Learning / non-residential institutions" },
  { value: "F2",   label: "F2 — Local community use" },
  { value: "B2",   label: "B2 — General industrial" },
  { value: "B8",   label: "B8 — Storage / distribution" },
  { value: "C1",   label: "C1 — Hotels" },
  { value: "Sui generis", label: "Sui generis (other — pubs, hot food, etc.)" },
];
const USE_CLASS_VALUES = USE_CLASSES.map((u) => u.value);

const SOURCES = [
  { value: "rightmove", label: "Rightmove", className: "bg-purple-100 text-purple-800" },
  { value: "egi",       label: "EGi",       className: "bg-emerald-100 text-emerald-800" },
  { value: "internal",  label: "Internal",  className: "bg-blue-100 text-blue-800" },
  { value: "manual",    label: "Manual",    className: "bg-neutral-200 text-neutral-700" },
];

const DEAL_TYPES = [
  { value: "letting",     label: "New letting" },
  { value: "rent_review", label: "Settled review" },
  { value: "sale",        label: "Sale" },
];
const DEAL_LABEL = Object.fromEntries(DEAL_TYPES.map((d) => [d.value, d.label]));

type SortKey = "address" | "rent" | "psf" | "area" | "date";
type SortDir = "asc" | "desc";

// ---- main page ---------------------------------------------------------

export default function ComparablesPage() {
  const { data: comps, loading, refetching, error, refetch } = useApi<Comparable[]>(
    (opts) => api.listComparables(opts),
  );
  const load = refetch;
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [enabledUseClasses, setEnabledUseClasses] = useState<Set<string>>(
    () => new Set(USE_CLASS_VALUES)
  );
  const [enabledSources, setEnabledSources] = useState<Set<string>>(
    () => new Set(SOURCES.map((s) => s.value))
  );

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    if (!comps) return null;
    const q = search.trim().toLowerCase();
    return comps.filter((c) => {
      if (q && !c.address.toLowerCase().includes(q) && !(c.notes ?? "").toLowerCase().includes(q)) {
        return false;
      }
      // Use-class filter: only excludes rows whose class is *known and not in the
      // enabled set*. Comparables uploaded without a use_class always pass through
      // — there's no UI affordance for the user to filter to "unknown only".
      if (c.use_class && !enabledUseClasses.has(c.use_class)) return false;
      if (!enabledSources.has(c.source)) return false;
      return true;
    });
  }, [comps, search, enabledUseClasses, enabledSources]);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    const out = [...filtered];
    out.sort((a, b) => cmp(a, b, sortKey));
    if (sortDir === "desc") out.reverse();
    return out;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => buildStats(filtered ?? []), [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Comparables</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Market evidence used by the rent-review pack generator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
          >
            <UploadIcon size={14} />
            {showImport ? "Cancel import" : "Import CSV"}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
          >
            <Plus size={14} />
            {showForm ? "Cancel" : "Add comparable"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorState error={error} onRetry={refetch} retrying={refetching} compact />
        </div>
      )}

      {/* Stats strip — descriptive analytics */}
      {stats && stats.count > 0 && <StatsStrip stats={stats} />}

      {/* Add form */}
      {showForm && (
        <div className="mb-6">
          <ComparableForm onCreated={() => { setShowForm(false); void load(); }} />
        </div>
      )}

      {/* CSV import */}
      {showImport && (
        <div className="mb-6">
          <CsvImport onImported={(n) => { setShowImport(false); void load(); console.log(`Imported ${n} comps`); }} />
        </div>
      )}

      {/* Filters + search */}
      {comps && comps.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address or notes…"
            className="w-64 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <FilterSelect
            label="Source"
            options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
            enabled={enabledSources}
            onToggle={(v) => setEnabledSources((p) => toggle(p, v))}
            onAll={() => setEnabledSources(new Set(SOURCES.map((s) => s.value)))}
            onNone={() => setEnabledSources(new Set())}
          />
          <FilterSelect
            label="Use class"
            options={USE_CLASSES.map((u) => ({ value: u.value, label: u.value }))}
            enabled={enabledUseClasses}
            onToggle={(v) => setEnabledUseClasses((p) => toggle(p, v))}
            onAll={() => setEnabledUseClasses(new Set(USE_CLASS_VALUES))}
            onNone={() => setEnabledUseClasses(new Set())}
          />
          {sorted && (
            <span className="ml-auto text-xs text-neutral-500 tabular-nums">
              Showing {sorted.length} of {comps.length}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Loading />
      ) : comps === null ? (
        // Errored on first load — banner above is the message.
        null
      ) : comps.length === 0 ? (
        <EmptyState />
      ) : sorted && sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No comparables match the current filters.
        </div>
      ) : (
        <ComparableTable
          rows={sorted ?? []}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onDelete={async (id) => {
            const target = comps?.find((x) => x.id === id);
            const ok = await confirm({
              title: "Delete this comparable?",
              description: target
                ? `${target.address} — £${target.rent_pa_gbp.toLocaleString()}`
                : undefined,
              confirmLabel: "Delete",
              destructive: true,
            });
            if (!ok) return;
            try {
              await api.deleteComparable(id);
              toast.success("Comparable deleted");
              void load();
            } catch (e) {
              toast.error("Couldn't delete", {
                description: e instanceof Error ? e.message : String(e),
              });
            }
          }}
        />
      )}
    </div>
  );
}

// ---- table -------------------------------------------------------------

function ComparableTable({
  rows,
  sortKey,
  sortDir,
  onToggleSort,
  onDelete,
}: {
  rows: Comparable[];
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (k: SortKey) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <SortHeader label="Address" k="address" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <SortHeader label="Rent £/yr" k="rent" current={sortKey} dir={sortDir} onClick={onToggleSort} align="right" />
            <SortHeader label="Sq ft" k="area" current={sortKey} dir={sortDir} onClick={onToggleSort} align="right" />
            <SortHeader label="£/sq ft" k="psf" current={sortKey} dir={sortDir} onClick={onToggleSort} align="right" />
            <th className="px-4 py-3">Use</th>
            <th className="px-4 py-3">Type</th>
            <SortHeader label="Date" k="date" current={sortKey} dir={sortDir} onClick={onToggleSort} />
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((c) => {
            const psf = c.area_sqft && c.area_sqft > 0 ? c.rent_pa_gbp / c.area_sqft : null;
            return (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{c.address}</div>
                  {c.notes && <div className="mt-0.5 text-xs text-neutral-500 line-clamp-2">{c.notes}</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">£{c.rent_pa_gbp.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {c.area_sqft ? c.area_sqft.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {psf != null ? `£${psf.toFixed(0)}` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-700 text-xs">{c.use_class ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600 text-xs">{DEAL_LABEL[c.deal_type] ?? c.deal_type}</td>
                <td className="px-4 py-3 text-neutral-600 tabular-nums">
                  {c.deal_date ? format(parseISO(c.deal_date), "d MMM yyyy") : "—"}
                </td>
                <td className="px-4 py-3"><SourceBadge value={c.source} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(c.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label, k, current, dir, onClick, align = "left",
}: {
  label: string; k: SortKey; current: SortKey; dir: SortDir;
  onClick: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = current === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 ${active ? "text-neutral-700" : "text-neutral-500 hover:text-neutral-700"}`}
      >
        {label}
        <Icon size={11} className="opacity-70" />
      </button>
    </th>
  );
}

function SourceBadge({ value }: { value: string }) {
  const meta = SOURCES.find((s) => s.value === value);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta?.className ?? "bg-neutral-200 text-neutral-700"}`}>
      {meta?.label ?? value}
    </span>
  );
}

// ---- stats strip --------------------------------------------------------

interface Stats {
  count: number;
  median_psf: number | null;
  p25_psf: number | null;
  p75_psf: number | null;
  median_area: number | null;
  total_rent: number;
}

function buildStats(rows: Comparable[]): Stats {
  if (rows.length === 0) {
    return { count: 0, median_psf: null, p25_psf: null, p75_psf: null, median_area: null, total_rent: 0 };
  }
  const psfs = rows
    .filter((r) => r.area_sqft && r.area_sqft > 0)
    .map((r) => r.rent_pa_gbp / (r.area_sqft as number))
    .sort((a, b) => a - b);
  const areas = rows.filter((r) => r.area_sqft != null).map((r) => r.area_sqft as number).sort((a, b) => a - b);
  return {
    count: rows.length,
    median_psf: percentile(psfs, 50),
    p25_psf: percentile(psfs, 25),
    p75_psf: percentile(psfs, 75),
    median_area: percentile(areas, 50),
    total_rent: rows.reduce((s, r) => s + r.rent_pa_gbp, 0),
  };
}

function percentile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return arr[lo] * (hi - idx) + arr[hi] * (idx - lo);
}

function StatsStrip({ stats }: { stats: Stats }) {
  const psfRange =
    stats.p25_psf != null && stats.p75_psf != null
      ? `£${stats.p25_psf.toFixed(0)} – £${stats.p75_psf.toFixed(0)}`
      : "—";
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi label="Comparables" value={stats.count} />
      <Kpi
        label="Median £/sq ft"
        value={stats.median_psf != null ? `£${stats.median_psf.toFixed(0)}` : "—"}
        emphasis
      />
      <Kpi label="P25–P75 range" value={psfRange} />
      <Kpi
        label="Median area"
        value={stats.median_area != null ? `${stats.median_area.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft` : "—"}
      />
      <Kpi label="Total rent in set" value={`£${stats.total_rent.toLocaleString()}`} />
    </section>
  );
}

function Kpi({ label, value, emphasis }: { label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-2 tabular-nums ${emphasis ? "text-2xl font-semibold text-neutral-900" : "text-xl font-medium text-neutral-900"}`}>
        {value}
      </div>
    </div>
  );
}

// ---- filter dropdown ----------------------------------------------------

function FilterSelect({
  label, options, enabled, onToggle, onAll, onNone,
}: {
  label: string;
  options: { value: string; label: string }[];
  enabled: Set<string>;
  onToggle: (v: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const allOn = options.every((o) => enabled.has(o.value));
  const noneOn = !options.some((o) => enabled.has(o.value));
  const summary = allOn ? "All" : noneOn ? "None" : `${enabled.size} selected`;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        <span className="text-neutral-500">{label}:</span>
        <span className="font-medium text-neutral-800">{summary}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>{label}</span>
            <div className="flex gap-2">
              <button onClick={onAll} className="hover:text-neutral-800">All</button>
              <button onClick={onNone} className="hover:text-neutral-800">None</button>
            </div>
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((o) => (
              <li key={o.value}>
                <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled.has(o.value)}
                    onChange={() => onToggle(o.value)}
                    className="h-3.5 w-3.5 rounded border-neutral-300"
                  />
                  <span>{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

// ---- add form -----------------------------------------------------------

function ComparableForm({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const fd = new FormData(e.currentTarget);
          await api.createComparable({
            address: String(fd.get("address") || ""),
            rent_pa_gbp: parseFloat(String(fd.get("rent_pa_gbp") || "0")),
            area_sqft: fd.get("area_sqft") ? parseFloat(String(fd.get("area_sqft"))) : null,
            frontage_m: fd.get("frontage_m") ? parseFloat(String(fd.get("frontage_m"))) : null,
            use_class: (fd.get("use_class") as string) || null,
            deal_date: (fd.get("deal_date") as string) || null,
            deal_type: (fd.get("deal_type") as string) || "letting",
            source: (fd.get("source") as string) || "manual",
            notes: (fd.get("notes") as string) || null,
          });
          onCreated();
        } catch (e) {
          setErr(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Address *">
        <input required name="address" className={inputCls} placeholder="14 Crouch End Broadway, London N8" />
      </Field>
      <Field label="Rent £/yr *">
        <input required type="number" step="0.01" name="rent_pa_gbp" className={inputCls} placeholder="50000" />
      </Field>
      <Field label="Area (sq ft)">
        <input type="number" step="0.01" name="area_sqft" className={inputCls} placeholder="1100" />
      </Field>
      <Field label="Frontage (m)">
        <input type="number" step="0.01" name="frontage_m" className={inputCls} placeholder="5.2" />
      </Field>
      <Field label="Use class">
        <select name="use_class" className={inputCls} defaultValue="">
          <option value="">—</option>
          {USE_CLASSES.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Deal date">
        <input type="date" name="deal_date" className={inputCls} />
      </Field>
      <Field label="Deal type">
        <select name="deal_type" className={inputCls} defaultValue="letting">
          {DEAL_TYPES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select name="source" className={inputCls} defaultValue="manual">
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes" full>
        <textarea name="notes" className={inputCls} rows={2} placeholder="Tenant covenant, term, incentives…" />
      </Field>
      {err && <div className="sm:col-span-2 text-sm text-red-700">{err}</div>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save comparable"}
        </button>
      </div>
    </form>
  );
}

// ---- CSV import --------------------------------------------------------

const CSV_TEMPLATE_HEADERS = [
  "address",
  "rent_pa_gbp",
  "area_sqft",
  "frontage_m",
  "use_class",
  "deal_date",   // ISO format YYYY-MM-DD
  "deal_type",   // letting | rent_review | sale
  "source",      // rightmove | egi | internal | manual
  "notes",
];

interface ParsedRow {
  raw: Record<string, string>;
  payload: Omit<Comparable, "id" | "created_at" | "derived_from_lease_id"> | null;
  error: string | null;
}

function CsvImport({ onImported }: { onImported: (count: number) => void }) {
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    setFilename(file.name);
    setError(null);
    file.text().then((text) => {
      try {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setError("CSV has no data rows.");
          setParsed([]);
          return;
        }
        setParsed(rows.map(toParsed));
      } catch (e) {
        setError(`Could not parse CSV: ${e}`);
        setParsed([]);
      }
    });
  }

  async function importAll() {
    const valid = parsed.filter((r) => r.payload !== null && !r.error).map((r) => r.payload!);
    if (valid.length === 0) return;
    setBusy(true);
    try {
      await api.bulkCreateComparables(valid);
      onImported(valid.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const validCount = parsed.filter((r) => !r.error && r.payload).length;
  const invalidCount = parsed.length - validCount;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Import comparables from CSV</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Required headers: <code className="font-mono text-neutral-700">{CSV_TEMPLATE_HEADERS.join(", ")}</code>.
            Date format: <code className="font-mono text-neutral-700">YYYY-MM-DD</code>.
          </p>
        </div>
        <button
          onClick={() => downloadTemplate()}
          className="text-xs text-blue-700 hover:underline shrink-0"
        >
          Download template
        </button>
      </div>

      {/* Drop zone / file picker */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center text-sm ${
          dragging ? "border-blue-400 bg-blue-50" : "border-neutral-300 bg-neutral-50/50 hover:bg-neutral-50"
        }`}
      >
        <UploadIcon size={22} className="mb-1 text-neutral-400" />
        <span className="font-medium text-neutral-700">
          {filename ? filename : "Drag a CSV here or click to choose a file"}
        </span>
        <span className="mt-0.5 text-xs text-neutral-500">
          {parsed.length > 0 ? `${parsed.length} rows parsed` : "No file selected"}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>}

      {/* Preview */}
      {parsed.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
            <span>
              Preview — <span className="font-medium text-neutral-700">{validCount} valid</span>
              {invalidCount > 0 && <span className="text-red-700">, {invalidCount} invalid</span>}
            </span>
            <button
              onClick={() => { setParsed([]); setFilename(null); }}
              className="text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1"
            >
              <X size={12} /> Clear
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto overflow-x-auto rounded border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Address</th>
                  <th className="px-2 py-1 text-right">Rent £/yr</th>
                  <th className="px-2 py-1 text-right">Sq ft</th>
                  <th className="px-2 py-1">Use</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1">Source</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {parsed.map((row, i) => (
                  <tr key={i} className={row.error ? "bg-red-50" : ""}>
                    <td className="px-2 py-1 truncate max-w-[24ch]">{row.raw.address}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.raw.rent_pa_gbp}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.raw.area_sqft || "—"}</td>
                    <td className="px-2 py-1">{row.raw.use_class || "—"}</td>
                    <td className="px-2 py-1">{row.raw.deal_type}</td>
                    <td className="px-2 py-1">{row.raw.deal_date || "—"}</td>
                    <td className="px-2 py-1">{row.raw.source || "—"}</td>
                    <td className="px-2 py-1">
                      {row.error ? (
                        <span className="text-red-700" title={row.error}>✗ {row.error}</span>
                      ) : (
                        <span className="text-emerald-700">✓ ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              disabled={validCount === 0 || busy}
              onClick={importAll}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${validCount} comparable${validCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toParsed(raw: Record<string, string>): ParsedRow {
  if (!raw.address) return { raw, payload: null, error: "missing address" };
  const rent = parseFloat(raw.rent_pa_gbp);
  if (!Number.isFinite(rent) || rent <= 0) {
    return { raw, payload: null, error: "rent_pa_gbp must be a positive number" };
  }
  const area_sqft = raw.area_sqft ? parseFloat(raw.area_sqft) : null;
  const frontage_m = raw.frontage_m ? parseFloat(raw.frontage_m) : null;
  const use_class = raw.use_class || null;
  const deal_date = raw.deal_date || null;
  if (deal_date && !/^\d{4}-\d{2}-\d{2}$/.test(deal_date)) {
    return { raw, payload: null, error: "deal_date must be YYYY-MM-DD" };
  }
  const deal_type = raw.deal_type || "letting";
  if (!["letting", "rent_review", "sale"].includes(deal_type)) {
    return { raw, payload: null, error: `unknown deal_type "${deal_type}"` };
  }
  const source = raw.source || "manual";
  if (!["rightmove", "egi", "internal", "manual"].includes(source)) {
    return { raw, payload: null, error: `unknown source "${source}"` };
  }
  return {
    raw,
    error: null,
    payload: {
      address: raw.address,
      rent_pa_gbp: rent,
      area_sqft,
      frontage_m,
      use_class,
      deal_date,
      deal_type,
      source,
      notes: raw.notes || null,
    },
  };
}

function downloadTemplate() {
  const example = [
    CSV_TEMPLATE_HEADERS.join(","),
    `"22 Crouch End Broadway, London N8",52000,1100,5.2,E(b),2025-06-04,rent_review,egi,"Settled review on similar unit"`,
    `"5 Topsfield Parade, London N8",65000,1340,6.4,E(b),2024-03-18,letting,egi,"Wine bar — strong covenant"`,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([example], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "comparables-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---- helpers -----------------------------------------------------------

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-xs ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-neutral-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function EmptyState() {
  return (
    <SharedEmptyState
      icon={UploadIcon}
      title="No comparables yet"
      description="Add at least 3 to generate a rent-review pack with meaningful evidence. Settled reviews on this platform feed back automatically."
      actions={[
        { label: "Add manually", href: "#add", variant: "primary" },
        { label: "Import CSV", href: "#import", variant: "secondary" },
      ]}
      hint="Sources: Rightmove, EGi, internal deal sheets, manual paste."
    />
  );
}

function Loading() { return <div className="text-sm text-neutral-500">Loading…</div>; }

function cmp(a: Comparable, b: Comparable, key: SortKey): number {
  switch (key) {
    case "address": return a.address.localeCompare(b.address);
    case "rent":    return a.rent_pa_gbp - b.rent_pa_gbp;
    case "area":    return (a.area_sqft ?? 0) - (b.area_sqft ?? 0);
    case "psf": {
      const ap = a.area_sqft ? a.rent_pa_gbp / a.area_sqft : 0;
      const bp = b.area_sqft ? b.rent_pa_gbp / b.area_sqft : 0;
      return ap - bp;
    }
    case "date":    return (a.deal_date ?? "").localeCompare(b.deal_date ?? "");
  }
}
