"use client";

import { useEffect, useRef, useState } from "react";

/** Persist a form's in-progress values under `key` in localStorage, hydrate
 *  from that key on mount, and prompt on tab-close while dirty.
 *
 *  Used by high-stakes recruiter forms (post-a-job, edit-a-job) where losing
 *  in-progress edits to a stray refresh is a real productivity hit.
 *
 *  Design notes:
 *  - Rehydration reads once on mount; concurrent tabs are last-writer-wins
 *    (matches the localStorage semantic — no cross-tab merge here).
 *  - Debounces writes to 400ms so a fast typist doesn't hammer localStorage.
 *  - `dirty` is true when the current values differ from initial; the
 *    beforeunload prompt only fires while dirty AND unsaved.
 *  - `clear()` removes the persisted draft — call from onSuccess of your
 *    submit mutation so a saved form doesn't rehydrate on next visit.
 *  - Does NOT hook Next.js router client-nav guards (that needs App-Router
 *    private APIs and rots fast). Wire that separately in the page if
 *    you want it — beforeunload covers the two most common loss paths
 *    (refresh + close).
 */
export function useDraftForm<T>(
  key: string,
  initial: T,
): {
  values: T;
  setValues: React.Dispatch<React.SetStateAction<T>>;
  dirty: boolean;
  clear: () => void;
} {
  const initialRef = useRef(initial);
  const [values, setValues] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as T;
      return parsed;
    } catch {
      return initial;
    }
  });

  const dirty = !shallowEqual(values, initialRef.current);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (dirty) {
          window.localStorage.setItem(key, JSON.stringify(values));
        }
      } catch {
        /* quota full / disabled — the form still works, just no auto-recover */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [key, values, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const clear = () => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return { values, setValues, dirty, clear };
}

/** Shallow compare — good enough for form value objects. Values may include
 *  arrays; for those, string-compare via JSON since the object identity check
 *  would over-report "dirty" every render. */
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
