"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  ChevronRight,
  KanbanSquare,
  Package,
  Send,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { api, type LeaseEvent, type PackSummary } from "@/lib/api";

type ColumnKey = "pending" | "draft" | "sent" | "settled";

interface PendingCard {
  kind: "pending";
  id: string; // event id
  lease_id: string;
  lease_label: string;
  trigger_date: string;
}

interface PackCard {
  kind: "pack";
  id: string; // pack id
  pack: PackSummary;
}

type Card = PendingCard | PackCard;

const COLUMN_META: Record<ColumnKey, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  pending: { label: "Pack pending",  icon: Clock,         tone: "border-t-neutral-400" },
  draft:   { label: "Draft",         icon: Package,       tone: "border-t-blue-600" },
  sent:    { label: "Sent",          icon: Send,          tone: "border-t-violet-600" },
  settled: { label: "Settled",       icon: CheckCircle2,  tone: "border-t-emerald-600" },
};

export default function ReviewsBoard() {
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api.listEvents({ days_ahead: 365 * 3, days_behind: 30 }).catch(() => []),
      api.listPacks().catch(() => []),
    ]).then(([e, p]) => {
      setEvents(e);
      setPacks(p);
    });

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      // Poll while anything is generating
      setPacks((prev) => {
        if (prev?.some((p) => p.status === "generating")) void load();
        return prev;
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const columns = useMemo(() => buildColumns(events, packs), [events, packs]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <KanbanSquare size={22} className="text-neutral-400" />
            Rent reviews
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Every rent review across the portfolio, by stage. Click into any card to act.
          </p>
        </div>
        <Link
          href="/calendar"
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          View on calendar →
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {events === null || packs === null ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(COLUMN_META) as ColumnKey[]).map((key) => (
            <Column
              key={key}
              keyName={key}
              cards={columns[key]}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- pure column builder ------------------------------------------------

function buildColumns(
  events: LeaseEvent[] | null,
  packs: PackSummary[] | null
): Record<ColumnKey, Card[]> {
  const result: Record<ColumnKey, Card[]> = {
    pending: [],
    draft: [],
    sent: [],
    settled: [],
  };
  if (!events || !packs) return result;

  const eventsWithPacks = new Set(
    packs.map((p) => p.lease_event_id).filter((x): x is string => Boolean(x))
  );

  // Pending: rent_review_trigger events (past or future) with no pack yet
  for (const e of events) {
    if (e.event_type !== "rent_review_trigger") continue;
    if (eventsWithPacks.has(e.id)) continue;
    result.pending.push({
      kind: "pending",
      id: e.id,
      lease_id: e.lease_id,
      lease_label: e.lease_label,
      trigger_date: e.event_date,
    });
  }
  (result.pending as PendingCard[]).sort((a, b) =>
    a.trigger_date.localeCompare(b.trigger_date)
  );

  // Draft / Sent / Settled — group packs by status
  const drafts: PackCard[] = [];
  const sents: PackCard[] = [];
  const settleds: PackCard[] = [];
  for (const p of packs) {
    if (p.status === "draft" || p.status === "generating") {
      drafts.push({ kind: "pack", id: p.id, pack: p });
    } else if (p.status === "sent") {
      sents.push({ kind: "pack", id: p.id, pack: p });
    } else if (p.status === "settled") {
      settleds.push({ kind: "pack", id: p.id, pack: p });
    }
  }
  drafts.sort((a, b) => packCreated(b.pack).localeCompare(packCreated(a.pack)));
  sents.sort((a, b) => packSent(b.pack).localeCompare(packSent(a.pack)));
  settleds.sort((a, b) => packSettled(b.pack).localeCompare(packSettled(a.pack)));
  result.draft = drafts;
  result.sent = sents;
  result.settled = settleds;

  return result;
}

function packCreated(p: PackSummary): string { return p.created_at; }
function packSent(p: PackSummary): string { return p.sent_at ?? p.created_at; }
function packSettled(p: PackSummary): string { return p.settled_at ?? p.created_at; }

// ---- column ------------------------------------------------------------

function Column({
  keyName,
  cards,
  onChanged,
}: {
  keyName: ColumnKey;
  cards: Card[];
  onChanged: () => void;
}) {
  const meta = COLUMN_META[keyName];
  const Icon = meta.icon;
  return (
    <section className={`flex flex-col rounded-lg border border-neutral-200 bg-neutral-50 border-t-4 ${meta.tone}`}>
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
          <Icon size={14} className="text-neutral-500" />
          {meta.label}
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-600 border border-neutral-200 tabular-nums">
          {cards.length}
        </span>
      </header>
      <div className="flex-1 space-y-2 px-2 pb-2">
        {cards.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 bg-white px-3 py-6 text-center text-xs text-neutral-400">
            Empty
          </div>
        ) : (
          cards.map((c) => (
            c.kind === "pending"
              ? <PendingCardView key={c.id} card={c} onChanged={onChanged} />
              : <PackCardView key={c.id} card={c} onChanged={onChanged} />
          ))
        )}
      </div>
    </section>
  );
}

// ---- pending card -------------------------------------------------------

function PendingCardView({ card, onChanged }: { card: PendingCard; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const dt = parseISO(card.trigger_date);
  const days = differenceInDays(dt, new Date());

  async function generate() {
    setBusy(true);
    try {
      const pack = await api.generatePackForEvent(card.id);
      router.push(`/packs/${pack.id}`);
      onChanged();
    } catch (e) {
      alert(`Failed: ${e}`);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="text-sm font-medium text-neutral-900 truncate" title={card.lease_label}>
        {card.lease_label}
      </div>
      <div className="mt-1 text-xs text-neutral-500 tabular-nums">
        Trigger {format(dt, "d MMM yyyy")} · {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate pack"}
        </button>
        <Link
          href={`/leases/${card.lease_id}`}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Lease →
        </Link>
      </div>
    </div>
  );
}

// ---- pack card (covers Draft / Sent / Settled) --------------------------

function PackCardView({ card, onChanged }: { card: PackCard; onChanged: () => void }) {
  const p = card.pack;
  const [busy, setBusy] = useState(false);

  async function markSent() {
    if (!confirm("Mark this pack as sent to the tenant?")) return;
    setBusy(true);
    try {
      await api.markPackSent(p.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const upliftPct =
    p.settled_rent_gbp != null && p.current_rent_gbp != null
      ? ((p.settled_rent_gbp - p.current_rent_gbp) / p.current_rent_gbp) * 100
      : null;

  return (
    <Link
      href={`/packs/${p.id}`}
      className="block rounded-md border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-neutral-900 truncate flex-1" title={p.lease_label ?? ""}>
          {p.lease_label ?? p.lease_id.slice(0, 8)}
        </div>
        <ChevronRight size={14} className="shrink-0 text-neutral-400" />
      </div>

      {/* Headline numbers */}
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-500">
        {p.current_rent_gbp != null && (
          <div>
            <div className="uppercase tracking-wide">Current</div>
            <div className="text-sm font-medium text-neutral-900 tabular-nums">£{p.current_rent_gbp.toLocaleString()}</div>
          </div>
        )}
        {p.status !== "settled" && p.recommended_opening_gbp != null && (
          <div>
            <div className="uppercase tracking-wide">Opening</div>
            <div className="text-sm font-medium text-neutral-900 tabular-nums">£{p.recommended_opening_gbp.toLocaleString()}</div>
          </div>
        )}
        {p.status === "settled" && p.settled_rent_gbp != null && (
          <div>
            <div className="uppercase tracking-wide">Settled</div>
            <div className="text-sm font-medium text-emerald-700 tabular-nums">£{p.settled_rent_gbp.toLocaleString()}</div>
          </div>
        )}
      </div>

      {p.status === "settled" && upliftPct != null && (
        <div className={`mt-2 text-xs font-medium ${upliftPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {upliftPct >= 0 ? "+" : ""}{upliftPct.toFixed(1)}% uplift
        </div>
      )}

      {/* Card-level actions */}
      {p.status === "draft" && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void markSent(); }}
            disabled={busy}
            className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Mark sent"}
          </button>
        </div>
      )}
      {p.status === "sent" && (
        <div className="mt-2 text-xs text-neutral-500">
          Click card → record settlement
        </div>
      )}

      <div className="mt-2 text-[11px] text-neutral-400 tabular-nums">
        {p.status === "settled" && p.settled_at
          ? `Settled ${format(parseISO(p.settled_at), "d MMM yyyy")}`
          : p.status === "sent" && p.sent_at
          ? `Sent ${format(parseISO(p.sent_at), "d MMM yyyy")}`
          : `Created ${format(parseISO(p.created_at), "d MMM yyyy")}`}
      </div>
    </Link>
  );
}
