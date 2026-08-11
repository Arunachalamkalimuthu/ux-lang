import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatSource, isFormatted } from '../src/format.js';
import { parse } from '../src/parser.js';
import { findUxFiles } from '../src/project.js';

const EXAMPLES = new URL('../examples/', import.meta.url).pathname;

// Formatting inserts and removes blank lines, so line numbers legitimately
// move. Everything else about the tree must be untouched.
function withoutLines(value) {
  if (Array.isArray(value)) return value.map(withoutLines);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'line')
        .map(([key, v]) => [key, withoutLines(v)]),
    );
  }
  return value;
}

const LEXICAL = new Set(['UX001', 'UX002', 'UX003', 'UX004']);

// ---- the invariant that matters -----------------------------------------
//
// A formatter that changes meaning is worse than no formatter. Formatting may
// resolve lexical complaints — that is its job — and must change nothing else.

test('formatting preserves the parse tree and every non-lexical diagnostic', async () => {
  for (const name of await readdir(EXAMPLES)) {
    for (const path of await findUxFiles(join(EXAMPLES, name, 'ux'))) {
      const source = await readFile(path, 'utf8');
      const before = parse(source, path);
      const after = parse(formatSource(source), path);

      assert.deepEqual(
        withoutLines(after.ast), withoutLines(before.ast),
        `${path}: formatting changed the parse tree`,
      );

      const codes = r => r.diags.filter(d => !LEXICAL.has(d.code)).map(d => d.code).sort();
      assert.deepEqual(codes(after), codes(before), `${path}: formatting changed the diagnostics`);
    }
  }
});

test('formatting a deliberately messy file preserves its tree', () => {
  const messy = 'app Demo\nscreen Home\n\t at /\n   intent "x"   \n\n\n\n  action "Go" -> Home\n';
  const before = parse(messy, 'a.ux');
  const after = parse(formatSource(messy), 'a.ux');
  assert.deepEqual(withoutLines(after.ast), withoutLines(before.ast));
});

test('formatting is idempotent', async () => {
  const messy = 'app Demo\n\n\n\nscreen Home\n\t\tintent "x"\n   action "Go" -> Home   \n\n\n';
  const once = formatSource(messy);
  assert.equal(formatSource(once), once);

  for (const name of await readdir(EXAMPLES)) {
    for (const path of await findUxFiles(join(EXAMPLES, name, 'ux'))) {
      const source = await readFile(path, 'utf8');
      assert.equal(formatSource(formatSource(source)), formatSource(source), path);
    }
  }
});

// The shipped examples are the language's teaching material. If they are not
// canonical, the format is wrong or they are.
test('every shipped example is already canonical', async () => {
  for (const name of await readdir(EXAMPLES)) {
    for (const path of await findUxFiles(join(EXAMPLES, name, 'ux'))) {
      assert.ok(isFormatted(await readFile(path, 'utf8')), `${path} is not canonical`);
    }
  }
});

// ---- individual rules ----------------------------------------------------

test('tabs become two spaces, matching the lexer', () => {
  assert.equal(formatSource('screen A\n\tintent "x"\n'), 'screen A\n  intent "x"\n');
});

// Floor, not round: at three spaces the lexer has already nested the line one
// level, and rounding up to four would nest it two — formatting would change
// the program.
test('odd indentation floors to the depth the lexer already assigned', () => {
  assert.equal(formatSource('screen A\n   intent "x"\n'), 'screen A\n  intent "x"\n');
  assert.equal(formatSource('screen A\n     intent "x"\n'), 'screen A\n    intent "x"\n');
});

test('trailing whitespace goes', () => {
  assert.equal(formatSource('screen A   \n  intent "x"\t\n'), 'screen A\n  intent "x"\n');
});

test('runs of blank lines collapse to one, and a top-level declaration gets one above it', () => {
  assert.equal(
    formatSource('app A\nscreen B\n  intent "x"\n\n\n\n  text "y"\n'),
    'app A\n\nscreen B\n  intent "x"\n\n  text "y"\n',
  );
});

test('leading blank lines are dropped and exactly one trailing newline remains', () => {
  assert.equal(formatSource('\n\napp A\n\n\n'), 'app A\n');
});

// Comments are the reason this formatter works on raw lines rather than
// re-printing the AST — the tree does not carry them, so a round trip through
// it would silently delete every one.
test('comments survive, and are re-indented like anything else', () => {
  assert.equal(
    formatSource('screen A\n   # why this exists\n   intent "x"\n'),
    'screen A\n  # why this exists\n  intent "x"\n',
  );
  assert.equal(formatSource('# a leading note\napp A\n'), '# a leading note\n\napp A\n');
});

