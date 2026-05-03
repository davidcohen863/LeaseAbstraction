"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  differenceInDays,
  format,
  formatDistanceToNow,
  isPast,
  parseISO,
} from "date-fns";
import { api, type LeaseEvent } from "@/lib/api";

const EVENT_LABEL: Record<string, string> = {
  rent_review_trigger: "Rent review — prepare pack",
  rent_review_effective: "Rent review effective",
  break_notice_deadline: "Break notice deadline",
  break_date: "Break date",
  lease_expiry: "Lease expiry",
  deposit_return: "Deposit return",
  insurance_renewal: "Insurance renewal",
  epc_expiry: "EPC expiry",
};

// Bold pills — colour-coded by event class, readable at a glance.
const EVENT_STYLE: Record<string, string> = {
  rent_review_trigger: "bg-blue-600 text-white",
  rent_review_effective: "bg-blue-600 text-white",
  break_notice_deadline: "bg-red-600 text-white",
  break_date: "bg-amber-500 text-white",
  lease_expiry: "bg-violet-600 text-white",
  deposit_return: "bg-emerald-600 text-white",
  insurance_renewal: "bg-sky-600 text-white",
  epc_expiry: "bg-orange-500 text-white",
};

interface YearGroup {
  year: number;
  events: LeaseEvent[];
}

export default function CalendarPage() {
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 15-year horizon — covers a full 15-year retail lease term comfortably.
    api
      .listEvents({ days_ahead: 365 * 15, days_behind: 30 })
      .then(setEvents)
      .catch((e) => setError(String(e)));
  }, []);

  const grouped: YearGroup[] = useMemo(() => {
    if (!events) return [];
    const byYear = new Map<number, LeaseEvent[]>();
    for (const e of events) {
      const y = parseISO(e.event_date).getUTCFullYear();
      const arr = byYear.get(y) ?? [];
      arr.push(e);
      byYear.set(y, arr);
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, evs]) => ({ year, events: evs }));
  }, [events]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Every upcoming lease event, grouped by year. Critical events highlight in red.
          </p>
        </div>
        {events && (
          <div className="text-xs text-neutral-500">
            {events.length} event{events.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {events === null ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="text-neutral-700 font-medium">No events yet</div>
          <p className="text-sm text-neutral-500 mt-1">
            Approve a lease and its events will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ year, events: yearEvents }) => (
            <section key={year}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                {year}
              </h2>
              <ol className="space-y-2">
                {yearEvents.map((e) => (
                  <EventRow key={e.id} e={e} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: LeaseEvent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const dt = parseISO(e.event_date);
  const overdue = isPast(dt);
  const days = differenceInDays(dt, new Date());
  const urgent = !overdue && days <= 90;
  const isReview = e.event_type === "rent_review_trigger";

  async function generatePack() {
    setBusy(true);
    try {
      const pack = await api.generatePackForEvent(e.id);
      router.push(`/packs/${pack.id}`);
    } catch (err) {
      alert(`Failed: ${err}`);
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border bg-white p-4 ${
        overdue
          ? "border-red-300"
          : urgent
          ? "border-amber-300"
          : "border-neutral-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                EVENT_STYLE[e.event_type] ?? EVENT_STYLE.insurance_renewal
              }`}
            >
              {EVENT_LABEL[e.event_type] ?? e.event_type}
            </span>
            {overdue && <span className="text-xs text-red-700 font-medium">overdue</span>}
            {urgent && <span className="text-xs text-amber-700 font-medium">soon</span>}
          </div>
          <Link href={`/leases/${e.lease_id}`} className="font-medium hover:underline">
            {e.title}
          </Link>
          {e.description && (
            <p className="mt-1 text-sm text-neutral-600">{e.description}</p>
          )}
          {isReview && (
            <button
              onClick={generatePack}
              disabled={busy}
              className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate review pack"}
            </button>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-medium text-neutral-900">
            {format(dt, "d MMM yyyy")}
          </div>
          <div className="text-xs text-neutral-500">
            {formatDistanceToNow(dt, { addSuffix: true })}
          </div>
        </div>
      </div>
    </li>
  );
}
