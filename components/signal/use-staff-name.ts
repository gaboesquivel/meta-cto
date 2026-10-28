"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "signal.staffName";
const listeners = new Set<() => void>();

const read = (): string => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

let memory: string | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): string => {
  memory ??= read();
  return memory;
};

const getServerSnapshot = (): string => "";

/** The Staff Actor's name, remembered in localStorage when available. */
export const useStaffName = (): [string, (name: string) => void] => {
  const name = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setName = useCallback((next: string) => {
    memory = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode); keep the name for this page only.
    }
    for (const listener of listeners) listener();
  }, []);
  return [name, setName];
};
