"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { differenceInDays, parseISO } from "date-fns";
import { AlertTriangle, Bell, BellRing, CalendarDays } from "lucide-react";
import { api, type LeaseEvent } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/**
 * Lightweight notification feed driven by the existing /events endpoint.
 *
 * What counts as a "notification" today:
 *   - Any critical event (rent review trigger, break notice, lease expiry,
 *     EPC expiry) within the next 30 days
 *   - Anything overdue (event_date in the past, status still "upcoming")
 *
 * The unread count is just `notifications.length`. There's no read/unread
 * persistence — clicking through to the lease is the implicit acknowledgement.
 * Real per-user read state can land alongside the eventual notifications
 * backend without changing this UI's shape.
 */

const CRITICAL_TYPES = new Set([
  "break_notice_deadline",
  "rent_review_trigger",
  "lease_expiry",
  "epc_expiry",
]);

const TYPE_LABEL: Record<string, string> = {
  break_notice_deadline: "Break notice",
  rent_review_trigger: "Review pack prep",
  lease_expiry: "Lease expiry",
  epc_expiry: "EPC expiry",
};

interface NotificationItem {
  event: LeaseEvent;
  days: number;
  overdue: boolean;
  label: string;
}

function buildNotifications(events: LeaseEvent[]): NotificationItem[] {
  const today = new Date();
  return events
    .filter((e) => CRITICAL_TYPES.has(e.event_type))
    .filter((e) => e.status === "upcoming")
    .map<NotificationItem>((e) => {
      const days = differenceInDays(parseISO(e.event_date), today);
      return {
        event: e,
        days,
        overdue: days < 0,
        label: TYPE_LABEL[e.event_type] ?? e.event_type,
      };
    })
    .filter((n) => n.overdue || n.days <= 30)
    .sort((a, b) => a.days - b.days);
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Soft refetch every 5 minutes so the count stays current without polling
  // hard. The page's own `useApi` calls handle the data the user is actually
  // looking at; this is just for the bell badge.
  const eventsQ = useApi<LeaseEvent[]>(
    (opts) => api.listEvents({ days_ahead: 60, days_behind: 30 }, opts),
  );
  useEffect(() => {
    const id = setInterval(() => eventsQ.refetch(), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifications = useMemo(
    () => (eventsQ.data ? buildNotifications(eventsQ.data) : []),
    [eventsQ.data],
  );
  const overdueCount = notifications.filter((n) => n.overdue).length;
  const unread = notifications.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread${overdueCount ? `, ${overdueCount} overdue` : ""}`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
              overdueCount > 0 ? "bg-red-600" : "bg-amber-500"
            }`}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-40 mt-2 w-96 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 text-sm">
            <span className="font-medium">
              Notifications{unread > 0 && <span className="ml-2 text-xs text-neutral-500">{unread}</span>}
            </span>
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-700 hover:underline"
            >
              View calendar
            </Link>
          </div>
          {eventsQ.loading ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              <Bell size={20} className="mx-auto mb-2 text-neutral-300" />
              You&apos;re all caught up.
            </div>
          ) : (
            <ol className="max-h-96 overflow-y-auto divide-y divide-neutral-100">
              {notifications.map((n) => (
                <NotificationRow key={n.event.id} item={n} onNavigate={() => setOpen(false)} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onNavigate,
}: {
  item: NotificationItem;
  onNavigate: () => void;
}) {
  const { event: e, days, overdue, label } = item;
  const tone = overdue
    ? "bg-red-50 text-red-700"
    : days <= 7
      ? "bg-amber-50 text-amber-700"
      : "bg-neutral-100 text-neutral-600";
  const Icon = overdue ? AlertTriangle : CalendarDays;
  const when = overdue
    ? `${Math.abs(days)}d overdue`
    : days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : `in ${days}d`;
  return (
    <li>
      <Link
        href={`/leases/${e.lease_id}`}
        onClick={onNavigate}
        className="flex items-start gap-3 px-3 py-2.5 hover:bg-neutral-50"
      >
        <div className={`mt-0.5 rounded-md p-1.5 shrink-0 ${tone}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-neutral-900">{label}</span>
            <span
              className={`text-xs tabular-nums shrink-0 ${
                overdue ? "text-red-700 font-semibold" : "text-neutral-500"
              }`}
            >
              {when}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-500 truncate" title={e.lease_label}>
            {e.lease_label}
          </div>
        </div>
      </Link>
    </li>
  );
}
