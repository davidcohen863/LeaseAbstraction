"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

/**
 * Firm-level metadata. v1: stored client-side in localStorage so the
 * settings hub feels real without yet adding a backend `firms` table.
 * Server-side persistence is a follow-up once we have multi-firm needs.
 */

interface FirmSettings {
  firmName: string;
  address: string;
  defaultSurveyor: string;
  defaultClient: string;
}

const STORAGE_KEY = "leaseos.firm";

const EMPTY: FirmSettings = {
  firmName: "Claridges Commercial",
  address: "",
  defaultSurveyor: "",
  defaultClient: "",
};

export default function FirmPage() {
  const [settings, setSettings] = useState<FirmSettings>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  if (!hydrated) return null;

  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Firm</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Defaults applied across packs and digests. Stored locally for now.
        </p>
      </header>

      <form
        onSubmit={save}
        className="rounded-lg border border-neutral-200 bg-white p-6 space-y-5 max-w-2xl"
      >
        <Field
          label="Firm name"
          value={settings.firmName}
          onChange={(v) => setSettings((s) => ({ ...s, firmName: v }))}
          placeholder="Claridges Commercial"
        />
        <Field
          label="Registered address"
          value={settings.address}
          onChange={(v) => setSettings((s) => ({ ...s, address: v }))}
          placeholder="14 Crouch End Broadway, London N8 8DU"
          textarea
        />
        <Field
          label="Default surveyor (signed pack letters)"
          value={settings.defaultSurveyor}
          onChange={(v) => setSettings((s) => ({ ...s, defaultSurveyor: v }))}
          placeholder="Sarah Bennett MRICS"
        />
        <Field
          label="Default landlord client (used when uploading a new lease)"
          value={settings.defaultClient}
          onChange={(v) => setSettings((s) => ({ ...s, defaultClient: v }))}
          placeholder="(none)"
        />

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-neutral-500">
            These settings live in your browser. A firm-wide store is on the
            roadmap once you add a second user.
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
          >
            <Save size={14} /> {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {textarea ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      )}
    </label>
  );
}
