import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SkipLink from '@/components/skip-link';

const ROOT = process.cwd();

const MAIN_TARGETS = [
  'src/app/page.tsx',
  'src/app/dashboard/layout.tsx',
  'src/app/admin/admin-shell.tsx',
  'src/components/auth/auth-shell.tsx',
  'src/app/operator-login/operator-login-form.tsx',
  'src/app/onboarding/onboarding-wizard.tsx',
  'src/app/compliance/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/not-found.tsx',
];

test('A11Y-SKIP-1: Skip link is a named, first-focusable link revealed on keyboard focus', () => {
  const markup = renderToStaticMarkup(createElement(SkipLink));
  assert.match(markup, /<a href="#main-content"/);
  assert.match(markup, />Skip to main content<\/a>/);
  assert.match(markup, /sr-only/);
  assert.match(markup, /focus:not-sr-only/);

  const rootLayout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');
  assert.match(rootLayout, /<SkipLink\s*\/>/);
  assert.ok(
    rootLayout.indexOf('<SkipLink />') < rootLayout.indexOf('{children}'),
    'the skip link must precede the page content in keyboard order'
  );
});

test('A11Y-SKIP-2: Every page shell provides one programmatically focusable main target', () => {
  for (const relativePath of MAIN_TARGETS) {
    const source = readFileSync(join(ROOT, relativePath), 'utf8');
    assert.match(
      source,
      /<main\b[^>]*\bid="main-content"[^>]*\btabIndex=\{-1\}[^>]*>/,
      `${relativePath} must provide a focusable <main id="main-content"> target`
    );
  }
});
