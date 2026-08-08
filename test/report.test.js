import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diag, WARNING } from '../src/diagnostics.js';
import { renderDiagnostics } from '../src/report.js';
import { parse } from '../src/parser.js';
import { check } from '../src/check.js';
import { link } from '../src/linker.js';

test('every diagnostic prints location, code, message, and fix', () => {
  const out = renderDiagnostics([
    diag('UX102', 'ux/screens/inbox.ux', 12, 'This list has no `empty` case.', 'empty "Nothing here yet."'),
  ]);
  assert.match(out, /ux\/screens\/inbox\.ux:12/);
  assert.match(out, /UX102/);
  assert.match(out, /add:\s+empty "Nothing here yet\."/);
});

test('clean input reports success', () => {
  assert.match(renderDiagnostics([]), /No problems found/);
});

test('warning diagnostic counts in warning column, not error', () => {
  const out = renderDiagnostics([
    diag('UX100', 'file.ux', 5, 'This is an error', 'fix this'),
    diag('UX101', 'file.ux', 10, 'This is a warning', 'fix this too', WARNING),
    diag('UX102', 'file.ux', 15, 'Another warning', 'fix it', WARNING),
  ]);
  assert.match(out, /1 error\(s\), 2 warning\(s\)/);
});

// `renderDiagnostics` prepends its own `  add:  ` prefix to every fix string.
// A `diag(...)` call site that bakes the same boilerplate into its own fix
// text produces a doubled `add:  add:  ...` line — exactly the defect Task 9
// review found in `src/check.js` and `src/linker.js`. This is the general
// guard: run a deliberately broken fixture through the real
// parse -> check -> link pipeline and confirm no diagnostic's fix string
// starts with the prefix the renderer already supplies.
test('no diagnostic fix string starts with the renderer-supplied `add:` prefix', () => {
  const BROKEN = [
    'data Task',
    '  title bogus',
    'screen Home',
    '  list Ghost',
    '    row title',
    '  use Missing(task)',
    '  action "Go" -> Nowhere',
  ].join('\n');

  const { ast, diags: parseDiags } = parse(BROKEN, 'broken.ux');
  const checkDiags = check(ast);
  const { diags: linkDiags } = link([ast]);
  const diags = [...parseDiags, ...checkDiags, ...linkDiags];

  // Guard the guard: if the fixture stops producing diagnostics, this test
  // would pass vacuously and stop catching anything.
  assert.ok(diags.length >= 5, `fixture should produce several diagnostics, got ${diags.length}`);

  for (const d of diags) {
    assert.doesNotMatch(d.fix, /^add:/, `${d.code} fix bakes in the renderer's prefix: ${d.fix}`);
  }
});
