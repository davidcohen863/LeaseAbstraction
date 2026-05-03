"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, FileEdit, ScrollText } from "lucide-react";
import { api, type AuditEntry } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";

export default function AuditPage() {
  const { data: entries, loading, refetching, error, refetch } = useApi<AuditEntry[]>(
    (opts) => api.listAudit({ limit: 200 }, opts),
  );
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "field_edit" | "lease_approved">("all");

  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (!q) return true;
      const blob = `${e.lease_label} ${e.field_path ?? ""} ${e.actor_user_id ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [entries, search, kindFilter]);

  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Every reviewer edit and lease approval, newest first. Read-only.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by lease, field, user…"
          className="h-9 flex-1 min-w-[200px] rounded-md border border-neutral-300 px-3 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        <div className="inline-flex rounded-md border border-neutral-300 bg-white text-sm overflow-hidden">
          {(["all", "field_edit", "lease_approved"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1.5 ${
                kindFilter === k ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {k === "all" ? "All" : k === "field_edit" ? "Edits" : "Approvals"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorState error={error} onRetry={refetch} retrying={refetching} compact />
        </div>
      )}

      {loading ? (
        <SkeletonList />
      ) : filtered === null ? (
        // Errored on first load — banner above is the message.
        null
      ) : filtered.length === 0 ? (
        entries && entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
            No matches for the current filter.
          </div>
        )
      ) : (
        <ol className="rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100">
          {filtered.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const when = new Date(entry.created_at);
  const ago = relativeTime(when);
  return (
    <li className="px-4 py-3 flex items-start gap-3 text-sm">
      <KindIcon kind={entry.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/leases/${entry.lease_id}`}
            className="font-medium text-neutral-900 hover:underline"
          >
            {entry.lease_label}
          </Link>
          {entry.kind === "field_edit" && entry.field_path && (
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-mono text-neutral-700">
              {entry.field_path}
            </code>
          )}
          <span className="text-xs text-neutral-500" title={when.toLocaleString()}>
            {ago}
          </span>
        </div>
        {entry.kind === "field_edit" ? (
          <ValueDiff before={entry.before_value} after={entry.after_value} />
        ) : (
          <p className="mt-0.5 text-xs text-neutral-600">Lease approved.</p>
        )}
      </div>
    </li>
  );
}

function KindIcon({ kind }: { kind: AuditEntry["kind"] }) {
  if (kind === "lease_approved") {
    return (
      <div className="mt-0.5 rounded-md bg-emerald-100 p-1.5 text-emerald-700 shrink-0">
        <Check size={14} />
      </div>
    );
  }
  return (
    <div className="mt-0.5 rounded-md bg-blue-100 p-1.5 text-blue-700 shrink-0">
      <FileEdit size={14} />
    </div>
  );
}

function ValueDiff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="mt-1 text-xs text-neutral-600 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      <span className="text-neutral-400">from</span>
      <code className="font-mono break-all line-through decoration-red-300/70 text-neutral-500">
        {fmt(before)}
      </code>
      <span className="text-neutral-400">to</span>
      <code className="font-mono break-all text-neutral-800">{fmt(after)}</code>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
        <ScrollText size={18} />
      </div>
      <p className="mt-3 text-sm font-medium text-neutral-800">No activity yet</p>
      <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">
        Every reviewer edit and lease approval will appear here. Try editing a
        flagged field on any lease — the change shows up in this log within
        seconds.
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex items-start gap-3 animate-pulse">
          <div className="h-7 w-7 rounded-md bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-neutral-100" />
            <div className="h-3 w-2/3 rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function relativeTime(d: Date): string {
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}
