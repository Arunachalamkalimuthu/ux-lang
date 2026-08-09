import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

// The website's playground imports the toolchain straight out of `src/` and
// runs it in a browser. That is only possible while `project.js` remains the
// single module that touches the filesystem — everything else has to stay a
// pure function over strings.
//
// This is the invariant the whole "it runs the real checker, not a copy" claim
// rests on, and it is easy to break by accident: one `node:fs` import in the
// linker and the site build fails with a module error nobody expects. Failing
// here instead says why.
const ALLOWED_NODE_IMPORTS = new Set(['project.js']);

test('only project.js reaches for a Node builtin', async () => {
  for (const name of await readdir(SRC)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(join(SRC, name), 'utf8');
    const builtins = [...source.matchAll(/from\s+'(node:[^']+)'/g)].map(m => m[1]);

    if (ALLOWED_NODE_IMPORTS.has(name)) continue;
    assert.deepEqual(
      builtins, [],
      `src/${name} imports ${builtins.join(', ')} — the playground cannot run it in a browser. ` +
      'Move the filesystem work into project.js, or accept that the site can no longer run the real toolchain.',
    );
  }
});

test('the modules the playground imports have no side effects on load', async () => {
  // A module that does work at import time would run it during the site build
  // and again in every visitor's browser. Each of these should only declare.
  for (const name of ['parser.js', 'check.js', 'linker.js', 'lint.js', 'diagnostics.js']) {
    const source = await readFile(join(SRC, name), 'utf8');
    const topLevelCalls = source
      .split('\n')
      .filter(line => /^[a-zA-Z_$][\w$]*\(/.test(line));
    assert.deepEqual(topLevelCalls, [], `src/${name} calls something at module scope`);
  }
});
