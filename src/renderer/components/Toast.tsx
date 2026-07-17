/**
 * Toast — toast notification stack component.
 *
 * Subscribes to useToastStore and renders a fixed-position stack of
 * toast notifications in the bottom-right corner. Supports slide-in
 * animation on appear and fade-out on dismiss.
 *
 * Each toast shows:
 *   - Colored indicator bar (3px) matching the toast type
 *   - Code label in small muted text
 *   - Message in normal text
 *   - Optional detail in smaller muted text
 *   - × dismiss button
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { useState, useCallback, useEffect } from 'react';
import { useToastStore } from '../stores/toastStore';
import type { ToastMessage } from '../stores/toastStore';
import '../styles/toast.css';

// ── Constants ──────────────────────────────────────────────────────────────

const DISMISS_ANIMATION_MS = 200;

// ── Component ──────────────────────────────────────────────────────────────

export function Toast(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  // Track which toasts are in the "dismissing" animation phase
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  // Clean up stale dismissing ids when toasts are removed by auto-dismiss
  useEffect(() => {
    const currentIds = new Set(toasts.map((t) => t.id));
    setDismissingIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [toasts]);

  const handleDismiss = useCallback(
    (id: string) => {
      // Start dismiss animation
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // Actually remove from store after animation completes
      setTimeout(() => {
        dismissToast(id);
      }, DISMISS_ANIMATION_MS);
    },
    [dismissToast],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((toast: ToastMessage) => {
        const isDismissing = dismissingIds.has(toast.id);

        const typeClass =
          toast.type === 'error'
            ? 'toast-container__item--error'
            : toast.type === 'success'
              ? 'toast-container__item--success'
              : 'toast-container__item--info';

        return (
          <div
            key={toast.id}
            className={`toast-container__item ${typeClass}${isDismissing ? ' toast-container__item--dismissing' : ''}`}
            role="alert"
          >
            <div className="toast__bar" />
            <div className="toast__body">
              <div className="toast__code">{toast.code}</div>
              <div className="toast__message">{toast.message}</div>
              {toast.detail && (
                <div className="toast__detail">{toast.detail}</div>
              )}
            </div>
            <button
              type="button"
              className="toast__dismiss"
              onClick={() => handleDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
