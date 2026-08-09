import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Guards against the drift a reviewer caught in Task 13: a diagnostic added
// to src/ without a matching row in grammar.md's table (or a row left
// behind for a code that no longer exists) is a silent gap between what
// the checker does and what a model reading the plugin's docs is told it
// does. This intentionally diffs the *set* of codes, not a count anywhere
// in prose — a count drifts the moment someone edits a sentence without
// recounting; a set comparison can't drift by accident.

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const GRAMMAR = fileURLToPath(new URL('../plugin/skills/ux/reference/grammar.md', import.meta.url));

async function emittedCodes() {
  const files = (await readdir(SRC_DIR)).filter(f => f.endsWith('.js'));
  const codes = new Set();
  for (const file of files) {
    const text = await readFile(path.join(SRC_DIR, file), 'utf8');
    // Matches a quoted code literal, `'UX###'` — this covers both a direct
    // `diag('UX###', ...)` call and a code held in a lookup table (e.g.
    // check.js's STATE_RULES) that's passed to `diag()` through a variable.
    // A bare mention of a code in a comment, e.g. `(UX105)`, is unquoted
    // and doesn't match.
    for (const m of text.matchAll(/'(UX\d{3})'/g)) {
      codes.add(m[1]);
    }
  }
  return codes;
}

async function documentedCodes() {
  const text = await readFile(GRAMMAR, 'utf8');
  const codes = new Set();
  // The reference table's rows look like: `| UX001 | ... |`.
  for (const m of text.matchAll(/^\|\s*(UX\d{3})\s*\|/gm)) {
    codes.add(m[1]);
  }
  return codes;
}

test('every diagnostic code emitted in src/ has a row in grammar.md, and every row in grammar.md is still emitted somewhere', async () => {
  const emitted = await emittedCodes();
  const documented = await documentedCodes();

  assert.ok(emitted.size > 0, 'sanity check: found no diag() calls in src/ at all — the scan is broken');
  assert.ok(documented.size > 0, 'sanity check: found no UX rows in grammar.md at all — the scan is broken');

  const undocumented = [...emitted].filter(c => !documented.has(c)).sort();
  const stale = [...documented].filter(c => !emitted.has(c)).sort();

  assert.deepEqual(undocumented, [], `codes emitted in src/ but missing from grammar.md's table: ${undocumented.join(', ')}`);
  assert.deepEqual(stale, [], `codes documented in grammar.md but no longer emitted anywhere in src/: ${stale.join(', ')}`);
});
