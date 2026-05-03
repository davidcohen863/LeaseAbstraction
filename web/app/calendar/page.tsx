"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  differenceInDays,
  format,
  formatDistanceToNow,
  isPast,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, List as ListIcon } from "lucide-react";
import { api, type LeaseEvent } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/ui/toast";
import { StatusPill, EVENT_TYPE_TONE } from "@/components/ui/status-pill";
import { ErrorState } from "@/components/ui/error-state";
import { MonthGrid } from "@/components/calendar/month-grid";
import { EventDrawer } from "@/components/calendar/event-drawer";

type ViewMode = "month" | "list";

const ALL_EVENT_TYPES: { value: string; label: string }[] = [
  { value: "rent_review_trigger", label: "Review prep" },
  { value: "rent_review_effective", label: "Review effective" },
  { value: "break_notice_deadline", label: "Break notice" },
  { value: "break_date", label: "Break date" },
  { value: "lease_expiry", label: "Lease expiry" },
  { value: "deposit_return", label: "Deposit return" },
  { value: "insurance_renewal", label: "Insurance renewal" },
  { value: "epc_expiry", label: "EPC expiry" },
];

export default function CalendarPage() {
  // Pull a wide window once. Future: refetch on month nav if portfolio is huge.
  const eventsQ = useApi<LeaseEvent[]>(
    (opts) => api.listEvents({ days_ahead: 365 * 15, days_behind: 365 * 2 }, opts),
  );
  const events = eventsQ.data;
  const error = eventsQ.error;

  const [view, setView] = useState<ViewMode>("month");
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [activeEvent, setActiveEvent] = useState<LeaseEvent | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(ALL_EVENT_TYPES.map((t) => t.value))
  );

  const filtered = useMemo(() => {
    if (!events) return [] as LeaseEvent[];
    return events.filter((e) => enabledTypes.has(e.event_type));
  }, [events, enabledTypes]);

  function toggleType(t: string) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function selectAllTypes() {
    setEnabledTypes(new Set(ALL_EVENT_TYPES.map((t) => t.value)));
  }
  function clearAllTypes() {
    setEnabledTypes(new Set());
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Every lease event across your portfolio. Click any event for details and quick actions.
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </header>

      {error && (
        <div className="mb-6">
          <ErrorState error={error} onRetry={eventsQ.refetch} retrying={eventsQ.refetching} compact />
        </div>
      )}

      {/* Type filter chips */}
      <TypeFilters
        enabled={enabledTypes}
        onToggle={toggleType}
        onSelectAll={selectAllTypes}
        onClearAll={clearAllTypes}
      />

      {eventsQ.loading ? (
        <Loading />
      ) : events === null ? (
        // Errored on first load — banner above is the message.
        null
      ) : view === "month" ? (
        <MonthView
          monthAnchor={monthAnchor}
          setMonthAnchor={setMonthAnchor}
          events={filtered}
          onEventClick={setActiveEvent}
        />
      ) : (
        <ListView events={filtered} />
      )}

      <EventDrawer event={activeEvent} onClose={() => setActiveEvent(null)} />
    </div>
  );
}

// ---- view toggle --------------------------------------------------------

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-neutral-200 bg-white p-0.5">
      <button
        onClick={() => onChange("month")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm ${
          view === "month" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
        }`}
      >
        <CalendarDays size={14} />
        Month
      </button>
      <button
        onClick={() => onChange("list")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-sm ${
          view === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
        }`}
      >
        <ListIcon size={14} />
        List
      </button>
    </div>
  );
}

// ---- type filter chips --------------------------------------------------

