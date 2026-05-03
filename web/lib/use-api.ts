"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchOpts } from "./api";

export interface UseApiResult<T> {
  /** The most recent successful response. Stays populated across refetches
   * so the UI can show stale data while new data is loading. */
  data: T | null;
  /** True until the very first fetch resolves (success OR error). */
  loading: boolean;
  /** True while a refetch (after the initial load) is in flight. */
  refetching: boolean;
  /** The most recent error, or null if the last fetch succeeded. */
  error: Error | null;
  /** Call to retry. The hook also re-fetches automatically when `deps` change. */
  refetch: () => void;
}

/**
 * Tiny data-fetching hook. Replaces the `useState(null) + useEffect → setState`
 * pattern that's repeated in every page and that silently turns errors into
 * eternal "Loading…" spinners.
 *
 * Behaviour:
 *  - Auto-fetches on mount and whenever `deps` change.
 *  - Cancels in-flight requests on unmount or dep-change (no setState on
 *    unmounted component, no race conditions).
 *  - Surfaces real errors so the UI can show an `<ErrorState>` with retry.
 *  - Keeps prior `data` populated during refetches so the panel doesn't
 *    flash to blank.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(
 *     (signal) => api.listLeases({ signal }),
 *   );
 */
export function useApi<T>(
  loader: (opts: FetchOpts) => Promise<T>,
  deps: React.DependencyList = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Bump this to trigger a manual refetch — works regardless of dep equality.
  const [tick, setTick] = useState(0);
  // Stable ref to the loader so callers can pass an inline lambda without
  // triggering refetches every render. They control re-fetches via `deps`.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    setError(null);
    if (data === null) setLoading(true);
    else setRefetching(true);

    loaderRef.current({ signal: ac.signal })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Caller-aborted (unmount / dep change) is not a real error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefetching(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, refetching, error, refetch };
}
