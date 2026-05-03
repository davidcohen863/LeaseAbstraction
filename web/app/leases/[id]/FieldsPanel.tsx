"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { humaniseCompositeValue, humaniseKey } from "@/lib/humanise";

interface Citation {
  page: number;
  clause_reference?: string | null;
  quote: string;
}

interface FieldNode {
  path: string;
  label: string;
  /** Leaf value (string-coerced for display). */
  value: string | null;
  /** For composite fields, a list of "Sub-field: value" entries. */
  items: string[] | null;
  citation: Citation | null;
  confidence: "high" | "low";
  notes: string | null;
}

interface Props {
  leaseId: string;
  record: Record<string, unknown>;
  onJumpToPage: (page: number) => void;
}

const TOP_LEVEL_LABELS: Record<string, string> = {
  premises_address: "Premises address",
  premises_extent: "Premises extent",
  landlord: "Landlord",
  tenant: "Tenant",
  guarantor: "Guarantor",
  term_start: "Term start",
  term_length_years: "Term length (years)",
  term_expiry: "Term expiry",
  initial_rent_gbp: "Initial rent (£)",
  rent_frequency: "Rent frequency",
  rent_review: "Rent review",
  tenant_break: "Tenant break",
  landlord_break: "Landlord break",
  repair: "Repair",
  permitted_use: "Permitted use",
  alienation: "Alienation",
  service_charge: "Service charge",
  rent_deposit_gbp: "Rent deposit (£)",
  insurance_renewal_date: "Insurance renewal",
  epc_expiry_date: "EPC expiry",
};

// Section grouping — order matters; renders top-to-bottom.
const SECTIONS: { id: string; title: string; fields: string[] }[] = [
  { id: "premises", title: "Premises", fields: ["premises_address", "premises_extent"] },
  { id: "parties",  title: "Parties",  fields: ["landlord", "tenant", "guarantor"] },
  {
    id: "term-rent",
    title: "Term & rent",
    fields: ["term_start", "term_length_years", "term_expiry", "initial_rent_gbp", "rent_frequency", "rent_deposit_gbp"],
  },
  { id: "review", title: "Rent review", fields: ["rent_review"] },
  { id: "breaks", title: "Break clauses", fields: ["tenant_break", "landlord_break"] },
  { id: "use-occupation", title: "Use & occupation", fields: ["permitted_use", "repair", "alienation"] },
  { id: "service-charge", title: "Service charge", fields: ["service_charge"] },
  { id: "compliance", title: "Compliance dates", fields: ["insurance_renewal_date", "epc_expiry_date"] },
];

const META_KEYS = new Set(["citation", "confidence", "notes"]);
const COLLAPSE_STORAGE_KEY = "leaseos.fieldsPanel.collapsed";

// ---- pure helpers -------------------------------------------------------

function flatten(record: Record<string, unknown>): Map<string, FieldNode> {
  const out = new Map<string, FieldNode>();
  for (const [key, label] of Object.entries(TOP_LEVEL_LABELS)) {
    const v = record[key] as Record<string, unknown> | null | undefined;
    if (v == null || typeof v !== "object") continue;
    const isLeaf = "value" in v && !hasCompositeKeys(v);
    const isParty = "name" in v && !("value" in v);
    if (isLeaf || isParty) {
      out.set(key, {
        path: key,
        label,
        value: pickPrimaryValueAsString(v),
        items: null,
        citation: (v.citation as Citation) ?? null,
        confidence: ((v.confidence as "high" | "low") ?? "high"),
        notes: (v.notes as string | null) ?? null,
      });
    } else {
      out.set(key, {
        path: key,
        label,
        value: null,
        items: compositeItems(key, v),
        citation: (v.citation as Citation) ?? null,
        confidence: ((v.confidence as "high" | "low") ?? "high"),
        notes: (v.notes as string | null) ?? null,
      });
    }
  }
  return out;
}

function hasCompositeKeys(v: Record<string, unknown>): boolean {
  return Object.keys(v).some((k) => !META_KEYS.has(k) && k !== "value");
}

function pickPrimaryValueAsString(field: Record<string, unknown>): string | null {
  if ("value" in field) {
    const v = field.value;
    if (v == null || v === "") return null;
    return String(v);
  }
  if ("name" in field) {
    const parts = [field.name as string];
    if (field.company_number) parts.push(`(${field.company_number})`);
    return parts.join(" ");
  }
  return null;
}

function compositeItems(parentPath: string, c: Record<string, unknown>): string[] {
  const items: string[] = [];
  for (const [k, v] of Object.entries(c)) {
    if (META_KEYS.has(k)) continue;
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const labelKey = humaniseKey(k);
    const labelValue = humaniseCompositeValue(parentPath, k, v);
    if (labelValue && labelValue !== "—") {
      items.push(`${labelKey}: ${labelValue}`);
    }
  }
  return items;
}

// ---- main panel ---------------------------------------------------------

