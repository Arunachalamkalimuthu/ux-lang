import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPages, POSTS } from '../site/build.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = path => readFile(join(ROOT, path), 'utf8');

// The playground runs the real toolchain, inlined from src/ at build time.
// That is only true while the committed pages are current: a stale page would
// show diagnostics the CLI no longer produces, which is the kind of quiet lie
// this project has spent its whole build avoiding. So staleness fails the
// suite rather than depending on anyone remembering to rebuild.
test('every committed page is current with src/ and site/', async () => {
  const pages = await buildPages();
  for (const [path, expected] of Object.entries(pages)) {
    const committed = await read(path);
    assert.equal(committed, expected, `${path} is stale — run \`node site/build.mjs\` and commit`);
  }
});

test('the build emits every page the nav links to', async () => {
  const pages = await buildPages();
  const expected = [
    'docs/index.html',
    'docs/use-cases.html',
    'docs/terms.html',
    'docs/blog/index.html',
    ...POSTS.map(p => `docs/blog/${p.slug}.html`),
    'site/artifact.html',
  ];
  assert.deepEqual(Object.keys(pages).sort(), expected.sort());
});

// A link that 404s on a static host is invisible until someone clicks it.
test('internal links resolve to files the build actually emits', async () => {
  const pages = await buildPages();
  const emitted = new Set(Object.keys(pages));

  for (const [path, html] of Object.entries(pages)) {
    if (path === 'site/artifact.html') continue; // anchors, not files
    const dir = path.slice(0, path.lastIndexOf('/'));
    const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map(m => m[1]);

    for (const href of hrefs) {
      if (/^(https?:|mailto:|data:)/.test(href)) continue;
      const target = href.endsWith('/') ? `${href}index.html` : href;
      const resolved = new URL(target, `file:///${dir}/`).pathname.slice(1);
      assert.ok(emitted.has(resolved), `${path} links to ${href} -> ${resolved}, which is never emitted`);
    }
  }
});

// The Artifact host wraps the fragment in its own document skeleton, so the
// fragment must not carry one. Match on the tag boundary, not a bare
// substring — `<header>` contains `<head`.
test('the artifact fragment has no document skeleton', async () => {
  const fragment = (await buildPages())['site/artifact.html'];
  for (const pattern of [/<!doctype/i, /<html[\s>]/i, /<head[\s>]/i, /<body[\s>]/i]) {
    assert.ok(!pattern.test(fragment), `fragment must not contain ${pattern}`);
  }
});

// An Artifact is one page, so cross-page links would be dead there.
test('the artifact fragment links only to anchors and off-site URLs', async () => {
  const fragment = (await buildPages())['site/artifact.html'];
  const hrefs = [...fragment.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
  const broken = hrefs.filter(h => !h.startsWith('#') && !/^https?:/.test(h));
  assert.deepEqual(broken, [], 'artifact links must be anchors or absolute URLs');
});

// A page that reaches for a CDN renders unstyled under the Artifact CSP and
// breaks offline from a clone. Everything must be inline.
test('no page makes an external request', async () => {
  for (const [path, html] of Object.entries(await buildPages())) {
    assert.ok(!/<script[^>]+\bsrc=/i.test(html), `${path}: external <script src>`);
    assert.ok(!/<link[^>]+stylesheet/i.test(html), `${path}: external stylesheet`);
    assert.ok(!/@import\s+url\(/i.test(html), `${path}: CSS @import`);
    // w3.org appears only as the SVG XML namespace inside the data-URI
    // favicon — a namespace identifier, never fetched.
    const offSite = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)]
      .map(m => m[0])
      .filter(u => !/^https:\/\/github\.com\//.test(u))
      .filter(u => u !== 'http://www.w3.org/2000/svg');
    assert.deepEqual(offSite, [], `${path}: off-site URL`);
  }
});

// The inliner strips module syntax so the concatenated sources share one
// scope. A new src/ module using a form the stripper misses would throw on
// load, and the playground would be dead on arrival.
test('no module syntax survives inlining', async () => {
  const page = (await buildPages())['docs/index.html'];
  assert.ok(!/^import\s/m.test(page), 'a bare import survived inlining');
  assert.ok(!/^export\s/m.test(page), 'a bare export survived inlining');
  assert.ok(!page.includes('node:'), 'a Node builtin import survived inlining');
});

// Only the landing page needs the toolchain; shipping ~44kb of it on the
// terms page would be waste.
test('the toolchain ships only where the playground is', async () => {
  const pages = await buildPages();
  assert.ok(pages['docs/index.html'].includes('function treeify'), 'landing page lost the toolchain');
  assert.ok(!pages['docs/terms.html'].includes('function treeify'), 'terms page carries the toolchain');
  assert.ok(!pages['docs/use-cases.html'].includes('function treeify'), 'use-cases page carries the toolchain');
});

// The terms page states facts about a real company. Anything the author must
// supply is marked, and shipping with a marker still in place would publish a
// placeholder as though it were a fact.
test('terms placeholders are visibly marked', async () => {
  const terms = (await buildPages())['docs/terms.html'];
  const markers = [...terms.matchAll(/\[ [A-Z ]+ \]/g)].map(m => m[0]);
  assert.ok(markers.length > 0, 'expected the unfilled fields to be marked');
  for (const marker of markers) {
    assert.ok(
      terms.includes(`class="fill">${marker}<`),
      `${marker} must carry the .fill highlight so it cannot ship unnoticed`,
    );
  }
});
