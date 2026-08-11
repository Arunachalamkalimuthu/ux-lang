import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diag, WARNING } from '../src/diagnostics.js';
import { renderDiagnostics } from '../src/report.js';
import { parse } from '../src/parser.js';
import { check } from '../src/check.js';
import { link } from '../src/linker.js';
import { lint } from '../src/lint.js';

test('every diagnostic prints location, code, message, and fix', () => {
  const out = renderDiagnostics([
    diag('UX102', 'ux/screens/inbox.ux', 12, 'This list has no `empty` case.', 'empty "Nothing here yet."'),
  ]);
  assert.match(out, /ux\/screens\/inbox\.ux:12/);
  assert.match(out, /UX102/);
  assert.match(out, /fix:\s+empty "Nothing here yet\."/);
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

// `renderDiagnostics` prepends its own `  fix:  ` label to every fix string
// (it used to be `  add:  `, which was wrong for fixes that are corrections
// or instructions rather than lines to add — see report round 2). A
// `diag(...)` call site that bakes the same kind of boilerplate into its own
// fix text produces a doubled `fix:  add:  ...` (or `fix:  write:  ...`)
// line — exactly the defect Task 9 review found across `src/check.js`,
// `src/linker.js`, and `src/parser.js`. This is the general guard: run a
// deliberately broken fixture through the real parse -> check -> link
// pipeline and confirm no diagnostic's fix string starts with any of the
// boilerplate verb-and-colon prefixes the renderer already supplies.
test('no diagnostic fix string starts with a renderer-supplied boilerplate prefix (add:/write:)', () => {
  const BROKEN = [
    'data Task',
    '  title bogus',
    'screen Home',
    '  intent why',
    '  list Ghost',
    '    row title',
    '  use Missing(task)',
    '  action "Go" -> Nowhere',
  ].join('\n');

  const { ast, diags: parseDiags } = parse(BROKEN, 'broken.ux');
  const checkDiags = check(ast);
  const { diags: linkDiags } = link([ast]);
  // `lint` belongs in this pipeline too. Leaving it out is exactly why this
  // guard did not catch UX305 shipping with a doubled `add:` prefix — the
  // fixture reaches UX300 and UX305, so the rule was in range the whole time
  // and only the pipeline was short.
  const lintDiags = lint([ast]);
  const diags = [...parseDiags, ...checkDiags, ...linkDiags, ...lintDiags];

  // Guard the guard: if the fixture stops producing diagnostics, this test
  // would pass vacuously and stop catching anything. The fixture also must
  // still reach a parser-level diagnostic (UX014, from the unquoted
  // `intent`) — that's the code path round 1's fixture never touched, and
  // round 1's `write:` survey findings all lived in `src/parser.js`.
  assert.ok(diags.length >= 5, `fixture should produce several diagnostics, got ${diags.length}`);
  assert.ok(diags.some(d => d.code === 'UX014'), 'fixture should exercise a parser-level diagnostic too');

  for (const d of diags) {
    assert.doesNotMatch(d.fix, /^(add|write):/, `${d.code} fix bakes in a renderer-supplied prefix: ${d.fix}`);
  }
});
