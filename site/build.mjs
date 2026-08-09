#!/usr/bin/env node
// Builds the ux-lang site.
//
// Two outputs from one set of fragments:
//
//   docs/          a real multi-page site, servable by GitHub Pages
//   site/artifact.html   the same content as one page with anchor nav,
//                        because an Artifact is a single page and relative
//                        links between pages would be dead there
//
// The playground on the landing page runs the REAL toolchain, not a
// reimplementation: this script reads the browser-safe modules straight out
// of `src/`, strips the import/export keywords that only make sense across
// module boundaries, and concatenates them into one module scope.
//
// Everything in `src/` except `project.js` is a pure function over strings —
// `project.js` is the only file that touches `node:fs` — so the diagnostics a
// visitor sees come from the same code the CLI runs. A copy would have been
// quicker and would have started lying the first time a diagnostic changed.
// `test/site.test.js` fails if any committed page goes stale.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const GITHUB = 'https://github.com/Arunachalamkalimuthu/ux-lang';

// Dependency order. Concatenated into one scope, so a module must appear
// after everything it references.
const MODULES = [
  'diagnostics.js',
  'parse-line.js',
  'lexer.js',
  'parser.js',
  'check.js',
  'linker.js',
  'map.js',
  'report.js',
];

const LOCAL_IMPORT = /^import\s+\{[^}]*\}\s+from\s+'\.\/[^']+';?[ \t]*$/gm;
const EXPORT_KEYWORD = /^export\s+(?=(?:const|let|function|class)\b)/gm;

export const POSTS = [
  {
    slug: 'the-regeneration-problem',
    title: 'The regeneration problem',
    standfirst: 'Why an AI rewrite quietly loses a step, and what has to exist for it not to.',
    date: '2026-08-09',
    minutes: 6,
  },
  {
    slug: 'reviewing-a-ui-before-it-exists',
    title: 'Reviewing a UI before it exists',
    standfirst: 'Flows are decisions. They should be reviewable in a pull request, not discovered in staging.',
    date: '2026-08-09',
    minutes: 5,
  },
  {
    slug: 'dead-ends-are-not-crashes',
    title: 'Dead ends are not crashes',
    standfirst: 'The class of defect that ships green: no exception, no failing test, and a user with nowhere to go.',
    date: '2026-08-09',
    minutes: 5,
  },
];

// The mark is `app.map`: screen names of unequal length on the left, padded so
// the arrows land in one aligned column on the right. That column is the
// artifact this tool produces and is specific to it — unlike a rounded square
// with an arrow leaving it, which is the standard sign-out icon.
//
// The names are held back to 55% so the arrows carry the mark: what the
// language is actually about is where things lead.
// The mark is a screen with a way out: a solid tile — the screen — with the
// exit arrow punched clean through it.
//
// Two earlier attempts failed for reasons worth recording. An outlined square
// with an arrow leaving it is the standard sign-out glyph, so it read as
// "logout" rather than as this project. A two-row `app.map` motif carried the
// right idea but collapsed to mush below about 24px. Solid shapes survive
// small sizes; thin outlines with notches do not.
//
// One path, `evenodd`, so the arrow is a hole rather than a second colour —
// the mark then works on any ground without knowing what is behind it.
// Corners are kept tight so the tile reads as a screen rather than an app-store
// icon, and the arrow sits off-centre toward the right wall — it is leaving,
// not resting.
const MARK_PATH = 'M5.5 2.5H18.5A3 3 0 0 1 21.5 5.5V18.5A3 3 0 0 1 18.5 21.5H5.5A3 3 0 0 1 2.5 18.5V5.5A3 3 0 0 1 5.5 2.5ZM5.9 10.6V13.4H13.4V16.8L19.6 12L13.4 7.2V10.6H5.9Z';

export function logo(size = 22) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
  <path d="${MARK_PATH}" fill="currentColor" fill-rule="evenodd"/>
</svg>`;
}

// Same mark, inlined as a data URI so the site has a real favicon without an
// external request. Sized for a 16px tab: heavier stroke, no opacity split —
// both would disappear at that scale.
function favicon() {
  // The xmlns below is an XML namespace identifier, not a fetch — a data-URI
  // SVG will not render without it, and nothing is requested over the network.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<path d="${MARK_PATH}" fill="#0B6E6B" fill-rule="evenodd"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function nav(links, current) {
  const items = links
    .map(([label, href, key]) =>
      `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  return `<nav class="nav">
  <a class="brand" href="${links[0][1]}">${logo()}<span>ux-lang</span></a>
  <div class="nav-links">${items}<a class="nav-gh" href="${GITHUB}">GitHub</a></div>
</nav>`;
}

function footer(base) {
  return `<footer>
  <div class="foot-grid">
    <div>
      <div class="brand foot-brand">${logo(20)}<span>ux-lang</span></div>
      <p>A small declarative language for what a user interface means.</p>
    </div>
    <div>
      <p class="foot-head">Project</p>
      <p><a href="${GITHUB}">GitHub</a><br><a href="${base}use-cases.html">Use cases</a><br><a href="${base}blog/">Blog</a></p>
    </div>
    <div>
      <p class="foot-head">Legal</p>
      <p><a href="${base}terms.html">Terms</a><br>Apache-2.0</p>
    </div>
  </div>
  <p class="foot-note">The patent grant is deliberate: a format is only worth having if other people can implement it without asking.</p>
</footer>`;
}

const PAGE_LINKS = base => [
  ['Overview', `${base}index.html`, 'index'],
  ['Use cases', `${base}use-cases.html`, 'use-cases'],
  ['Blog', `${base}blog/`, 'blog'],
  ['Terms', `${base}terms.html`, 'terms'],
];

