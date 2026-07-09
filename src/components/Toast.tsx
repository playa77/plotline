// Version: 1.0.0 | 2026-07-09
// Toast — lightweight, dependency-free notification system.
//
// Architecture: a module-level external store (subscribe/getSnapshot) wired
// into React via useSyncExternalStore. This means useToast() works anywhere
// in the tree WITHOUT a <Provider> wrapper — drop <ToastContainer /> once
// (e.g. near the app root) and call useToast() from any component.
//
// Lifecycle per toast:
//   t=0       -> added; slide-in animation plays
//   t=3700ms  -> marked "leaving"; fade-out animation plays (300ms)
//   t=4000ms  -> removed from the store
// Net visible lifetime ~4s, matching the spec's "auto-dismiss after 4s".
// Newest toasts are appended to the end of the array and rendered last, so
// they appear at the bottom of the stack.

import { useSyncExternalStore, useCallback } from "react";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error";

interface ToastRecord {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
}

// --- external store ---------------------------------------------------------
// `toasts` is reassigned to a new array on every mutation (never mutated in
// place) so getSnapshot() returns a referentially-stable value between
// changes — a requirement of useSyncExternalStore.
let toasts: ToastRecord[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ToastRecord[] {
  return toasts;
}

function markLeaving(id: number): void {
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
}

function removeToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function showToast(message: string, type: ToastType): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, leaving: false }];
  emit();
  // Begin the fade-out slightly before removal so the animation completes
  // before the element leaves the DOM.
  window.setTimeout(() => markLeaving(id), 3700);
  window.setTimeout(() => removeToast(id), 4000);
}

// --- public hook ------------------------------------------------------------
export function useToast() {
  // showToast is module-level and already stable; useCallback keeps the
  // returned object's referential identity stable across re-renders.
  const show = useCallback(
    (message: string, type: ToastType) => showToast(message, type),
    []
  );
  return { showToast: show };
}

// --- container --------------------------------------------------------------
export function ToastContainer() {
  // Third arg = getServerSnapshot; the app is client-only (Tauri), so we
  // reuse the client snapshot to satisfy the hook's signature.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {snapshot.map((t) => (
        <div
          key={t.id}
          className={[
            styles.toast,
            t.type === "success" ? styles.toastSuccess : styles.toastError,
            t.leaving ? styles.leaving : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role={t.type === "error" ? "alert" : "status"}
        >
          <span
            className={[
              styles.icon,
              t.type === "success" ? styles.iconSuccess : styles.iconError,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {t.type === "success" ? "✓" : "✕"}
          </span>
          <span className={styles.message}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