function TypeFilters({
  enabled,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  enabled: Set<string>;
  onToggle: (t: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-neutral-500 mr-1">Filter</span>
      {ALL_EVENT_TYPES.map((t) => {
        const active = enabled.has(t.value);
        const tone = EVENT_TYPE_TONE[t.value] ?? "neutral";
        return (
          <button
            key={t.value}
            onClick={() => onToggle(t.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              active
                ? toneActiveClass(tone)
                : "border-neutral-200 bg-white text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        );
      })}
      <span className="ml-2 text-xs text-neutral-400">
        <button onClick={onSelectAll} className="hover:text-neutral-700">All</button>
        <span className="mx-1">·</span>
        <button onClick={onClearAll} className="hover:text-neutral-700">None</button>
      </span>
    </div>
  );
}

function toneActiveClass(tone: string): string {
  switch (tone) {
    case "info": return "border-blue-600 bg-blue-600 text-white";
    case "warn": return "border-amber-500 bg-amber-500 text-white";
    case "danger": return "border-red-600 bg-red-600 text-white";
    case "success": return "border-emerald-600 bg-emerald-600 text-white";
    case "violet": return "border-violet-600 bg-violet-600 text-white";
    case "amber": return "border-amber-500 bg-amber-500 text-white";
    case "sky": return "border-sky-600 bg-sky-600 text-white";
    case "orange": return "border-orange-500 bg-orange-500 text-white";
    default: return "border-neutral-300 bg-neutral-300 text-neutral-800";
  }
}

// ---- month view ---------------------------------------------------------

function MonthView({
  monthAnchor,
  setMonthAnchor,
  events,
  onEventClick,
}: {
  monthAnchor: Date;
  setMonthAnchor: (d: Date) => void;
  events: LeaseEvent[];
  onEventClick: (e: LeaseEvent) => void;
}) {
  const monthEventCount = useMemo(
    () =>
      events.filter((e) => {
        const d = parseISO(e.event_date);
        return d.getUTCFullYear() === monthAnchor.getFullYear() && d.getUTCMonth() === monthAnchor.getMonth();
      }).length,
    [events, monthAnchor]
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthAnchor(subMonths(monthAnchor, 1))}
            aria-label="Previous month"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setMonthAnchor(startOfMonth(new Date()))}
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50"
          >
            Today
          </button>
          <button
            onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}
            aria-label="Next month"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <ChevronRight size={16} />
          </button>
          <h2 className="ml-1 text-lg font-semibold tabular-nums">{format(monthAnchor, "MMMM yyyy")}</h2>
        </div>
        <div className="text-xs text-neutral-500 tabular-nums">
          {monthEventCount} event{monthEventCount === 1 ? "" : "s"} this month
        </div>
      </div>
      <MonthGrid monthAnchor={monthAnchor} events={events} onEventClick={onEventClick} />
    </>
  );
}

// ---- list view (preserved + bumped polish) ------------------------------

function ListView({ events }: { events: LeaseEvent[] }) {
  const grouped = useMemo(() => {
    const m = new Map<number, LeaseEvent[]>();
    for (const e of events) {
      const y = parseISO(e.event_date).getUTCFullYear();
      const arr = m.get(y) ?? [];
      arr.push(e);
      m.set(y, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a - b);
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
        No events match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {grouped.map(([year, yearEvents]) => (
        <section key={year}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">{year}</h2>
          <ol className="space-y-2">
            {yearEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function EventRow({ e }: { e: LeaseEvent }) {
  const router = useRouter();
  const toast = useToast();
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
      toast.success("Pack queued — opening…");
      router.push(`/packs/${pack.id}`);
    } catch (err) {
      toast.error("Couldn't generate pack", {
        description: err instanceof Error ? err.message : String(err),
      });
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border bg-white p-4 ${
        overdue ? "border-red-300" : urgent ? "border-amber-300" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusPill group="event_type" value={e.event_type} />
            {overdue && <span className="text-xs text-red-700 font-medium">overdue</span>}
            {urgent && <span className="text-xs text-amber-700 font-medium">soon</span>}
          </div>
          <Link href={`/leases/${e.lease_id}`} className="font-medium hover:underline">
            {e.title}
          </Link>
          {e.description && <p className="mt-1 text-sm text-neutral-600">{e.description}</p>}
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
          <div className="text-sm font-medium text-neutral-900 tabular-nums">{format(dt, "d MMM yyyy")}</div>
          <div className="text-xs text-neutral-500">{formatDistanceToNow(dt, { addSuffix: true })}</div>
        </div>
      </div>
    </li>
  );
}

function Loading() {
  return <div className="text-sm text-neutral-500">Loading…</div>;
}