const ANCHOR_LINKS = [
  ['Overview', '#top', 'index'],
  ['Use cases', '#use-cases', 'use-cases'],
  ['Blog', '#blog', 'blog'],
  ['Terms', '#terms', 'terms'],
];

async function inlineToolchain() {
  const parts = [];
  for (const name of MODULES) {
    const source = await readFile(join(ROOT, 'src', name), 'utf8');
    const stripped = source.replace(LOCAL_IMPORT, '').replace(EXPORT_KEYWORD, '').trim();
    parts.push(`// ---- src/${name} ${'-'.repeat(Math.max(0, 56 - name.length))}\n${stripped}`);
  }
  return parts.join('\n\n');
}

const frag = name => readFile(join(HERE, name), 'utf8');

export function standalone(body, title, description) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="icon" href="${favicon()}">
</head>
<body>
${body}
</body>
</html>
`;
}

// Assembles one page: shared styles, nav, content, footer.
async function shell({ content, base, current, links }) {
  const style = await frag('style.html');
  return `${style}\n${nav(links, current)}\n<main class="wrap" id="top">\n${content}\n</main>\n<div class="wrap">${footer(base)}</div>`;
}

export async function buildSite() {
  const toolchain = await inlineToolchain();

  const landing = (await frag('pages/index.html')).replace('/*__TOOLCHAIN__*/', toolchain);
  if (!landing.includes('const SAMPLE')) {
    throw new Error('site/pages/index.html lost its playground');
  }

  const useCases = await frag('pages/use-cases.html');
  const terms = await frag('pages/terms.html');
  const blogIndex = (await frag('pages/blog.html')).replace('<!--__POSTLIST__-->', postList(''));

  const posts = {};
  for (const post of POSTS) {
    posts[post.slug] = await frag(`posts/${post.slug}.html`);
  }

  return { landing, useCases, terms, blogIndex, posts };
}

function postList(base) {
  return POSTS.map(p => `<a class="post-card" href="${base}${p.slug}.html">
  <span class="post-meta">${p.date} · ${p.minutes} min</span>
  <span class="post-title">${p.title}</span>
  <span class="post-stand">${p.standfirst}</span>
</a>`).join('\n');
}

const DESC = {
  index: 'A small declarative language for what a user interface means. Catches the bugs a compiler cannot, like a screen nobody can leave.',
  'use-cases': 'Where a .ux file earns its keep: regenerating an app without losing a step, reviewing flows before code exists, and guarding navigation in CI.',
  blog: 'Writing about the problems .ux is meant to solve.',
  terms: 'Terms of use for the ux-lang website.',
};

export async function buildPages() {
  const { landing, useCases, terms, blogIndex, posts } = await buildSite();
  const out = {};

  out['docs/index.html'] = standalone(
    await shell({ content: landing, base: '', current: 'index', links: PAGE_LINKS('') }),
    'ux-lang — a language for what your interface means', DESC.index);

  out['docs/use-cases.html'] = standalone(
    await shell({ content: useCases, base: '', current: 'use-cases', links: PAGE_LINKS('') }),
    'Use cases — ux-lang', DESC['use-cases']);

  out['docs/terms.html'] = standalone(
    await shell({ content: terms, base: '', current: 'terms', links: PAGE_LINKS('') }),
    'Terms — ux-lang', DESC.terms);

  out['docs/blog/index.html'] = standalone(
    await shell({ content: blogIndex, base: '../', current: 'blog', links: PAGE_LINKS('../') }),
    'Blog — ux-lang', DESC.blog);

  for (const post of POSTS) {
    out[`docs/blog/${post.slug}.html`] = standalone(
      await shell({ content: posts[post.slug], base: '../', current: 'blog', links: PAGE_LINKS('../') }),
      `${post.title} — ux-lang`, post.standfirst);
  }

  // Single-page build for the Artifact: same fragments, anchor nav. The
  // fragments link to each other as files, which is right for the real site
  // and dead in a one-page artifact — so rewrite those links to anchors
  // rather than maintaining a second copy of the content.
  const toAnchor = html => POSTS
    .reduce((s, p) => s
      .replaceAll(`href="blog/${p.slug}.html"`, `href="#${p.slug}"`)
      .replaceAll(`href="${p.slug}.html"`, `href="#${p.slug}"`),
      html)
    .replaceAll('href="../use-cases.html"', 'href="#use-cases"')
    .replaceAll('href="use-cases.html"', 'href="#use-cases"')
    .replaceAll('href="../terms.html"', 'href="#terms"')
    .replaceAll('href="terms.html"', 'href="#terms"')
    .replaceAll('href="../blog/"', 'href="#blog"')
    .replaceAll('href="blog/"', 'href="#blog"');

  const allInOne = toAnchor([
    landing,
    `<div id="use-cases"></div>`, useCases,
    `<div id="blog"></div>`, blogIndex.replace('<!--__POSTLIST__-->', postList('')),
    ...POSTS.map(p => `<div id="${p.slug}"></div>\n${posts[p.slug]}`),
    `<div id="terms"></div>`, terms,
  ].join('\n'));

  out['site/artifact.html'] = await shell({
    content: allInOne, base: '#', current: 'index', links: ANCHOR_LINKS,
  });

  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pages = await buildPages();
  await mkdir(join(ROOT, 'docs', 'blog'), { recursive: true });
  for (const [path, html] of Object.entries(pages)) {
    await writeFile(join(ROOT, path), html);
  }
  process.stdout.write(`built ${Object.keys(pages).length} pages (${MODULES.length} modules inlined)\n`);
}
