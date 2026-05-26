import { useState, useEffect, useCallback, useRef } from "react";

export function useAutoDraft<T extends Record<string, any>>(
  key: string,
  initialState: T,
  debounceMs = 1000
): {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  clearDraft: () => void;
  hasDraft: boolean;
  isDirty: boolean;
} {
  const storageKey = `erp_draft_${key}`;

  const [hasDraft, setHasDraft] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const initialRef = useRef(initialState);

  const [form, setFormState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setHasDraft(true);
        return { ...initialState, ...parsed };
      }
    } catch {}
    return initialState;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialRef.current);
    setIsDirty(hasChanges);

    if (!hasChanges) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form));
        setHasDraft(true);
      } catch {}
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form, storageKey, debounceMs]);

  const setForm: React.Dispatch<React.SetStateAction<T>> = useCallback((updater) => {
    setFormState(updater);
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setFormState(initialRef.current);
    setHasDraft(false);
    setIsDirty(false);
  }, [storageKey]);

  return { form, setForm, clearDraft, hasDraft, isDirty };
}