test('an empty file formats to an empty file rather than a stray newline', () => {
  assert.equal(formatSource(''), '');
  assert.equal(formatSource('\n\n\n'), '');
});

test('isFormatted agrees with formatSource', () => {
  const canonical = 'app A\n\nscreen B\n  intent "x"\n';
  assert.ok(isFormatted(canonical));
  assert.ok(!isFormatted('app A\nscreen B\n  intent "x"\n'));
});

// ---- audit regressions -----------------------------------------------------

test('formatting is idempotent when a top-level declaration is indented one space', () => {
  const source = 'app Demo\n screen Home\n  at /\n  intent "Land"\n  text "hi"\n';
  const once = formatSource(source);
  assert.equal(formatSource(once), once, 'a second pass changed the file again');
});

test('a file that formatSource produced is already formatted', () => {
  for (const source of [
    'app Demo\n screen Home\n  intent "x"\n',
    ' app Demo\nscreen Home\n  intent "x"\n',
    'app Demo\n\n  screen Home\n   intent "x"\n',
  ]) {
    assert.ok(isFormatted(formatSource(source)), `not stable for: ${JSON.stringify(source)}`);
  }
});

test('formatting does not rewrite a tab inside a string', () => {
  const source = 'screen Home\n  text "a\tb"\n';
  assert.match(formatSource(source), /"a\tb"/);
});

test('formatting still expands a tab used for indentation', () => {
  assert.match(formatSource('screen Home\n\ttext "x"\n'), /\n  text "x"/);
});

test('formatting leaves escapes exactly as written', () => {
  const source = 'screen Home\n  intent "Show \\"recently viewed\\" items"\n';
  assert.equal(formatSource(source), source);
});

// ---- generative round trip -------------------------------------------------
//
// The invariant above is checked against the repo's own examples, and every one
// of them is already canonical — which is exactly why a real non-idempotence
// bug lived here undetected: no committed file had a top-level declaration
// indented by one space, so no test ever formatted one twice. Fixtures test the
// cases someone thought of. This generates the ones nobody did.

function randomSource(seed) {
  // A seeded LCG, so a failure names a case you can re-run rather than a case
  // that vanishes on the next run.
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) & 0x7fffffff);
  const pick = xs => xs[next() % xs.length];

  const BODY = [
    'app Demo', 'site example.com', 'data Task', 'title text required',
    'screen Home', 'at /', 'intent "why this exists"', 'heading "Title"',
    'text "some copy"', 'text "a # hash inside"', 'text "an \\" escaped quote"',
    'text "a \\\\ backslash"', 'group "Section"', 'list Task', 'row title',
    'tap -> Detail(task)', 'empty "none"', 'loading skeleton 3 rows',
    'error "failed" action retry', 'action "Go" -> Detail',
    'form Task', 'submit "Save" -> Home', 'component Card(x)', 'use Card(x)',
    'flow doThing(a)', 'go Home', 'toast "done"', '# a standalone comment',
    'if cond', 'else', 'tabs A | B', '-> Home',
  ];

  const lines = [];
  const count = 4 + (next() % 18);
  for (let i = 0; i < count; i++) {
    const roll = next() % 10;
    if (roll === 0) { lines.push(''); continue; }
    const indent = next() % 7;                                  // includes odd indents
    const lead = (next() % 5 === 0) ? '\t'.repeat(1 + (next() % 2)) : ' '.repeat(indent);
    const trail = (next() % 4 === 0) ? ' '.repeat(1 + (next() % 3)) : '';
    const comment = (next() % 6 === 0) ? '   # trailing note' : '';
    lines.push(lead + pick(BODY) + comment + trail);
  }
  return lines.join('\n') + (next() % 2 ? '\n' : '');
}

test('formatting is idempotent and meaning-preserving on generated sources', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const source = randomSource(seed);
    const once = formatSource(source);
    const twice = formatSource(once);
    const label = `seed ${seed}: ${JSON.stringify(source)}`;

    assert.equal(twice, once, `${label}\nformatting was not idempotent`);
    assert.ok(isFormatted(once), `${label}\nformatSource produced output isFormatted rejects`);

    const before = parse(source, 'a.ux');
    const after = parse(once, 'a.ux');
    assert.deepEqual(withoutLines(after.ast), withoutLines(before.ast),
      `${label}\nformatting changed the parse tree`);

    const codes = r => r.diags.filter(d => !LEXICAL.has(d.code)).map(d => d.code).sort();
    assert.deepEqual(codes(after), codes(before), `${label}\nformatting changed the diagnostics`);
  }
});
