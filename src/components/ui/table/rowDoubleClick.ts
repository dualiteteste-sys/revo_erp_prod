import type React from 'react';

function isTextSelectionActive(): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection?.();
  if (!sel) return false;
  return sel.type === 'Range' && sel.toString().trim().length > 0;
}

export function shouldIgnoreRowDoubleClickEvent(event: React.MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented) return true;
  if (isTextSelectionActive()) return true;

  const target = event.target as HTMLElement | null;
  if (!target) return false;

  const interactive = target.closest(
    [
      'a',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[contenteditable="true"]',
      '[data-no-row-dblclick="true"]',
    ].join(',')
  );

  return !!interactive;
}

export function openInNewTabBestEffort(href: string, fallback?: () => void) {
  if (typeof window === 'undefined') {
    fallback?.();
    return;
  }

  const w = window.open(href, '_blank', 'noopener,noreferrer');
  if (!w) fallback?.();
}
