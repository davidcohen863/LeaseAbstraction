"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  Building2,
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  FileText,
  Package,
  Paperclip,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  api,
  type AncillaryDocumentRole,
  type AuditEntry,
  type DocumentOut,
  type LeaseDetail,
  type LeaseEvent,
  type PackSummary,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/components/ui/status-pill";

const CRITICAL_TYPES = new Set([
  "break_notice_deadline",
  "rent_review_trigger",
  "lease_expiry",
  "epc_expiry",
]);

interface Props {
  lease: LeaseDetail;
  onApprove: () => Promise<void>;
  onChanged: () => Promise<void>;
}

export function RightRail({ lease, onApprove, onChanged }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [activity, setActivity] = useState<AuditEntry[] | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    Promise.all([
      api
        .listEvents({ days_ahead: 730, days_behind: 0 })
        .then((all) => all.filter((e) => e.lease_id === lease.id))
        .catch(() => [] as LeaseEvent[]),
      api.listPacks({ lease_id: lease.id }).catch(() => [] as PackSummary[]),
      api.listLeaseAudit(lease.id, { limit: 8 }).catch(() => [] as AuditEntry[]),
    ]).then(([e, p, a]) => {
      setEvents(e);
      setPacks(p);
      setActivity(a);
    });
  }, [lease.id, lease.updated_at]);

  const critical = (events ?? [])
    .filter((e) => CRITICAL_TYPES.has(e.event_type))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  async function generatePack(eventId: string) {
    setGenerating(eventId);
    try {
      const pack = await api.generatePackForEvent(eventId);
      toast.success("Pack queued — opening…");
      router.push(`/packs/${pack.id}`);
    } catch (e) {
      toast.error("Couldn't generate pack", {
        description: e instanceof Error ? e.message : String(e),
      });
      setGenerating(null);
    }
  }

  return (
    <aside className="h-full overflow-y-auto bg-neutral-50 p-4 space-y-5">
      {/* Approve / status block */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
          Status
        </div>
        <div className="mb-3">
          <StatusPill group="lease_status" value={lease.status} />
        </div>
        {lease.status === "approved" ? (
          <button
            disabled
            className="w-full rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800"
          >
            <Check size={14} className="inline -mt-0.5 mr-1" /> Approved
          </button>
        ) : lease.status === "ready_for_review" ? (
          <button
            disabled={approving}
            onClick={async () => {
              setApproving(true);
              try {
                await onApprove();
              } finally {
                setApproving(false);
              }
            }}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {approving ? "Approving…" : "Approve lease"}
          </button>
        ) : null}
      </section>

      {/* Critical dates */}
      {critical.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-2">
            Critical dates
          </div>
          <ul className="space-y-2">
            {critical.map((e) => {
              const dt = parseISO(e.event_date);
              const days = differenceInDays(dt, new Date());
              const overdue = days < 0;
              const urgent = !overdue && days <= 90;
              const label =
                e.event_type === "break_notice_deadline"
                  ? "Break notice"
                  : e.event_type === "rent_review_trigger"
                  ? "Review pack prep"
                  : e.event_type === "lease_expiry"
                  ? "Expiry"
                  : "EPC expiry";
              const isReview = e.event_type === "rent_review_trigger";
              return (
                <li key={e.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-medium ${
                        overdue ? "text-red-700" : urgent ? "text-amber-900" : "text-neutral-800"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-700">
                      {format(dt, "d MMM yyyy")}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 tabular-nums">
                    {overdue ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`}
                  </div>
                  {isReview && (
                    <button
                      onClick={() => generatePack(e.id)}
                      disabled={generating === e.id}
                      className="mt-1 w-full rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {generating === e.id ? "Generating…" : "Generate pack"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Quick links */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
          Related
        </div>
        <ul className="space-y-1">
          {lease.property_id && (
            <QuickLink
              href={`/properties/${lease.property_id}`}
              icon={Building2}
              label="Property page"
            />
          )}
          <QuickLink href="/calendar" icon={CalendarDays} label="All events" />
          <QuickLink
            href={api.documentUrl(lease.id)}
            icon={FileText}
            label="Original PDF"
            download
          />
        </ul>
      </section>

      {/* Side-letters / variations / licences */}
      <AttachedDocs lease={lease} onChanged={onChanged} />

      {/* Packs for this lease */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Review packs
          </div>
          {packs && packs.length > 0 && (
            <span className="text-xs text-neutral-400 tabular-nums">{packs.length}</span>
          )}
        </div>
        {packs === null ? (
          <div className="text-xs text-neutral-400">Loading…</div>
        ) : packs.length === 0 ? (
          <div className="text-xs text-neutral-500">No packs yet for this lease.</div>
        ) : (
          <ul className="space-y-2">
            {packs.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/packs/${p.id}`}
                  className="block rounded-md border border-neutral-200 px-2 py-1.5 text-xs hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-1">
                    <Package size={12} className="text-neutral-400" />
                    <StatusPill group="pack_status" value={p.status} />
                  </div>
                  <div className="mt-0.5 text-neutral-500 tabular-nums">
                    {p.recommended_opening_gbp
                      ? `Open £${p.recommended_opening_gbp.toLocaleString()}`
                      : "Pending…"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity */}
      <ActivityPanel entries={activity} />

      {/* Document meta */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
          Document
        </div>
        <div className="space-y-1 text-xs text-neutral-600">
          <div className="flex justify-between">
            <span>Pages</span>
            <span className="tabular-nums text-neutral-800">{lease.document_count > 0 ? "—" : 0}</span>
          </div>
          {lease.extraction_seconds && (
            <div className="flex justify-between">
              <span>Extracted in</span>
              <span className="tabular-nums text-neutral-800">{lease.extraction_seconds.toFixed(1)}s</span>
            </div>
          )}
          {lease.extraction_model && (
            <div className="flex justify-between">
              <span>Model</span>
              <span className="text-neutral-500 truncate max-w-[14ch]" title={lease.extraction_model}>
                {lease.extraction_model}
              </span>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

// ---- Attached side-letters / variations / licences ---------------------

const ROLE_LABELS: Record<string, string> = {
  side_letter: "Side-letter",
  variation: "Deed of variation",
  licence_to_alter: "Licence to alter",
  licence_to_assign: "Licence to assign",
  rent_deposit_deed: "Rent deposit deed",
  schedule_of_condition: "Schedule of condition",
  other: "Other",
};

function AttachedDocs({ lease, onChanged }: { lease: LeaseDetail; onChanged: () => Promise<void> }) {
  const ancillaries = lease.documents.filter((d) => d.role !== "lease");
  const [uploading, setUploading] = useState(false);
  const [pickRole, setPickRole] = useState<AncillaryDocumentRole>("side_letter");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Poll while any attached doc is mid-summarising
  useEffect(() => {
    if (!ancillaries.some((d) => d.summary_status === "pending" || d.summary_status === "summarising")) return;
    const id = setInterval(() => {
      void onChanged();
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancillaries.map((d) => d.summary_status).join("|")]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.attachDocument(lease.id, file, pickRole);
      }
      const n = files.length;
      toast.success(`Attached ${n} document${n === 1 ? "" : "s"}`, {
        description: "Summary will appear here once Claude finishes reading.",
      });
      await onChanged();
    } catch (e) {
      toast.error("Upload failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 flex items-center gap-1.5">
          <Paperclip size={12} />
          Side-letters &amp; variations
        </div>
        {ancillaries.length > 0 && (
          <span className="text-xs text-neutral-400 tabular-nums">{ancillaries.length}</span>
        )}
      </div>

      {ancillaries.length === 0 ? (
        <p className="text-xs text-neutral-500 mb-3">
          No ancillary documents attached. Add side-letters, deeds of variation, or licences to alter.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {ancillaries.map((d) => (
            <AncillaryItem key={d.id} doc={d} leaseId={lease.id} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <select
          value={pickRole}
          onChange={(e) => setPickRole(e.target.value as AncillaryDocumentRole)}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:border-neutral-500 focus:outline-none"
          disabled={uploading}
        >
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
            uploading ? "bg-neutral-200 text-neutral-500" : "bg-neutral-900 text-white hover:bg-neutral-700"
          }`}
        >
          <Plus size={12} />
          {uploading ? "Uploading…" : "Attach"}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            disabled={uploading}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>
    </section>
  );
}

function AncillaryItem({ doc, leaseId, onChanged }: { doc: DocumentOut; leaseId: string; onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function deleteDoc() {
    const ok = await confirm({
      title: `Delete "${doc.filename}"?`,
      description: "The file is removed from the server. Cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteAttachedDocument(leaseId, doc.id);
      toast.success("Document deleted");
      await onChanged();
    } catch (e) {
      toast.error("Couldn't delete", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setDeleting(false);
    }
  }

  const roleLabel = ROLE_LABELS[doc.role] ?? doc.role;
  const status = doc.summary_status;

  return (
    <li className="rounded border border-neutral-200 bg-neutral-50/40 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
              {roleLabel}
            </span>
            {status === "pending" && <span className="text-[10px] text-amber-700">queued</span>}
            {status === "summarising" && <span className="text-[10px] text-amber-700">summarising…</span>}
            {status === "done" && <span className="text-[10px] text-emerald-700">summarised ✓</span>}
            {status === "failed" && <span className="text-[10px] text-red-700">failed</span>}
          </div>
          <div className="mt-0.5 truncate font-medium text-neutral-900" title={doc.filename}>
            {doc.filename}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <a
            href={api.ancillaryDocumentUrl(leaseId, doc.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            title="Download"
          >
            <Download size={12} />
          </a>
          <button
            onClick={deleteDoc}
            disabled={deleting}
            className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {(status === "done" || status === "failed") && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[11px] text-blue-700 hover:underline"
        >
          {expanded ? "Hide summary" : "Show summary"}
        </button>
      )}

      {expanded && status === "done" && doc.summary_markdown && (
        <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] leading-relaxed text-neutral-800 border border-neutral-200">
          {doc.summary_markdown}
        </pre>
      )}
      {expanded && status === "failed" && doc.summary_error && (
        <div className="mt-2 flex items-start gap-1 rounded bg-red-50 p-2 text-[11px] text-red-800 border border-red-200">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{doc.summary_error.split("\n")[0]}</span>
        </div>
      )}
    </li>
  );
}

function ActivityPanel({ entries }: { entries: AuditEntry[] | null }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Activity
        </div>
        {entries && entries.length > 0 && (
          <Link href="/settings/audit" className="text-[11px] text-blue-700 hover:underline">
            View all
          </Link>
        )}
      </div>
      {entries === null ? (
        <div className="text-xs text-neutral-400">Loading…</div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No edits or approvals yet. Reviewer changes will show up here.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-neutral-800">
                  {e.kind === "lease_approved" ? "Approved" : (e.field_path ?? "Edit")}
                </span>
                <span
                  className="text-[10px] tabular-nums text-neutral-400"
                  title={new Date(e.created_at).toLocaleString()}
                >
                  {shortAgo(new Date(e.created_at))}
                </span>
              </div>
              {e.kind === "field_edit" && (
                <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {fmtCompact(e.before_value)} → <span className="text-neutral-700">{fmtCompact(e.after_value)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function fmtCompact(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v.length > 30 ? v.slice(0, 30) + "…" : v;
  try {
    const s = JSON.stringify(v);
    return s.length > 30 ? s.slice(0, 30) + "…" : s;
  } catch {
    return String(v);
  }
}

function shortAgo(d: Date): string {
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d`;
  return d.toLocaleDateString();
}

function QuickLink({
  href,
  icon: Icon,
  label,
  download,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  download?: boolean;
}) {
  if (download) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          <Icon size={14} className="text-neutral-400" />
          {label}
          <Download size={11} className="ml-auto text-neutral-400" />
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        <Icon size={14} className="text-neutral-400" />
        {label}
        <ExternalLink size={11} className="ml-auto text-neutral-400" />
      </Link>
    </li>
  );
}
