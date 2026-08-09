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

// The mark is three lines of `.ux`: a declaration at the left margin, two
// indented under it, and one of those running out as an arrow.
//
// Indentation is this language's only structure and the arrow is its only
// operator, so together they are the shortest possible picture of a `.ux`
// file — and nothing else in the icon vocabulary looks like it.
//
// Three earlier attempts are worth recording as dead ends. An outlined square
// with an arrow leaving it is the standard sign-out glyph and read as
// "logout". A two-row `app.map` motif carried the right idea but collapsed
// below ~24px. A solid tile with the arrow punched through was legible but
// generic — a send button.
//
// Solid shapes, because thin outlines lose their detail at favicon size. The
// bars are ragged on the right, as real lines of code are; the arrow is the
// longest because it is the one that goes somewhere.
const MARK_PARTS = (soften = 0.9) => `
  <rect x="2.6" y="4.1" width="14.2" height="2.9" rx="1.45"/>
  <path d="M7.4 10.55H14.4V8.5L20.7 12L14.4 15.5V13.45H7.4Z"
        stroke="currentColor" stroke-width="${soften}" stroke-linejoin="round"/>
  <rect x="7.4" y="17" width="8.4" height="2.9" rx="1.45"/>`;

export function logo(size = 22) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${MARK_PARTS()}
</svg>`;
}

// Same mark, inlined as a data URI so the site has a real favicon without an
// external request. Sized for a 16px tab: heavier stroke, no opacity split —
// both would disappear at that scale.
function favicon() {
  // The xmlns below is an XML namespace identifier, not a fetch — a data-URI
  // SVG will not render without it, and nothing is requested over the network.
  // Corners softened a touch harder here: at 16px the arrow's points read as
  // noise otherwise.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0B6E6B" stroke="#0B6E6B">` +
    MARK_PARTS(1.4).replace(/\n\s*/g, '') + `</svg>`;
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
      <p><a href="${base}syntax.html">Syntax</a><br><a href="${base}roadmap.html">Roadmap</a><br><a href="${base}use-cases.html">Use cases</a><br><a href="${base}blog/">Blog</a></p>
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
  ['Syntax', `${base}syntax.html`, 'syntax'],
  ['Roadmap', `${base}roadmap.html`, 'roadmap'],
  ['Use cases', `${base}use-cases.html`, 'use-cases'],
  ['Blog', `${base}blog/`, 'blog'],
  ['Terms', `${base}terms.html`, 'terms'],
];

