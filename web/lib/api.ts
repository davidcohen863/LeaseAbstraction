/**
 * Typed client for the LeaseOS FastAPI backend.
 *
 * Server components: pass an `auth` token (resolved via Clerk's auth() helper).
 * Client components: use the hooks in lib/hooks.ts which handle this for you.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type LeaseStatus =
  | "uploaded"
  | "extracting"
  | "ready_for_review"
  | "approved"
  | "failed";

export interface LeaseSummary {
  id: string;
  label: string;
  status: LeaseStatus;
  created_at: string;
  updated_at: string;
  extraction_model: string | null;
  extraction_seconds: number | null;
  document_count: number;
  property_id: string | null;
  property_address: string | null;
}

export interface LeaseDetail extends LeaseSummary {
  record_json: Record<string, unknown> | null;
  extraction_error: string | null;
}

export interface PropertySummary {
  id: string;
  address: string;
  sector: string | null;
  landlord_client: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lease_count: number;
  active_lease_id: string | null;
  active_lease_label: string | null;
  next_event_date: string | null;
  next_event_title: string | null;
}

export interface PropertyDetail extends PropertySummary {
  leases: { id: string; label: string; status: string; created_at: string }[];
  upcoming_events: { id: string; event_type: string; event_date: string; title: string }[];
}

export interface LeaseEvent {
  id: string;
  lease_id: string;
  lease_label: string;
  event_type: string;
  event_date: string;
  title: string;
  description: string | null;
  status: string;
  pushed_to_google: boolean;
  pushed_to_outlook: boolean;
}

export interface Comparable {
  id: string;
  address: string;
  rent_pa_gbp: number;
  area_sqft: number | null;
  frontage_m: number | null;
  use_class: string | null;
  deal_date: string | null;
  deal_type: string;
  source: string;
  notes: string | null;
  derived_from_lease_id: string | null;
  created_at: string;
}

export interface PackDocumentOut {
  id: string;
  pack_id: string;
  kind: "landlord_memo" | "comparables_schedule" | "itza_analysis" | "trigger_letter" | string;
  filename: string;
  markdown_content: string | null;
}

export type PackStatus = "generating" | "draft" | "sent" | "settled" | "failed";

export interface PackSummary {
  id: string;
  lease_id: string;
  lease_label: string | null;
  lease_event_id: string | null;
  status: PackStatus;
  current_rent_gbp: number | null;
  recommended_opening_gbp: number | null;
  recommended_settlement_low_gbp: number | null;
  recommended_settlement_high_gbp: number | null;
  settled_rent_gbp: number | null;
  settled_at: string | null;
  generator_model: string | null;
  generated_seconds: number | null;
  error: string | null;
  comparables_used_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface PackDetail extends PackSummary {
  documents: PackDocumentOut[];
}

interface FetchOpts {
  token?: string | null;
  signal?: AbortSignal;
}

async function call<T>(
  path: string,
  init: RequestInit & FetchOpts = {}
): Promise<T> {
  const { token, signal, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    signal,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} on ${path}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: (opts?: FetchOpts) => call<{ ok: boolean; service: string; version: string }>("/health", opts),

  listLeases: (opts?: FetchOpts) => call<LeaseSummary[]>("/leases", opts),
  getLease: (id: string, opts?: FetchOpts) => call<LeaseDetail>(`/leases/${id}`, opts),

  uploadLease: async (file: File, opts?: FetchOpts): Promise<LeaseSummary> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("label", file.name);
    return call<LeaseSummary>("/leases", { method: "POST", body: fd, ...opts });
  },

  documentUrl: (id: string) => `${API_URL}/leases/${id}/document`,

  patchField: (
    id: string,
    fieldPath: string,
    value: unknown,
    opts?: FetchOpts
  ) =>
    call<{ ok: boolean; field_path: string; before: unknown; after: unknown }>(
      `/leases/${id}/fields/${fieldPath}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
        ...opts,
      }
    ),

  approve: (id: string, opts?: FetchOpts) =>
    call<LeaseDetail>(`/leases/${id}/approve`, { method: "POST", ...opts }),

  listEvents: (
    params?: { days_ahead?: number; days_behind?: number },
    opts?: FetchOpts
  ) => {
    const qs = new URLSearchParams();
    if (params?.days_ahead != null) qs.set("days_ahead", String(params.days_ahead));
    if (params?.days_behind != null) qs.set("days_behind", String(params.days_behind));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<LeaseEvent[]>(`/events${suffix}`, opts);
  },

  acknowledgeEvent: (eventId: string, opts?: FetchOpts) =>
    call<LeaseEvent>(`/events/${eventId}/acknowledge`, { method: "POST", ...opts }),

  // Integrations
  integrationsStatus: (opts?: FetchOpts) =>
    call<{
      slack: { configured: boolean; channel_label?: string | null };
      google: { connected: boolean; account_email?: string | null };
      outlook: { connected: boolean; account_email?: string | null };
    }>("/integrations/status", opts),
  configureSlack: (
    body: { webhook_url: string; channel_label?: string | null; digest_enabled?: boolean },
    opts?: FetchOpts
  ) =>
    call<{ ok: boolean }>("/integrations/slack/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...opts,
    }),
  testSlack: (opts?: FetchOpts) =>
    call<{ ok: boolean }>("/integrations/slack/test", { method: "POST", ...opts }),
  runSlackDigest: (opts?: FetchOpts) =>
    call<{ ok: boolean; sent: number }>("/integrations/slack/digest/run", { method: "POST", ...opts }),

  // Properties
  listProperties: (opts?: FetchOpts) =>
    call<PropertySummary[]>("/properties", opts),
  getProperty: (id: string, opts?: FetchOpts) =>
    call<PropertyDetail>(`/properties/${id}`, opts),
  patchProperty: (
    id: string,
    body: { sector?: string | null; landlord_client?: string | null; notes?: string | null },
    opts?: FetchOpts
  ) =>
    call<PropertySummary>(`/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...opts,
    }),

  // Comparables
  listComparables: (opts?: FetchOpts) =>
    call<Comparable[]>("/comparables", opts),
  createComparable: (
    body: Omit<Comparable, "id" | "created_at" | "derived_from_lease_id">,
    opts?: FetchOpts
  ) =>
    call<Comparable>("/comparables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...opts,
    }),
  bulkCreateComparables: (
    items: Array<Omit<Comparable, "id" | "created_at" | "derived_from_lease_id">>,
    opts?: FetchOpts
  ) =>
    call<Comparable[]>("/comparables/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      ...opts,
    }),
  deleteComparable: (id: string, opts?: FetchOpts) =>
    call<void>(`/comparables/${id}`, { method: "DELETE", ...opts }),

  // Packs
  generatePackForEvent: (eventId: string, opts?: FetchOpts) =>
    call<PackSummary>(`/events/${eventId}/pack`, { method: "POST", ...opts }),
  autoTriggerPacks: (
    params?: { days_ahead?: number; dry_run?: boolean },
    opts?: FetchOpts
  ) => {
    const qs = new URLSearchParams();
    if (params?.days_ahead != null) qs.set("days_ahead", String(params.days_ahead));
    if (params?.dry_run) qs.set("dry_run", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<{ triggered: number; pack_ids: string[]; horizon_days: number; candidates_seen: number }>(
      `/packs/auto-trigger${suffix}`,
      { method: "POST", ...opts }
    );
  },
  listPacks: (params?: { lease_id?: string }, opts?: FetchOpts) => {
    const qs = new URLSearchParams();
    if (params?.lease_id) qs.set("lease_id", params.lease_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return call<PackSummary[]>(`/packs${suffix}`, opts);
  },
  getPack: (id: string, opts?: FetchOpts) =>
    call<PackDetail>(`/packs/${id}`, opts),
  packDocumentUrl: (packId: string, docId: string) =>
    `${API_URL}/packs/${packId}/documents/${docId}`,
  markPackSent: (id: string, opts?: FetchOpts) =>
    call<PackSummary>(`/packs/${id}/sent`, { method: "POST", ...opts }),
  patchPack: (
    id: string,
    body: {
      recommended_opening_gbp?: number;
      recommended_settlement_low_gbp?: number;
      recommended_settlement_high_gbp?: number;
    },
    opts?: FetchOpts
  ) =>
    call<PackSummary>(`/packs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...opts,
    }),
  settlePack: (id: string, settled_rent_gbp: number, opts?: FetchOpts) =>
    call<PackSummary>(`/packs/${id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settled_rent_gbp }),
      ...opts,
    }),
};
