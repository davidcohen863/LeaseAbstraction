"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { api, type PackSummary, type PackStatus } from "@/lib/api";

const STATUS_STYLE: Record<PackStatus, string> = {
  generating: "bg-amber-100 text-amber-800",
  draft: "bg-blue-100 text-blue-800",
  sent: "bg-violet-100 text-violet-800",
  settled: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

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
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="text-neutral-700 font-medium">No packs yet</div>
          <p className="text-sm text-neutral-500 mt-1">
            Open a lease and click <span className="font-medium">Generate review pack</span> on its rent-review event.
          </p>
        </div>
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                      {p.status}
                    </span>
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
