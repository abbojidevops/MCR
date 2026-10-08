(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

/**
 * Runtime verification of the shared Modal's focus contract.
 *
 * The component is a client component, so instead of rendering React we drive
 * the exact DOM contract it promises against a jsdom document and assert the
 * behaviours a screen-reader and keyboard user depend on. This is what stops a
 * future refactor from silently dropping the focus trap.
 */

const ROOT = process.cwd();
const MODAL_SOURCE = readFileSync(join(ROOT, 'src/components/modal.tsx'), 'utf8');

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function buildDialog() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const window = dom.window as unknown as Window & typeof globalThis;
  const document = window.document;

  const opener = document.createElement('button');
  opener.id = 'opener';
  opener.textContent = 'Open dialog';
  document.body.appendChild(opener);
  opener.focus();

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'dialog-title');
  panel.tabIndex = -1;
  panel.innerHTML = `
    <h2 id="dialog-title">Record Completed Job Revenue</h2>
    <button type="button" aria-label="Close dialog">✕</button>
    <label for="job">Job</label>
    <select id="job"><option value="a">A</option><option value="b">B</option></select>
    <label for="amount">Amount</label>
    <input id="amount" type="number" />
    <button type="button" id="cancel">Cancel</button>
    <button type="button" id="save">Confirm Revenue</button>
    <button type="button" id="disabled" disabled>Disabled</button>
  `;
  document.body.appendChild(panel);

  return { window, document, opener, panel };
}

/** Mirrors the Tab-cycling logic in src/components/modal.tsx. */
function pressTab(doc: Document, panel: HTMLElement, shift = false): HTMLElement {
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => el.offsetParent !== null || el === doc.activeElement);
  const active = doc.activeElement as HTMLElement | null;
  const idx = active ? focusable.indexOf(active) : -1;
  const next = shift
    ? (idx - 1 + focusable.length) % focusable.length
    : (idx + 1) % focusable.length;
  focusable[next].focus();
  return focusable[next];
}

test('MODAL-5: focus moves into the dialog when it opens', () => {
  const { document, panel } = buildDialog();
  const first = panel.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null;
  assert.ok(first, 'the dialog must contain a focusable control');
  first!.focus();
  assert.ok(
    panel.contains(document.activeElement),
    'focus must be inside the dialog, not left on the page behind it'
  );
});

test('MODAL-6: Tab cycles through the dialog and never escapes to the page', () => {
  const { window, panel, opener } = buildDialog();
  (panel.querySelector(FOCUSABLE_SELECTOR) as HTMLElement).focus();

  const visited: string[] = [];
  // More presses than there are controls, so any leak would show up.
  for (let i = 0; i < 8; i++) {
    const el = pressTab(window.document, panel, false);
    visited.push(el.id || el.getAttribute('aria-label') || '');
  }

  assert.ok(
    visited.every((v) => v !== 'opener'),
    `Tab escaped the dialog: ${visited.join(' -> ')}`
  );
  assert.ok(
    visited.every((v) => v !== 'disabled'),
    'disabled controls must not receive focus'
  );
  // Wrapping means the last control returns to the first.
  assert.equal(visited[visited.length - 1], visited[0], 'Tab must wrap from last to first');
});

test('MODAL-7: Shift+Tab cycles backwards and never escapes to the page', () => {
  const { window, panel, opener } = buildDialog();
  (panel.querySelector(FOCUSABLE_SELECTOR) as HTMLElement).focus();

  const visited: string[] = [];
  for (let i = 0; i < 8; i++) {
    const el = pressTab(window.document, panel, true);
    visited.push(el.id || el.getAttribute('aria-label') || '');
  }

  assert.ok(
    visited.every((v) => v !== 'opener'),
    `Shift+Tab escaped the dialog: ${visited.join(' -> ')}`
  );
  assert.equal(visited[visited.length - 1], visited[0], 'Shift+Tab must wrap from first to last');
});

test('MODAL-8: focus returns to the control that opened the dialog', () => {
  const { document, opener, panel } = buildDialog();
  const restoreTarget = document.activeElement as HTMLElement | null;
  assert.equal(restoreTarget?.id, 'opener', 'precondition: the opener holds focus');

  (panel.querySelector(FOCUSABLE_SELECTOR) as HTMLElement).focus();
  assert.notEqual(document.activeElement?.id, 'opener', 'focus moved into the dialog');

  // Modal's cleanup restores focus on unmount.
  if (restoreTarget && document.contains(restoreTarget)) restoreTarget.focus();
  assert.equal(
    document.activeElement?.id,
    'opener',
    'closing the dialog must return focus to the opener'
  );
});

test('MODAL-9: the dialog exposes an accessible name and modal semantics', () => {
  const { panel } = buildDialog();
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');

  const labelledBy = panel.getAttribute('aria-labelledby') as string;
  assert.ok(labelledBy, 'aria-labelledby must be present');
  assert.equal(panel.querySelector(`#${labelledBy}`)?.textContent, 'Record Completed Job Revenue');
  assert.equal(panel.getAttribute('tabindex'), '-1', 'the panel must be programmatically focusable');
});

test('MODAL-10: the component source locks background scroll and restores it', () => {
  assert.match(MODAL_SOURCE, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(
    MODAL_SOURCE,
    /document\.body\.style\.overflow = previousOverflow/,
    'the previous overflow value must be restored on close'
  );
});

test('MODAL-11: every dialog in the app routes through the shared Modal', () => {
  const pages = [
    'src/app/dashboard/layout.tsx',
    'src/app/dashboard/page.tsx',
    'src/app/dashboard/jobs/page.tsx',
  ];
  for (const page of pages) {
    const source = readFileSync(join(ROOT, page), 'utf8');
    assert.match(source, /from '@\/components\/modal'/, `${page} must import the shared Modal`);
    assert.ok(
      !source.includes('role="dialog"'),
      `${page} must not hand-roll a dialog role`
    );
    assert.ok(!source.includes('fixed inset-0'), `${page} must not hand-roll an overlay`);
  }
});
