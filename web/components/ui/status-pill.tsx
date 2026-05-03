/**
 * Bold, colour-coded status pills used everywhere a status is shown.
 * Centralises the colour mappings that used to live as duplicated
 * Record<string,string> objects in each list page.
 */

import { humanise } from "@/lib/humanise";

type Tone = "neutral" | "info" | "warn" | "danger" | "success" | "violet" | "amber" | "sky" | "orange";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral-200 text-neutral-800",
  info:    "bg-blue-600 text-white",
  warn:    "bg-amber-500 text-white",
  danger:  "bg-red-600 text-white",
  success: "bg-emerald-600 text-white",
  violet:  "bg-violet-600 text-white",
  amber:   "bg-amber-500 text-white",
  sky:     "bg-sky-600 text-white",
  orange:  "bg-orange-500 text-white",
};

// ---- Status-group → tone mappings ---------------------------------------

export const LEASE_STATUS_TONE: Record<string, Tone> = {
  uploaded: "neutral",
  extracting: "warn",
  ready_for_review: "info",
  approved: "success",
  failed: "danger",
};

export const PACK_STATUS_TONE: Record<string, Tone> = {
  generating: "warn",
  draft: "info",
  sent: "violet",
  settled: "success",
  failed: "danger",
};

export const EVENT_TYPE_TONE: Record<string, Tone> = {
  rent_review_trigger: "info",
  rent_review_effective: "info",
  break_notice_deadline: "danger",
  break_date: "amber",
  lease_expiry: "violet",
  deposit_return: "success",
  insurance_renewal: "sky",
  epc_expiry: "orange",
};

// ---- Public component ---------------------------------------------------

interface Props {
  /** Optional explicit tone — overrides any group lookup. */
  tone?: Tone;
  /** Status group ("lease_status" | "pack_status" | "event_type") to look up the tone. */
  group?: "lease_status" | "pack_status" | "event_type";
  /** Raw status value (e.g. "ready_for_review"). */
  value: string;
  /** Optional override label. Defaults to humanise(group, value). */
  label?: string;
  className?: string;
}

const GROUP_TONE_MAP = {
  lease_status: LEASE_STATUS_TONE,
  pack_status: PACK_STATUS_TONE,
  event_type: EVENT_TYPE_TONE,
} as const;

export function StatusPill({ tone, group, value, label, className = "" }: Props) {
  const resolvedTone: Tone =
    tone ?? (group ? GROUP_TONE_MAP[group][value] ?? "neutral" : "neutral");
  const resolvedLabel = label ?? (group ? humanise(group, value) : humanise("", value));
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[resolvedTone]} ${className}`}
    >
      {resolvedLabel}
    </span>
  );
}
