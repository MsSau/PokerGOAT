import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from './utils';

// Shared loading/error/data triad + reload-after-mutation, used by every
// screen that fetches its own context on mount and needs to re-fetch after a
// save/lock/log action (SessionContractView, WeeklyGamePlanView,
// TournamentLog, SessionReview, PlayerDashboard, SessionLog, ActiveBRMView,
// ActiveFrameworkView).
//
// `fn` may either return the fetched value directly (simple single-query
// screens) or perform its own setState calls per field and return void
// (screens that resolve several sequential/related pieces of context) —
// both are supported so multi-field loaders don't need to be forced into one
// combined object just to use this hook.
//
// A monotonic request id guards against a slower, superseded reload()
// overwriting a newer one's result (e.g. userId changing mid-flight), the
// same problem the ad-hoc `let active = true` closures in several of these
// components were each hand-rolling.
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestIdRef = useRef(0);

  const reload = useCallback((): Promise<void> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    return fnRef
      .current()
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setError(getErrorMessage(err, 'Something went wrong.'));
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });
    // deps is caller-supplied and intentionally drives when this re-runs,
    // same contract as useEffect/useCallback's own deps array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, setError, reload };
}
