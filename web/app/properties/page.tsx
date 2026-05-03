"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Building2, Trash2 } from "lucide-react";
import { api, type PropertySummary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RowActions } from "@/components/ui/row-actions";

export default function PropertiesPage() {
  const { data: props, loading, refetching, error, refetch } = useApi<PropertySummary[]>(
    (opts) => api.listProperties(opts),
  );
  const [search, setSearch] = useState("");
  const [groupByClient, setGroupByClient] = useState(false);

  const filtered = useMemo(() => {
    if (!props) return null;
    const q = search.trim().toLowerCase();
    if (!q) return props;
    return props.filter(
      (p) =>
        p.address.toLowerCase().includes(q) ||
        (p.landlord_client ?? "").toLowerCase().includes(q) ||
        (p.sector ?? "").toLowerCase().includes(q)
    );
  }, [props, search]);

  const grouped = useMemo(() => {
    if (!filtered || !groupByClient) return null;
    const m = new Map<string, PropertySummary[]>();
    for (const p of filtered) {
      const k = p.landlord_client?.trim() || "(no client)";
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupByClient]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Each physical address with one or more leases over its lifetime.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={groupByClient}
              onChange={(e) => setGroupByClient(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Group by client
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, client, sector…"
            className="w-72 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState error={error} onRetry={refetch} retrying={refetching} compact />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : props === null ? (
        // Errored on first load with no cached data — banner above is the message.
        null
      ) : props.length === 0 ? (
        <EmptyState />
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(([client, items]) => (
            <section key={client}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {client} <span className="text-neutral-400">({items.length})</span>
              </h2>
              <PropertyTable items={items} onChanged={refetch} />
            </section>
          ))}
        </div>
      ) : (
        <PropertyTable items={filtered ?? []} onChanged={refetch} />
      )}
    </div>
  );
}

function PropertyTable({ items, onChanged }: { items: PropertySummary[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();

  async function deleteProperty(p: PropertySummary) {
    const hasLeases = p.lease_count > 0;
    const ok = await confirm({
      title: hasLeases ? "Force-delete this property?" : "Delete this property?",
      description: hasLeases ? (
        <>
          <p className="mb-2">
            <span className="font-medium">{p.address}</span>
          </p>
          <p>
            {p.lease_count} lease{p.lease_count === 1 ? "" : "s"} are still attached.
            Force-deleting unlinks them — they survive but lose their Property
            pointer. The next lease upload at this address creates a fresh
            Property record.
          </p>
        </>
      ) : (
        <>
          <span className="font-medium">{p.address}</span>
        </>
      ),
      confirmLabel: hasLeases ? "Unlink leases & delete" : "Delete property",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteProperty(p.id, { force: hasLeases });
      toast.success("Property deleted");
      onChanged();
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3 text-right">Leases</th>
            <th className="px-4 py-3">Next event</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-neutral-50">
              <td className="px-4 py-3">
                <Link
                  href={`/properties/${p.id}`}
                  className="flex items-center gap-2 font-medium text-neutral-900 hover:underline"
                >
                  <Building2 size={14} className="text-neutral-400" />
                  <span className="truncate">{p.address}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-600">{p.sector ?? "—"}</td>
              <td className="px-4 py-3 text-neutral-600">{p.landlord_client ?? "—"}</td>
              <td className="px-4 py-3 text-right text-neutral-700 tabular-nums">{p.lease_count}</td>
              <td className="px-4 py-3 text-neutral-600">
                {p.next_event_date ? (
                  <div>
                    <div className="text-neutral-900">{format(parseISO(p.next_event_date), "d MMM yyyy")}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[28ch]">{p.next_event_title}</div>
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1">
                  <Link href={`/properties/${p.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
                    Open →
                  </Link>
                  <RowActions
                    label={`Actions for ${p.address}`}
                    actions={[
                      { label: "Delete", icon: Trash2, onClick: () => deleteProperty(p), destructive: true },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <SharedEmptyState
      icon={Building2}
      title="No properties yet"
      description="Properties are auto-created when you upload a lease — the address is normalised so two leases at the same building roll up to one Property record."
      actions={[{ label: "Upload a lease", href: "/leases", variant: "primary" }]}
    />
  );
}

function Loading() {
  return <div className="text-sm text-neutral-500">Loading…</div>;
}
