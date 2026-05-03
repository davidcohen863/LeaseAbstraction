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
}

export interface LeaseDetail extends LeaseSummary {
  record_json: Record<string, unknown> | null;
  extraction_error: string | null;
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
};
