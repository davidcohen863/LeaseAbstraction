"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { differenceInDays, format, parseISO } from "date-fns";
import { Building2, FileText, Pencil } from "lucide-react";
import { api, type PropertyDetail } from "@/lib/api";
import { StatusPill } from "@/components/ui/status-pill";

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [prop, setProp] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = () =>
    api.getProperty(id).then(setProp).catch((e) => setError(String(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="p-8 text-sm text-red-700">{error}</div>;
  if (!prop) return <div className="p-8 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 mb-2">
        <Link href="/today" className="hover:text-neutral-800">Home</Link>
        <span aria-hidden>›</span>
        <Link href="/properties" className="hover:text-neutral-800">Properties</Link>
        <span aria-hidden>›</span>
        <span className="text-neutral-800 truncate max-w-[40ch]">{prop.address}</span>
      </nav>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Building2 size={20} className="text-neutral-400" />
            <span className="truncate">{prop.address}</span>
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-neutral-500">
            <span>{prop.lease_count} lease{prop.lease_count === 1 ? "" : "s"}</span>
            {prop.sector && <span>· {prop.sector}</span>}
            {prop.landlord_client && <span>· {prop.landlord_client}</span>}
          </div>
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          <Pencil size={14} />
          {editing ? "Cancel" : "Edit"}
        </button>
      </header>

      {editing && <EditForm prop={prop} onSaved={() => { setEditing(false); void load(); }} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lease history */}
        <section className="lg:col-span-2 rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Lease history</h2>
          </div>
          {prop.leases.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">No leases on this property yet.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {prop.leases.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leases/${l.id}`} className="flex items-center gap-2 font-medium text-neutral-900 hover:underline truncate">
                      <FileText size={14} className="text-neutral-400" />
                      {l.label}
                    </Link>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Added {format(parseISO(l.created_at), "d MMM yyyy")}
                    </div>
                  </div>
                  <StatusPill group="lease_status" value={l.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming events */}
        <aside className="rounded-lg border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Upcoming events</h2>
            <Link href="/calendar" className="text-xs text-neutral-500 hover:text-neutral-800">All →</Link>
          </div>
          {prop.upcoming_events.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">Nothing upcoming.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {prop.upcoming_events.slice(0, 8).map((e) => {
                const dt = parseISO(e.event_date);
                const days = differenceInDays(dt, new Date());
                return (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <StatusPill group="event_type" value={e.event_type} />
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-neutral-900 truncate">{e.title}</div>
                    <div className="text-xs text-neutral-500">{format(dt, "d MMM yyyy")}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {prop.notes && (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{prop.notes}</p>
        </section>
      )}
    </div>
  );
}

function EditForm({ prop, onSaved }: { prop: PropertyDetail; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const fd = new FormData(e.currentTarget);
          await api.patchProperty(prop.id, {
            sector: (fd.get("sector") as string) || null,
            landlord_client: (fd.get("landlord_client") as string) || null,
            notes: (fd.get("notes") as string) || null,
          });
          onSaved();
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-xs">
        <span className="text-neutral-500 uppercase tracking-wide">Sector</span>
        <input
          name="sector"
          defaultValue={prop.sector ?? ""}
          placeholder="Retail / Office / Industrial / F1 / F2…"
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs">
        <span className="text-neutral-500 uppercase tracking-wide">Landlord client</span>
        <input
          name="landlord_client"
          defaultValue={prop.landlord_client ?? ""}
          placeholder="e.g. Patel Holdings Ltd"
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="text-neutral-500 uppercase tracking-wide">Notes</span>
        <textarea
          name="notes"
          defaultValue={prop.notes ?? ""}
          rows={3}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </label>
      {error && <div className="sm:col-span-2 text-sm text-red-700">{error}</div>}
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

