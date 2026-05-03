"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInDays, format, parseISO } from "date-fns";
import { X, ExternalLink, Package } from "lucide-react";
import { api, type LeaseEvent } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/components/ui/status-pill";

interface Props {
  event: LeaseEvent | null;
  onClose: () => void;
}

export function EventDrawer({ event, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!event) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;

  const dt = parseISO(event.event_date);
  const days = differenceInDays(dt, new Date());
  const overdue = days < 0;
  const isReview = event.event_type === "rent_review_trigger";

  async function generatePack() {
    if (!event) return;
    setGenerating(true);
    try {
      const pack = await api.generatePackForEvent(event.id);
      toast.success("Pack queued — opening…");
      onClose();
      router.push(`/packs/${pack.id}`);
    } catch (e) {
      toast.error("Couldn't generate pack", {
        description: e instanceof Error ? e.message : String(e),
      });
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-labelledby="event-drawer-title"
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2">
              <StatusPill group="event_type" value={event.event_type} />
            </div>
            <h2 id="event-drawer-title" className="text-base font-semibold text-neutral-900">
              {event.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* When */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">When</h3>
            <div className="text-sm text-neutral-900">
              {format(dt, "EEEE d MMMM yyyy")}
            </div>
            <div className={`mt-0.5 text-xs tabular-nums ${overdue ? "text-red-700" : days <= 30 ? "text-amber-700" : "text-neutral-500"}`}>
              {overdue ? `${Math.abs(days)} days ago` : days === 0 ? "Today" : `In ${days} days`}
            </div>
          </section>

          {/* Description */}
          {event.description && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Detail</h3>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{event.description}</p>
            </section>
          )}

          {/* Lease link */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Lease</h3>
            <Link
              href={`/leases/${event.lease_id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
            >
              {event.lease_label}
              <ExternalLink size={12} />
            </Link>
          </section>

          {/* Push status */}
          {(event.pushed_to_google || event.pushed_to_outlook) && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Synced to</h3>
              <div className="flex gap-2 text-xs">
                {event.pushed_to_google && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Google Calendar ✓</span>
                )}
                {event.pushed_to_outlook && (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Outlook ✓</span>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 mt-4 border-t border-neutral-100 bg-white px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {isReview && (
              <button
                onClick={generatePack}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Package size={14} />
                {generating ? "Generating…" : "Generate review pack"}
              </button>
            )}
            <Link
              href={`/leases/${event.lease_id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Open lease →
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
