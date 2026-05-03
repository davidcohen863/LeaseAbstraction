"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { api, type LeaseDetail, type LeaseEvent, type PackSummary } from "@/lib/api";
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
}

export function RightRail({ lease, onApprove }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    Promise.all([
      api
        .listEvents({ days_ahead: 730, days_behind: 0 })
        .then((all) => all.filter((e) => e.lease_id === lease.id))
        .catch(() => [] as LeaseEvent[]),
      api.listPacks({ lease_id: lease.id }).catch(() => [] as PackSummary[]),
    ]).then(([e, p]) => {
      setEvents(e);
      setPacks(p);
    });
  }, [lease.id]);

  const critical = (events ?? [])
    .filter((e) => CRITICAL_TYPES.has(e.event_type))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  async function generatePack(eventId: string) {
    setGenerating(eventId);
    try {
      const pack = await api.generatePackForEvent(eventId);
      router.push(`/packs/${pack.id}`);
    } catch (e) {
      alert(`Failed: ${e}`);
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
