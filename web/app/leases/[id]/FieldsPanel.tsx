"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInDays, format, parseISO } from "date-fns";
import { api, type LeaseEvent } from "@/lib/api";
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
  onApprove: () => Promise<void>;
  approved: boolean;
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

const META_KEYS = new Set(["citation", "confidence", "notes"]);

function flatten(record: Record<string, unknown>): FieldNode[] {
  const out: FieldNode[] = [];
  for (const [key, label] of Object.entries(TOP_LEVEL_LABELS)) {
    const v = record[key] as Record<string, unknown> | null | undefined;
    if (v == null || typeof v !== "object") continue;

    const isLeaf = "value" in v && !hasCompositeKeys(v);
    const isParty = "name" in v && !("value" in v);

    if (isLeaf || isParty) {
      out.push({
        path: key,
        label,
        value: pickPrimaryValueAsString(v),
        items: null,
        citation: (v.citation as Citation) ?? null,
        confidence: ((v.confidence as "high" | "low") ?? "high"),
        notes: (v.notes as string | null) ?? null,
      });
    } else {
      out.push({
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

// ---- Critical dates banner ---------------------------------------------

const CRITICAL_TYPES = new Set([
  "break_notice_deadline",
  "rent_review_trigger",
  "lease_expiry",
]);

function CriticalDatesBanner({
  leaseId,
}: {
  leaseId: string;
  onJumpToPage: (page: number) => void;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<LeaseEvent[] | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEvents({ days_ahead: 730, days_behind: 0 })
      .then((all) => setEvents(all.filter((e) => e.lease_id === leaseId)))
      .catch(() => setEvents([]));
  }, [leaseId]);

  if (!events) return null;
  const critical = events
    .filter((e) => CRITICAL_TYPES.has(e.event_type))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  if (critical.length === 0) return null;

  async function generatePack(eventId: string) {
    setGenerating(eventId);
    try {
      const pack = await api.generatePackForEvent(eventId);
      router.push(`/packs/${pack.id}`);
    } catch (e) {
      alert(`Failed to generate pack: ${e}`);
      setGenerating(null);
    }
  }

  return (
    <div className="border-b border-neutral-200 bg-amber-50 px-5 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-2">
        Critical dates
      </div>
      <ul className="space-y-1.5">
        {critical.map((e) => {
          const dt = parseISO(e.event_date);
          const days = differenceInDays(dt, new Date());
          const urgent = days <= 90 && days >= 0;
          const overdue = days < 0;
          const label =
            e.event_type === "break_notice_deadline"
              ? "Break notice deadline"
              : e.event_type === "rent_review_trigger"
              ? "Prepare rent review pack"
              : "Lease expiry";
          const isReview = e.event_type === "rent_review_trigger";
          return (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span
                className={`font-medium ${
                  overdue
                    ? "text-red-700"
                    : urgent
                    ? "text-amber-900"
                    : "text-neutral-800"
                }`}
              >
                {label}
              </span>
              <div className="flex items-center gap-3">
                {isReview && (
                  <button
                    onClick={() => generatePack(e.id)}
                    disabled={generating === e.id}
                    className="rounded bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {generating === e.id ? "Generating…" : "Generate pack"}
                  </button>
                )}
                <span className="text-neutral-700">
                  {format(dt, "d MMM yyyy")}
                  <span className="ml-2 text-xs text-neutral-500">
                    {overdue
                      ? `${Math.abs(days)}d ago`
                      : days === 0
                      ? "today"
                      : `in ${days}d`}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Main panel ---------------------------------------------------------

export default function FieldsPanel({
  leaseId,
  record,
  onJumpToPage,
  onApprove,
  approved,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [localRecord, setLocalRecord] = useState(record);
  const [approvalBusy, setApprovalBusy] = useState(false);

  const fields = flatten(localRecord);
  const lowConfidenceCount = fields.filter((f) => f.confidence === "low").length;

  function startEdit(node: FieldNode) {
    if (node.items) return; // composites not editable in v1
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
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-5 py-3 flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">{fields.length}</span> fields
          {lowConfidenceCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {lowConfidenceCount} flagged
            </span>
          )}
        </div>
        <button
          disabled={approved || approvalBusy}
          onClick={async () => {
            setApprovalBusy(true);
            try {
              await onApprove();
            } finally {
              setApprovalBusy(false);
            }
          }}
          className={`text-sm rounded-md px-3 py-1.5 font-medium ${
            approved
              ? "bg-emerald-100 text-emerald-800"
              : approvalBusy
              ? "bg-neutral-200 text-neutral-500"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {approved ? "Approved" : approvalBusy ? "Approving…" : "Approve lease"}
        </button>
      </div>

      <CriticalDatesBanner leaseId={leaseId} onJumpToPage={onJumpToPage} />

      <ul className="divide-y divide-neutral-100">
        {fields.map((f) => {
          const isEditing = editing === f.path;
          return (
            <li key={f.path} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-neutral-500">
                      {f.label}
                    </span>
                    {f.confidence === "low" && (
                      <span className="text-xs text-amber-700">⚠ flagged</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1 flex gap-2">
                      <input
                        autoFocus
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <button
                        disabled={saving}
                        onClick={() => save(f)}
                        className="rounded bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded border border-neutral-300 px-3 py-1 text-xs"
                      >
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
                            <span className="text-neutral-500 min-w-[8.5rem]">
                              {k}
                            </span>
                            <span className="font-medium">{v}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div
                      className="mt-1 text-sm text-neutral-900"
                      onDoubleClick={() => startEdit(f)}
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
                      onClick={() => f.citation && onJumpToPage(f.citation.page)}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      p.{f.citation.page} {f.citation.clause_reference ?? ""}
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
        })}
      </ul>
    </div>
  );
}
