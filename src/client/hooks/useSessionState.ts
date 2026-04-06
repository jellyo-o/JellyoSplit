import { useState, useCallback, useEffect } from 'react';

/**
 * Like useState, but persists to sessionStorage so the value survives page refresh.
 * Scoped by a key (should include gathering ID for per-gathering state).
 */
export function useSessionState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch {}
    return initialValue;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState(value);
  }, []);

  return [state, setValue];
}
