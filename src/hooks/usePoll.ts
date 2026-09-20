/**
 * Polling for read-only data.
 *
 * Cookie Chain has no indexer the app can query for "what changed", and its blocks are ~1s, so the
 * honest way to keep a dashboard live is to re-read on a timer. This hook makes that safe:
 *
 * - **No overlapping requests.** A slow RPC response must not let a second poll start on top of it;
 *   that is how a dashboard turns one slow call into a queue of them.
 * - **No setState after unmount.** React 18+ removed the warning but not the leak.
 * - **Stale data is kept on error.** A failed refresh leaves the last good value on screen and
 *   reports the failure beside it, rather than blanking a panel the user was reading.
 * - **Backs off on failure.** Repeatedly hammering an RPC that is already unhappy is how a rate
 *   limit becomes a ban.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** When the currently-held data was fetched. */
  updatedAt: number | null;
  refresh: () => void;
}

export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
  enabled = true,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const inFlight = useRef(false);
  const alive = useRef(true);
  const failures = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const next = await fetcherRef.current();
      if (!alive.current) return;
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
      failures.current = 0;
    } catch (e) {
      if (!alive.current) return;
      failures.current += 1;
      setError(e instanceof Error ? e.message : String(e));
      // Deliberately keeps `data`: a stale number plus a visible error beats an empty panel.
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void tick();

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // 2^n backoff capped at 8x, so a broken endpoint settles at a slow retry instead of a flood.
      const backoff = Math.min(2 ** failures.current, 8);
      timer = setTimeout(async () => {
        await tick();
        schedule();
      }, intervalMs * backoff);
    };
    schedule();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, tick, ...deps]);

  return { data, error, loading, updatedAt, refresh: tick };
}
