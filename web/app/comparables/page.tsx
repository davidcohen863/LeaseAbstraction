"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { api, type Comparable } from "@/lib/api";

const SOURCE_LABEL: Record<string, string> = {
  rightmove: "Rightmove",
  egi: "EGi",
  internal: "Internal (settled)",
  manual: "Manual",
};

const DEAL_LABEL: Record<string, string> = {
  letting: "New letting",
  rent_review: "Settled review",
  sale: "Sale",
};

export default function ComparablesPage() {
  const [comps, setComps] = useState<Comparable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => api.listComparables().then(setComps).catch((e) => setError(String(e)));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comparables</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Market evidence used by the rent-review pack generator. Add lettings, settled reviews and sales here.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          {showForm ? "Close" : "Add comparable"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {showForm && (
        <ComparableForm
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {comps === null ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : comps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="text-neutral-700 font-medium">No comparables yet</div>
          <p className="text-sm text-neutral-500 mt-1">
            Add at least 3 to generate a rent-review pack with meaningful evidence.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-right">Rent £/yr</th>
                <th className="px-4 py-3 text-right">Sq ft</th>
                <th className="px-4 py-3 text-right">£/sq ft</th>
                <th className="px-4 py-3">Use</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {comps.map((c) => {
                const psf = c.area_sqft && c.area_sqft > 0 ? (c.rent_pa_gbp / c.area_sqft).toFixed(0) : "—";
                return (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.address}</td>
                    <td className="px-4 py-3 text-right">£{c.rent_pa_gbp.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{c.area_sqft ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{psf === "—" ? "—" : `£${psf}`}</td>
                    <td className="px-4 py-3 text-neutral-600">{c.use_class ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-600">{DEAL_LABEL[c.deal_type] ?? c.deal_type}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {c.deal_date ? format(parseISO(c.deal_date), "d MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{SOURCE_LABEL[c.source] ?? c.source}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete comparable "${c.address}"?`)) return;
                          await api.deleteComparable(c.id);
                          void load();
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ComparableForm({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const fd = new FormData(e.currentTarget);
          await api.createComparable({
            address: String(fd.get("address") || ""),
            rent_pa_gbp: parseFloat(String(fd.get("rent_pa_gbp") || "0")),
            area_sqft: fd.get("area_sqft") ? parseFloat(String(fd.get("area_sqft"))) : null,
            frontage_m: fd.get("frontage_m") ? parseFloat(String(fd.get("frontage_m"))) : null,
            use_class: (fd.get("use_class") as string) || null,
            deal_date: (fd.get("deal_date") as string) || null,
            deal_type: (fd.get("deal_type") as string) || "letting",
            source: (fd.get("source") as string) || "manual",
            notes: (fd.get("notes") as string) || null,
          });
          onCreated();
        } catch (e) {
          setErr(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Address *">
        <input required name="address" className={inputCls} placeholder="14 Crouch End Broadway, London N8" />
      </Field>
      <Field label="Rent £/yr *">
        <input required type="number" step="0.01" name="rent_pa_gbp" className={inputCls} placeholder="50000" />
      </Field>
      <Field label="Area (sq ft)">
        <input type="number" step="0.01" name="area_sqft" className={inputCls} placeholder="1100" />
      </Field>
      <Field label="Frontage (m)">
        <input type="number" step="0.01" name="frontage_m" className={inputCls} placeholder="5.2" />
      </Field>
      <Field label="Use class">
        <input name="use_class" className={inputCls} placeholder="E or E(b)" />
      </Field>
      <Field label="Deal date">
        <input type="date" name="deal_date" className={inputCls} />
      </Field>
      <Field label="Deal type">
        <select name="deal_type" className={inputCls} defaultValue="letting">
          <option value="letting">New letting</option>
          <option value="rent_review">Settled rent review</option>
          <option value="sale">Sale</option>
        </select>
      </Field>
      <Field label="Source">
        <select name="source" className={inputCls} defaultValue="manual">
          <option value="rightmove">Rightmove</option>
          <option value="egi">EGi</option>
          <option value="internal">Internal</option>
          <option value="manual">Manual</option>
        </select>
      </Field>
      <Field label="Notes" full>
        <textarea name="notes" className={inputCls} rows={2} placeholder="Tenant covenant, term, incentives…" />
      </Field>
      {err && <div className="sm:col-span-2 text-sm text-red-700">{err}</div>}
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save comparable"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-xs ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-neutral-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
