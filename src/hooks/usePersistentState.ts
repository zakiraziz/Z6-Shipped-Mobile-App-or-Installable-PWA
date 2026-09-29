import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState that survives reloads — the offline data layer of the app.
 * Every read/write is guarded, a corrupted value falls back to the default.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked — the app still works for this session */
    }
  }, [key, value]);

  return [value, setValue];
}
