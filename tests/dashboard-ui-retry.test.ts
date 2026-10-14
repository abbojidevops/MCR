import './test-env';

import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { computeMetrics } from '@/lib/metrics';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:3001/dashboard',
  });
  const globals: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  return {
    dom,
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as any)[name];
      }
      dom.window.close();
    },
  };
}

test('DASHUI-1: dashboard error is announced and a successful retry clears it', async () => {
  const { dom, restore } = installDom();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const metrics = computeMetrics('acc-empty-tenant-testing', { preset: 'month' });
  globalThis.fetch = (async () => {
    fetchCount += 1;
    if (fetchCount === 1) return { ok: false, status: 503 } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => metrics,
    } as Response;
  }) as typeof fetch;

  let root: ReturnType<typeof createRoot> | null = null;
  try {
    const { default: DashboardOverviewPage } = await import('@/app/dashboard/page');
    const host = dom.window.document.getElementById('root');
    assert.ok(host);
    root = createRoot(host!);

    await act(async () => {
      root!.render(createElement(DashboardOverviewPage));
    });

    const alert = host!.querySelector('[role="alert"]');
    assert.ok(alert, 'a load failure should be announced to assistive technology');
    assert.match(alert!.textContent || '', /Something went wrong while loading your dashboard/);
    assert.equal(fetchCount, 1);

    const retry = Array.from(host!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Try Again'
    );
    assert.ok(retry, 'the error state should provide a retry action');

    await act(async () => {
      retry!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(fetchCount, 2, 'retry should request fresh dashboard data');
    assert.equal(host!.querySelector('[role="alert"]'), null, 'successful retry should clear the error state');
    assert.match(host!.textContent || '', /No calls yet — awaiting your first forwarded missed call/);
  } finally {
    if (root) await act(async () => root!.unmount());
    globalThis.fetch = originalFetch;
    restore();
  }
});
