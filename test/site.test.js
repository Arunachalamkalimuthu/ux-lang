import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBody, standalone } from '../site/build.mjs';

const PAGE = new URL('../docs/index.html', import.meta.url).pathname;
const FRAGMENT = new URL('../site/artifact.html', import.meta.url).pathname;

// The landing page's playground runs the real toolchain, inlined from src/ at
// build time. That is only true while the committed page is current: a stale
// page would show diagnostics the CLI no longer produces, which is exactly the
// kind of quiet lie this project has spent its whole build avoiding. So
// staleness is a test failure, not something to remember.
test('docs/index.html is current with src/', async () => {
  const expected = standalone(await buildBody());
  const committed = await readFile(PAGE, 'utf8');
  assert.equal(
    committed,
    expected,
    'docs/index.html is stale — run `node site/build.mjs` and commit the result',
  );
});

test('site/artifact.html is current with src/', async () => {
  const expected = await buildBody();
  const committed = await readFile(FRAGMENT, 'utf8');
  assert.equal(
    committed,
    expected,
    'site/artifact.html is stale — run `node site/build.mjs` and commit the result',
  );
});

// The Artifact host wraps the fragment in its own document skeleton, so the
// fragment must not carry one of its own.
test('the artifact fragment has no document skeleton', async () => {
  const fragment = await readFile(FRAGMENT, 'utf8');
  // Match on the tag boundary, not a bare substring — `<header>` contains
  // `<head`, and a naive check fails on a page that is perfectly fine.
  const skeleton = [/<!doctype/i, /<html[\s>]/i, /<head[\s>]/i, /<body[\s>]/i];
  for (const pattern of skeleton) {
    assert.ok(!pattern.test(fragment), `fragment must not contain ${pattern}`);
  }
});

// A page that reaches for a CDN renders unstyled under the Artifact CSP, and
// breaks offline from a clone. Everything must be inline.
test('the page makes no external requests', async () => {
  const page = await readFile(PAGE, 'utf8');
  assert.ok(!/<script[^>]+\bsrc=/i.test(page), 'no external <script src>');
  assert.ok(!/<link[^>]+stylesheet/i.test(page), 'no external stylesheet');
  assert.ok(!/@import\s+url\(/i.test(page), 'no CSS @import');
  assert.ok(!/https?:\/\/(?!github\.com)/.test(page), 'no off-site URLs beyond the GitHub links');
});

// The inliner strips module syntax so the concatenated sources share one
// scope. If a new src/ module used a form the stripper misses, the page would
// throw on load — and the playground would be dead on arrival.
test('no module syntax survives inlining', async () => {
  const page = await readFile(PAGE, 'utf8');
  assert.ok(!/^import\s/m.test(page), 'a bare import survived inlining');
  assert.ok(!/^export\s/m.test(page), 'a bare export survived inlining');
  assert.ok(!page.includes('node:'), 'a Node builtin import survived inlining');
});
