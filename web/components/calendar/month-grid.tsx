"use client";

import { useMemo } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { LeaseEvent } from "@/lib/api";
import { EVENT_TYPE_TONE } from "@/components/ui/status-pill";

const TONE_BG: Record<string, string> = {
  info: "bg-blue-100 text-blue-900",
  warn: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-900",
  success: "bg-emerald-100 text-emerald-900",
  violet: "bg-violet-100 text-violet-900",
  amber: "bg-amber-100 text-amber-900",
  sky: "bg-sky-100 text-sky-900",
  orange: "bg-orange-100 text-orange-900",
  neutral: "bg-neutral-100 text-neutral-700",
};

const EVENT_LABEL_SHORT: Record<string, string> = {
  rent_review_trigger: "Review prep",
  rent_review_effective: "Review",
  break_notice_deadline: "Break notice",
  break_date: "Break",
  lease_expiry: "Expiry",
  deposit_return: "Deposit",
  insurance_renewal: "Insurance",
  epc_expiry: "EPC",
};

interface Props {
  /** First day of the month being shown. */
  monthAnchor: Date;
  events: LeaseEvent[];
  onEventClick: (event: LeaseEvent) => void;
  /** Optional date click (e.g. expand day) — currently unused. */
  onDateClick?: (date: Date) => void;
}

interface Cell {
  date: Date;
  inMonth: boolean;
  events: LeaseEvent[];
}

export function MonthGrid({ monthAnchor, events, onEventClick }: Props) {
  const cells = useMemo<Cell[]>(() => {
    // UK convention: weeks start Monday
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 });
    const out: Cell[] = [];
    let cur = start;
    while (cur <= end) {
      const dayEvents = events
        .filter((e) => isSameDay(parseISO(e.event_date), cur))
        .sort((a, b) => a.event_date.localeCompare(b.event_date));
      out.push({
        date: cur,
        inMonth: isSameMonth(cur, monthAnchor),
        events: dayEvents,
      });
      cur = addDays(cur, 1);
    }
    return out;
  }, [monthAnchor, events]);

  // Pre-build the weekday header
  const weekdays = useMemo(() => {
    const start = startOfWeek(monthAnchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEE"));
  }, [monthAnchor]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
        {weekdays.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 grid-flow-row auto-rows-[minmax(120px,1fr)]">
        {cells.map((cell, idx) => (
          <DayCell
            key={cell.date.toISOString()}
            cell={cell}
            isLastInRow={(idx + 1) % 7 === 0}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  cell,
  isLastInRow,
  onEventClick,
}: {
  cell: Cell;
  isLastInRow: boolean;
  onEventClick: (event: LeaseEvent) => void;
}) {
  const visible = cell.events.slice(0, 3);
  const overflow = cell.events.length - visible.length;
  const today = isToday(cell.date);

  return (
    <div
      className={`relative min-h-[120px] border-b border-neutral-100 p-1.5 ${
        isLastInRow ? "" : "border-r"
      } ${cell.inMonth ? "bg-white" : "bg-neutral-50/60"}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs tabular-nums ${
            today
              ? "bg-blue-600 font-semibold text-white"
              : cell.inMonth
              ? "text-neutral-700"
              : "text-neutral-400"
          }`}
        >
          {format(cell.date, "d")}
        </span>
      </div>

      <div className="space-y-1">
        {visible.map((e) => {
          const tone = EVENT_TYPE_TONE[e.event_type] ?? "neutral";
          return (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              title={e.title}
              className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95 ${TONE_BG[tone]}`}
            >
              <span className="truncate">{EVENT_LABEL_SHORT[e.event_type] ?? e.event_type} — {e.lease_label}</span>
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            onClick={() => cell.events[3] && onEventClick(cell.events[3])}
            className="w-full rounded px-1.5 py-0.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-100"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}
