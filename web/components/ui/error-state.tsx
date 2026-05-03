"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiHttpError, ApiTimeoutError } from "@/lib/api";

interface Props {
  error: Error;
  /** Called when the user clicks Retry. Optional — if omitted, no button shows. */
  onRetry?: () => void;
  /** Set true while a retry is in flight to disable the button + show spinner. */
  retrying?: boolean;
  /** Fits inside a card / column rather than a full-page card. */
  compact?: boolean;
  /** Override the default title. Defaults to "Couldn't load this." */
  title?: string;
}

/**
 * Visible error card. Pairs with the `useApi` hook so a fetch failure surfaces
 * as a real "couldn't load — retry?" instead of an eternal loading spinner.
 *
 * Distinguishes timeout vs server-error vs auth-error so the message is
 * actually useful — e.g. "took longer than 15s" tells you it's the network,
 * not a bug.
 */
export function ErrorState({ error, onRetry, retrying, compact, title }: Props) {
  const padCls = compact ? "p-4" : "p-6";
  const { headline, detail } = describe(error, title);
  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50/60 ${padCls} text-center`}
    >
      <div className="mx-auto h-9 w-9 rounded-full bg-red-100 flex items-center justify-center text-red-700">
        <AlertTriangle size={16} />
      </div>
      <p className="mt-2 text-sm font-semibold text-red-900">{headline}</p>
      <p className="mt-1 text-xs text-red-800/80 max-w-md mx-auto break-words">{detail}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}

function describe(error: Error, titleOverride: string | undefined): { headline: string; detail: string } {
  if (error instanceof ApiTimeoutError) {
    return {
      headline: titleOverride ?? "Took too long to load",
      detail: `The API didn't respond within ${Math.round(error.timeoutMs / 1000)}s. Check your connection or the backend status.`,
    };
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 401 || error.status === 403) {
      return {
        headline: titleOverride ?? "Not authorised",
        detail: "Your session may have expired. Try signing out and back in.",
      };
    }
    if (error.status === 404) {
      return {
        headline: titleOverride ?? "Not found",
        detail: "The requested resource doesn't exist.",
      };
    }
    if (error.status >= 500) {
      return {
        headline: titleOverride ?? "Server error",
        detail: `The API returned ${error.status}. The backend logs will have the details.`,
      };
    }
    return {
      headline: titleOverride ?? `Request failed (${error.status})`,
      detail: error.body.slice(0, 240) || "(no response body)",
    };
  }
  // Network-layer "Failed to fetch" — DNS, CORS, offline, etc.
  if (error.message === "Failed to fetch" || error.name === "TypeError") {
    return {
      headline: titleOverride ?? "Couldn't reach the API",
      detail: "Check that the backend is running and that NEXT_PUBLIC_API_URL points at it. Browser console will have a more specific reason.",
    };
  }
  return {
    headline: titleOverride ?? "Couldn't load this.",
    detail: error.message,
  };
}