export default function FieldsPanel({ leaseId, record, onJumpToPage }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [localRecord, setLocalRecord] = useState(record);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Persist collapse state per section
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (v) setCollapsed(new Set(JSON.parse(v)));
    } catch {}
  }, []);

  function toggleSection(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }

  const fieldMap = flatten(localRecord);
  const totalFields = fieldMap.size;
  const lowConfidenceCount = Array.from(fieldMap.values()).filter((f) => f.confidence === "low").length;

  function startEdit(node: FieldNode) {
    if (node.items) return; // composites not editable inline in v1
    setEditing(node.path);
    setDraftValue(node.value ?? "");
  }

  async function save(node: FieldNode) {
    setSaving(true);
    try {
      const target = `${node.path}.value`;
      await api.patchField(leaseId, target, draftValue);
      setLocalRecord((prev) => {
        const next = structuredClone(prev) as Record<string, unknown>;
        const slot = next[node.path] as Record<string, unknown>;
        if (slot && typeof slot === "object") slot.value = draftValue;
        return next;
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white">
      {/* Sticky header — slimmer; Approve moved to right rail */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-5 py-2.5 text-sm">
        <span className="font-medium tabular-nums">{totalFields}</span>
        <span className="text-neutral-500"> fields</span>
        {lowConfidenceCount > 0 && (
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {lowConfidenceCount} flagged
          </span>
        )}
      </div>

      {/* Sections */}
      <div className="divide-y divide-neutral-100">
        {SECTIONS.map((section) => {
          const fields = section.fields
            .map((p) => fieldMap.get(p))
            .filter((f): f is FieldNode => f !== undefined);
          if (fields.length === 0) return null;

          const sectionLow = fields.filter((f) => f.confidence === "low").length;
          const isCollapsed = collapsed.has(section.id);

          return (
            <section key={section.id}>
              <button
                onClick={() => toggleSection(section.id)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left hover:bg-neutral-50"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    size={14}
                    className={`text-neutral-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                  <span className="text-sm font-semibold text-neutral-900">{section.title}</span>
                  <span className="text-xs text-neutral-400 tabular-nums">{fields.length}</span>
                </div>
                {sectionLow > 0 && (
                  <span className="text-xs font-medium text-amber-700">⚠ {sectionLow}</span>
                )}
              </button>

              {!isCollapsed && (
                <ul className="divide-y divide-neutral-100 bg-neutral-50/40">
                  {fields.map((f) => (
                    <FieldRow
                      key={f.path}
                      f={f}
                      editing={editing === f.path}
                      draftValue={draftValue}
                      saving={saving}
                      setDraftValue={setDraftValue}
                      onStartEdit={() => startEdit(f)}
                      onSave={() => save(f)}
                      onCancel={() => setEditing(null)}
                      onJump={(p) => onJumpToPage(p)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---- field row ----------------------------------------------------------

interface RowProps {
  f: FieldNode;
  editing: boolean;
  draftValue: string;
  saving: boolean;
  setDraftValue: (s: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onJump: (page: number) => void;
}

function FieldRow({ f, editing, draftValue, saving, setDraftValue, onStartEdit, onSave, onCancel, onJump }: RowProps) {
  return (
    <li className="px-5 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</span>
            {f.confidence === "low" && (
              <span className="text-xs text-amber-700">⚠ flagged</span>
            )}
          </div>

          {editing ? (
            <div className="mt-1 flex gap-2">
              <input
                autoFocus
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <button
                disabled={saving}
                onClick={onSave}
                className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                Save
              </button>
              <button onClick={onCancel} className="rounded border border-neutral-300 px-3 py-1 text-xs">
                Cancel
              </button>
            </div>
          ) : f.items ? (
            <ul className="mt-1 space-y-0.5 text-sm text-neutral-900">
              {f.items.map((item) => {
                const [k, ...rest] = item.split(":");
                const v = rest.join(":").trim();
                return (
                  <li key={item} className="flex gap-2">
                    <span className="text-neutral-500 min-w-[8.5rem]">{k}</span>
                    <span className="font-medium">{v}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              className="mt-1 text-sm text-neutral-900"
              onDoubleClick={onStartEdit}
              title="Double-click to edit"
            >
              {f.value == null || f.value === "" ? (
                <span className="text-neutral-400 italic">— null —</span>
              ) : (
                f.value
              )}
            </div>
          )}

          {f.notes && (
            <div className="mt-1.5 text-xs text-neutral-500">{f.notes}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {f.citation && (
            <button
              onClick={() => f.citation && onJump(f.citation.page)}
              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
            >
              p.{f.citation.page} {f.citation.clause_reference ? `· ${f.citation.clause_reference}` : ""}
            </button>
          )}
        </div>
      </div>
      {f.citation?.quote && (
        <blockquote className="mt-2 border-l-2 border-neutral-200 pl-3 text-xs text-neutral-500 italic">
          &ldquo;{f.citation.quote}&rdquo;
        </blockquote>
      )}
    </li>
  );
}
