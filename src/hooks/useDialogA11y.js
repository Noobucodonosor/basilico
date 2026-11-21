import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Provides Escape dismissal, Tab focus trapping, focus restoration on close,
 * and body scroll locking for custom dialog/drawer overlays.
 */
export function useDialogA11y({ isOpen, containerRef, onClose }) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frameId = window.requestAnimationFrame(() => {
      const root = containerRef?.current;
      if (!root) return;
      const firstFocusable = root.querySelector(FOCUSABLE_SELECTOR);
      if (firstFocusable instanceof HTMLElement) {
        firstFocusable.focus();
      } else if (typeof root.focus === 'function') {
        root.focus();
      }
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key !== 'Tab') return;
      const root = containerRef?.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      const prevEl = previousFocusRef.current;
      if (prevEl && prevEl.isConnected && typeof prevEl.focus === 'function') {
        prevEl.focus();
      }
    };
  }, [isOpen, containerRef, onClose]);
}
