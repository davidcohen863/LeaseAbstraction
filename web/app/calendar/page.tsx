"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, isPast, parseISO } from "date-fns";
import { api, type LeaseEvent } from "@/lib/api";

const EVENT_LABEL: Record<string, string> = {
  rent_review_trigger: "Rent review — prepare pack",
  rent_review_effective: "Rent review effective",
  break_notice_deadline: "Break notice deadline",
  break_date: "Break date",
  lease_expiry: "Lease expiry",
  deposit_return: "Deposit return",
  insurance_renewal: "Insurance renewal",
};

const EVENT_STYLE: Record<string, string> = {
  rent_review_trigger: "bg-blue-100 text-blue-800",
  rent_review_effective: "bg-blue-100 text-blue-800",
  break_notice_deadline: "bg-red-100 text-red-800",
  break_date: "bg-amber-100 text-amber-800",
  lease_expiry: "bg-purple-100 text-purple-800",
  deposit_return: "bg-emerald-100 text-emerald-800",
  insurance_renewal: "bg-neutral-100 text-neutral-700",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEvents({ days_ahead: 730, days_behind: 30 })
      .then(setEvents)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Every lease event in the next 24 months. Critical events highlight in red.
        </p>
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
        <ol className="space-y-2">
          {events.map((e) => {
            const dt = parseISO(e.event_date);
            const overdue = isPast(dt);
            return (
              <li
                key={e.id}
                className={`rounded-lg border bg-white p-4 ${
                  overdue ? "border-red-300" : "border-neutral-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_STYLE[e.event_type] ?? EVENT_STYLE.insurance_renewal}`}>
                        {EVENT_LABEL[e.event_type] ?? e.event_type}
                      </span>
                      {overdue && (
                        <span className="text-xs text-red-700 font-medium">overdue</span>
                      )}
                    </div>
                    <Link
                      href={`/leases/${e.lease_id}`}
                      className="font-medium hover:underline"
                    >
                      {e.title}
                    </Link>
                    {e.description && (
                      <p className="mt-1 text-sm text-neutral-600">{e.description}</p>
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
          })}
        </ol>
      )}
    </div>
  );
}
