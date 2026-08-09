#!/usr/bin/env node
// Builds the landing page.
//
// The playground on that page runs the REAL toolchain, not a reimplementation
// of it: this script reads the browser-safe modules straight out of `src/`,
// strips the `import`/`export` keywords that only make sense across module
// boundaries, and concatenates them into one module scope inside the page.
//
// Everything in `src/` except `project.js` is a pure function over strings —
// `project.js` is the only file that touches `node:fs`, and the playground
// replaces it by feeding the parser a string per virtual file. So the
// diagnostics a visitor sees are produced by the same code the CLI runs.
//
// A copy would have been quicker and would have started lying the first time
// a diagnostic changed. `test/site.test.js` fails if this output goes stale.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

async function inlineToolchain() {
  const parts = [];
  for (const name of MODULES) {
    const source = await readFile(join(ROOT, 'src', name), 'utf8');
    const stripped = source
      .replace(LOCAL_IMPORT, '')
      .replace(EXPORT_KEYWORD, '')
      .trim();
    parts.push(`// ---- src/${name} ${'-'.repeat(Math.max(0, 60 - name.length))}\n${stripped}`);
  }
  return parts.join('\n\n');
}

export const TITLE = 'ux-lang — a language for what your interface means';

export function standalone(body, title = TITLE) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="A small declarative language for what a user interface means. Catches the bugs a compiler can't — like a screen nobody can leave.">
</head>
<body>
${body}
</body>
</html>
`;
}

// Exported so `test/site.test.js` can rebuild in memory and compare against
// the committed page — that is what makes a stale `docs/index.html` a test
// failure rather than a silent lie in the playground.
export async function buildBody() {
  const template = await readFile(join(HERE, 'template.html'), 'utf8');

  if (!template.includes('/*__TOOLCHAIN__*/')) {
    throw new Error('site/template.html is missing the /*__TOOLCHAIN__*/ slot');
  }

  return template.replace('/*__TOOLCHAIN__*/', await inlineToolchain());
}

// Only write files when run as a command, so importing this module for the
// staleness test has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const body = await buildBody();
  await mkdir(join(ROOT, 'docs'), { recursive: true });
  await writeFile(join(ROOT, 'docs', 'index.html'), standalone(body));
  await writeFile(join(HERE, 'artifact.html'), body);
  process.stdout.write(`built docs/index.html and site/artifact.html (${MODULES.length} modules inlined)\n`);
}