const ANCHOR_LINKS = [
  ['Overview', '#top', 'index'],
  ['Syntax', '#syntax', 'syntax'],
  ['Roadmap', '#roadmap', 'roadmap'],
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

// ---- markdown -----------------------------------------------------------
//
// The syntax page is rendered from the same `grammar.md` the plugin ships, so
// there is exactly one grammar reference and the site cannot drift from what
// a model is taught. That rules out hand-writing a second copy in HTML, and
// the zero-dependency rule rules out a markdown library — so this covers the
// subset that file actually uses: headings, fences, tables, bullets, inline
// code and bold. No links or blockquotes appear in it.

const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Escaping runs first, so `**` and backticks inside code samples can never be
// mistaken for markup.
const BLOB = `${GITHUB}/blob/master/`;

const inline = s => escapeHtml(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // A relative target is a path in the repository, not a page on this site —
  // docs/ is served from a subdirectory and these files live at the root — so
  // send it to GitHub. Absolute URLs and anchors are left alone.
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    `<a href="${/^(https?:|#|mailto:)/.test(href) ? href : BLOB + href}">${text}</a>`);

const CELLS = row => row.split('|').slice(1, -1).map(c => c.trim());

// Drops a markdown file's title and preamble, keeping everything from the
// first `##` onward.
function afterPreamble(md) {
  const lines = md.split('\n');
  const first = lines.findIndex(l => l.startsWith('## '));
  return first === -1 ? md : lines.slice(first).join('\n');
}

export function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      // The page supplies its own h1, so markdown headings start at h2.
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const head = CELLS(rows[0]).map(c => `<th>${inline(c)}</th>`).join('');
      const body = rows.slice(2)
        .map(r => `<tr>${CELLS(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || /^\s+\S/.test(lines[i]))) {
        if (lines[i].startsWith('- ')) items.push(lines[i].slice(2));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<ul>${items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const para = [];
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !lines[i].startsWith('```') && !lines[i].startsWith('|') &&
      !lines[i].startsWith('- ') && !/^#{1,4}\s/.test(lines[i])
    ) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

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

  const grammar = await readFile(join(ROOT, 'plugin/skills/ux/reference/grammar.md'), 'utf8');
  // Everything before the first `##` is the file's own title and preamble; the
  // page supplies its own. Slicing to the heading rather than a line count
  // means the preamble can grow without leaving half a sentence behind.
  const grammarBody = markdownToHtml(afterPreamble(grammar));
  const syntax = (await frag('pages/syntax.html')).replace('<!--__GRAMMAR__-->', grammarBody);

  const roadmapSource = await readFile(join(ROOT, 'ROADMAP.md'), 'utf8');
  // Drop the file's own h1 and standfirst; the page supplies both.
  const roadmap = (await frag('pages/roadmap.html'))
    .replace('<!--__ROADMAP__-->', markdownToHtml(afterPreamble(roadmapSource)));

  const useCases = await frag('pages/use-cases.html');
  const terms = await frag('pages/terms.html');
  const blogIndex = (await frag('pages/blog.html')).replace('<!--__POSTLIST__-->', postList(''));

  const posts = {};
  for (const post of POSTS) {
    posts[post.slug] = await frag(`posts/${post.slug}.html`);
  }

  return { landing, syntax, roadmap, useCases, terms, blogIndex, posts };
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
  syntax: 'The complete .ux grammar: declarations, screen elements, flows, the rules the checker enforces, and every diagnostic code.',
  roadmap: 'What ships next and why, what is deliberately not planned, and what would change the plan.',
  'use-cases': 'Where a .ux file earns its keep: regenerating an app without losing a step, reviewing flows before code exists, and guarding navigation in CI.',
  blog: 'Writing about the problems .ux is meant to solve.',
  terms: 'Terms of use for the ux-lang website.',
};

export async function buildPages() {
  const { landing, syntax, roadmap, useCases, terms, blogIndex, posts } = await buildSite();
  const out = {};

  out['docs/index.html'] = standalone(
    await shell({ content: landing, base: '', current: 'index', links: PAGE_LINKS('') }),
    'ux-lang — a language for what your interface means', DESC.index);

  out['docs/syntax.html'] = standalone(
    await shell({ content: syntax, base: '', current: 'syntax', links: PAGE_LINKS('') }),
    'Syntax — ux-lang', DESC.syntax);

  out['docs/roadmap.html'] = standalone(
    await shell({ content: roadmap, base: '', current: 'roadmap', links: PAGE_LINKS('') }),
    'Roadmap — ux-lang', DESC.roadmap);

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
    .replaceAll('href="../syntax.html"', 'href="#syntax"')
    .replaceAll('href="syntax.html"', 'href="#syntax"')
    .replaceAll('href="../roadmap.html"', 'href="#roadmap"')
    .replaceAll('href="roadmap.html"', 'href="#roadmap"')
    .replaceAll('href="../terms.html"', 'href="#terms"')
    .replaceAll('href="terms.html"', 'href="#terms"')
    .replaceAll('href="../blog/"', 'href="#blog"')
    .replaceAll('href="blog/"', 'href="#blog"');

  const allInOne = toAnchor([
    landing,
    `<div id="syntax"></div>`, syntax,
    `<div id="roadmap"></div>`, roadmap,
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
