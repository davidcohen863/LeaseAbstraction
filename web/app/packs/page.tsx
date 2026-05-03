"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Package } from "lucide-react";
import { api, type PackSummary } from "@/lib/api";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

export default function PacksListPage() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api.listPacks().then(setPacks).catch((e) => setError(String(e)));
    void load();
    const id = setInterval(() => {
      setPacks((prev) => {
        if (prev?.some((p) => p.status === "generating")) void load();
        return prev;
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Rent-review packs</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Generate packs from the Critical Dates banner on a lease, or from a rent-review event in the Calendar.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {packs === null ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : packs.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No review packs yet"
          description="A pack contains the landlord memo, comparables schedule, ITZA analysis, and trigger letter. They auto-generate at T-6 months before each rent review, or you can trigger one manually from the calendar."
          actions={[
            { label: "Open the Reviews kanban", href: "/reviews", variant: "primary" },
            { label: "View the Calendar", href: "/calendar", variant: "secondary" },
          ]}
          hint="The auto-trigger cron runs daily at 06:00 UTC."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Lease</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Current £</th>
                <th className="px-4 py-3 text-right">Opening £</th>
                <th className="px-4 py-3 text-right">Settled £</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {packs.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/packs/${p.id}`} className="font-medium hover:underline">
                      {p.lease_label ?? p.lease_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill group="pack_status" value={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">{p.current_rent_gbp ? `£${p.current_rent_gbp.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-right">{p.recommended_opening_gbp ? `£${p.recommended_opening_gbp.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-right">{p.settled_rent_gbp ? `£${p.settled_rent_gbp.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{format(parseISO(p.created_at), "d MMM yyyy")}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/packs/${p.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
