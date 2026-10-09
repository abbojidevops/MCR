'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. Required — a dialog with no name is unusable. */
  title: string;
  /** Optional supporting line rendered under the title. */
  description?: string;
  children: React.ReactNode;
  /** Optional footer, typically the action buttons. */
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel, e.g. `max-w-lg`. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Visual tone. `dark` suits restricted/operator surfaces. */
  tone?: 'light' | 'dark';
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Accessible modal dialog.
 *
 * Handles the six things a hand-rolled overlay almost always gets wrong:
 *   1. `role="dialog"` + `aria-modal` + a programmatic accessible name
 *   2. Focus moves into the dialog when it opens
 *   3. Tab / Shift+Tab cycle inside the dialog instead of escaping to the page
 *   4. Escape closes it
 *   5. Focus returns to whatever opened it
 *   6. Background scroll is locked while it is open
 *
 * Use this instead of a bespoke `fixed inset-0` overlay.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'light',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dark = tone === 'dark';

  // Move focus in on open, remember where it came from, and restore it on close.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    // Prefer the first real control; fall back to the panel itself so screen
    // readers announce the dialog name immediately.
    (firstFocusable || panel)?.focus();

    return () => {
      const previous = restoreFocusRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  // Lock background scroll for as long as the dialog is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
        dark ? 'bg-slate-950/80' : 'bg-slate-900/60'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`w-full ${SIZE_CLASS[size]} rounded-2xl p-6 shadow-2xl focus:outline-none ${
          dark ? 'border border-slate-800 bg-slate-950 text-white' : 'border border-slate-200 bg-white'
        }`}
      >
        <div
          className={`flex items-start justify-between gap-4 border-b pb-3 ${
            dark ? 'border-slate-800' : 'border-slate-100'
          }`}
        >
          <div>
            <h2
              id={titleId}
              className={`text-base font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className={`mt-1 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`rounded-lg p-1 ${
              dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {footer && (
          <div
            className={`mt-6 flex items-center justify-end gap-2 border-t pt-4 ${
              dark ? 'border-slate-800' : 'border-slate-100'
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
