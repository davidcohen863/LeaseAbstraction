"use client";

import { useMemo } from "react";
import Link from "next/link";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  FileText,
  Package,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { api, type LeaseEvent, type LeaseSummary, type PackSummary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { humanise } from "@/lib/humanise";
import { ErrorState } from "@/components/ui/error-state";
import { StatusPill } from "@/components/ui/status-pill";

const CRITICAL_TYPES = new Set([
  "break_notice_deadline",
  "rent_review_trigger",
  "lease_expiry",
  "epc_expiry",
]);

export default function TodayPage() {
  const leasesQ = useApi<LeaseSummary[]>((opts) => api.listLeases(opts));
  const eventsQ = useApi<LeaseEvent[]>((opts) =>
    api.listEvents({ days_ahead: 365, days_behind: 7 }, opts)
  );
  const packsQ = useApi<PackSummary[]>((opts) => api.listPacks(undefined, opts));

  const leases = leasesQ.data;
  const events = eventsQ.data;
  const packs = packsQ.data;
  const stats = useMemo(() => buildStats(leases, events, packs), [leases, events, packs]);

  // One Retry button covers all three queries — they all hit the same backend.
  const anyError = leasesQ.error || eventsQ.error || packsQ.error;
  const retryAll = () => {
    leasesQ.refetch();
    eventsQ.refetch();
    packsQ.refetch();
  };
  const anyRetrying = leasesQ.refetching || eventsQ.refetching || packsQ.refetching;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm text-neutral-500">{format(new Date(), "EEEE d MMMM yyyy")}</p>
        <h1 className="mt-1 text-2xl font-semibold">Good {timeOfDayGreeting()}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Here&apos;s what needs your attention.
        </p>
      </header>

      {/* Top-of-page error banner — surfaced if ANY of the three queries
         failed, so a network blip stops being invisible. */}
      {anyError && (
        <div className="mb-6">
          <ErrorState error={anyError} onRetry={retryAll} retrying={anyRetrying} compact />
        </div>
      )}

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 mb-6">
        <KpiCard
          label="Leases"
          value={stats.leasesCount}
          sub={stats.leasesApproved == null ? undefined : `${stats.leasesApproved} approved`}
          icon={FileText}
          href="/leases"
        />
        <KpiCard
          label="Rent roll"
          value={stats.rentRollGbp == null ? "—" : `£${formatNumber(stats.rentRollGbp)}`}
          sub="across approved leases"
          icon={TrendingUp}
        />
        <KpiCard
          label="Reviews next 90d"
          value={stats.reviewsSoon}
          sub={stats.reviewsTotal == null ? undefined : `${stats.reviewsTotal} on calendar`}
          icon={CalendarDays}
          href="/calendar"
        />
        <KpiCard
          label="Breaks next 90d"
          value={stats.breaksSoon}
          sub="break-notice deadlines"
          icon={AlertTriangle}
          tone={stats.breaksSoon > 0 ? "warn" : "neutral"}
          href="/calendar"
        />
        <KpiCard
          label="Packs in flight"
          value={stats.packsInFlight}
          sub={stats.packsSettled == null ? undefined : `${stats.packsSettled} settled`}
          icon={Package}
          href="/packs"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Action this week — primary column */}
        <section className="lg:col-span-2 rounded-lg border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Action this week</h2>
            <Link href="/calendar" className="text-xs text-neutral-500 hover:text-neutral-800">
              View full calendar →
            </Link>
          </div>
          {eventsQ.loading ? (
            <Loading />
          ) : eventsQ.error ? (
            <EmptySlot text="—" />
          ) : stats.actionItems.length === 0 ? (
            <EmptySlot text="Nothing critical in the next 30 days. ✅" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {stats.actionItems.map((e) => (
                <ActionItem key={e.id} event={e} />
              ))}
            </ul>
          )}
        </section>

        {/* Recent activity — secondary column */}
        <aside className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Recent activity</h2>
          </div>
          {(leasesQ.loading || packsQ.loading) ? (
            <Loading />
          ) : (leasesQ.error || packsQ.error) ? (
            <EmptySlot text="—" />
          ) : stats.recent.length === 0 ? (
            <EmptySlot text="No recent activity." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {stats.recent.map((item, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-0.5 text-neutral-400">
                    <item.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={item.href} className="text-sm text-neutral-900 hover:underline truncate block">
                      {item.title}
                    </Link>
                    <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                      <Clock size={11} />
                      {item.relative}
                      {item.tag && <span>· {item.tag}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Empty-state nudge if there are no leases at all */}
      {leases !== null && leases.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
          <Sparkles className="mx-auto mb-3 text-neutral-400" />
          <h3 className="text-base font-medium text-neutral-900">Welcome to LeaseOS.</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Upload your first commercial lease to see this dashboard come alive.
          </p>
          <Link
            href="/leases"
            className="mt-4 inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            Upload a lease
          </Link>
        </div>
      )}
    </div>
  );
}

// ---- pieces -------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: "neutral" | "warn";
  href?: string;
}) {
  const valueCls = tone === "warn" && Number(value) > 0 ? "text-red-700" : "text-neutral-900";
  const inner = (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-300 transition-colors">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-neutral-500">
        <span>{label}</span>
        <Icon size={16} className="text-neutral-400" />
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ActionItem({ event }: { event: LeaseEvent }) {
  const dt = parseISO(event.event_date);
  const days = differenceInDays(dt, new Date());
  const overdue = days < 0;
  const urgent = !overdue && days <= 14;

  const accent = overdue ? "border-l-red-600" : urgent ? "border-l-amber-500" : "border-l-blue-500";

  return (
    <li className={`flex items-start justify-between gap-4 px-4 py-3 border-l-4 ${accent}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <StatusPill group="event_type" value={event.event_type} />
          {overdue && <span className="text-xs font-medium text-red-700">overdue</span>}
          {urgent && <span className="text-xs font-medium text-amber-700">soon</span>}
        </div>
        <Link href={`/leases/${event.lease_id}`} className="text-sm font-medium text-neutral-900 hover:underline">
          {event.title}
        </Link>
        {event.description && (
          <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{event.description}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-neutral-900 tabular-nums">{format(dt, "d MMM")}</div>
        <div className="text-xs text-neutral-500 tabular-nums">
          {overdue ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`}
        </div>
      </div>
    </li>
  );
}

function Loading() {
  return <div className="px-4 py-10 text-center text-sm text-neutral-500">Loading…</div>;
}

function EmptySlot({ text }: { text: string }) {
  return <div className="px-4 py-10 text-center text-sm text-neutral-500">{text}</div>;
}

// ---- stats computation --------------------------------------------------

interface ComputedStats {
  leasesCount: number | string;
  leasesApproved: number | null;
  rentRollGbp: number | null;
  reviewsSoon: number | string;
  reviewsTotal: number | null;
  breaksSoon: number;
  packsInFlight: number | string;
  packsSettled: number | null;
  actionItems: LeaseEvent[];
  recent: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; href: string; relative: string; tag?: string }[];
}

function buildStats(
  leases: LeaseSummary[] | null,
  events: LeaseEvent[] | null,
  packs: PackSummary[] | null
): ComputedStats {
  const now = new Date();

  // Leases
  const leasesCount: number | string = leases ? leases.length : "—";
  const leasesApproved = leases ? leases.filter((l) => l.status === "approved").length : null;

  // Rent roll — sum from approved leases' record_json.initial_rent_gbp.value (we don't load that
  // detail in the list endpoint, so leave blank for v1; future: extend list endpoint).
  const rentRollGbp = null;

  // Reviews & breaks in next 90 days
  const horizon90 = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  let reviewsSoon = 0;
  let breaksSoon = 0;
  let reviewsTotal: number | null = null;
  if (events) {
    reviewsTotal = events.filter((e) => e.event_type === "rent_review_trigger" || e.event_type === "rent_review_effective").length;
    for (const e of events) {
      const dt = parseISO(e.event_date);
      if (dt > horizon90 || dt < now) continue;
      if (e.event_type === "rent_review_trigger" || e.event_type === "rent_review_effective") reviewsSoon += 1;
      if (e.event_type === "break_notice_deadline" || e.event_type === "break_date") breaksSoon += 1;
    }
  }

  // Packs
  const packsInFlight: number | string = packs
    ? packs.filter((p) => p.status === "draft" || p.status === "sent" || p.status === "generating").length
    : "—";
  const packsSettled = packs ? packs.filter((p) => p.status === "settled").length : null;

  // Action items — critical events in next 30 days, sorted by date
  const horizon30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const actionItems = events
    ? events
        .filter((e) => CRITICAL_TYPES.has(e.event_type))
        .filter((e) => {
          const d = parseISO(e.event_date);
          return d >= start && d <= horizon30;
        })
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 8)
    : [];

  // Recent activity — combine recently-approved leases + recently-created packs
  const recent: ComputedStats["recent"] = [];
  if (leases) {
    leases
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 3)
      .forEach((l) => {
        recent.push({
          icon: FileText,
          title: l.label,
          href: `/leases/${l.id}`,
          relative: relativeTime(l.updated_at),
          tag: humanise("lease_status", l.status),
        });
      });
  }
  if (packs) {
    packs
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 2)
      .forEach((p) => {
        recent.push({
          icon: Package,
          title: `Pack — ${p.lease_label ?? p.lease_id.slice(0, 8)}`,
          href: `/packs/${p.id}`,
          relative: relativeTime(p.created_at),
          tag: humanise("pack_status", p.status),
        });
      });
  }
  // De-noise: keep most-recent 5
  recent.sort((a, b) => 0); // already roughly ordered
  recent.splice(5);

  return {
    leasesCount,
    leasesApproved,
    rentRollGbp,
    reviewsSoon,
    reviewsTotal,
    breaksSoon,
    packsInFlight,
    packsSettled,
    actionItems,
    recent,
  };
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function relativeTime(iso: string): string {
  const dt = parseISO(iso);
  const diffMs = Date.now() - dt.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(dt, "d MMM");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}
