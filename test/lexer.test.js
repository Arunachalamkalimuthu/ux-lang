import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex, treeify } from '../src/lexer.js';

test('lex records depth from two-space indentation', () => {
  const { lines, diags } = lex('screen Inbox\n  intent "hi"\n', 'a.ux');
  assert.equal(diags.length, 0);
  assert.deepEqual(lines.map(l => [l.depth, l.text, l.line]), [
    [0, 'screen Inbox', 1],
    [1, 'intent "hi"', 2],
  ]);
});

test('lex skips blank lines and comments', () => {
  const { lines } = lex('# note\n\nscreen A\n', 'a.ux');
  assert.deepEqual(lines.map(l => l.text), ['screen A']);
});

test('lex strips trailing comments but not inside strings', () => {
  const { lines } = lex('text "a # b" # tail\n', 'a.ux');
  assert.equal(lines[0].text, 'text "a # b"');
});

// --- UX004: an unterminated (odd-quote-count) string ---

test('an unterminated `heading` string reports UX004', () => {
  const { diags } = lex('heading "My tasks\n', 'a.ux');
  assert.ok(diags.some(d => d.code === 'UX004' && d.line === 1));
});

test('`action "Go -> Other` (unmatched quote swallowing the arrow) reports UX004', () => {
  const { diags } = lex('action "Go -> Other\n', 'a.ux');
  assert.ok(diags.some(d => d.code === 'UX004'));
});

test('an unterminated string is still emitted into `lines` so parsing can recover', () => {
  const { lines, diags } = lex('heading "My tasks\n', 'a.ux');
  assert.ok(diags.some(d => d.code === 'UX004'));
  assert.equal(lines.length, 1);
});

test('the UX004 fix names closing the string', () => {
  const { diags } = lex('heading "My tasks\n', 'a.ux');
  const found = diags.find(d => d.code === 'UX004');
  assert.match(found.fix, /close the string/);
});

// Regression guard: balanced strings — including one with a `#` inside the
// quotes — must NOT trip UX004. This is the case the bug report calls out
// specifically: `stripComment` swallowing a comment only happens when the
// string is *not* closed; a closed string containing `#` is fine and common.
test('balanced strings, including one containing a `#`, do not report UX004', () => {
  const src = [
    'screen A',
    '  intent "See what\'s due and clear it"',
    '  text "Nothing overdue # ok"',
    '  empty "All clear." action "New task" -> NewTask',
    '  action "Save" -> A',
  ].join('\n');
  const { diags } = lex(src, 'a.ux');
  assert.ok(!diags.some(d => d.code === 'UX004'));
});

// Regression guard for the false positive the coordinator caught: a `"`
// inside an actual `#` comment (not inside a string) is not a string at
// all and must never trip UX004 — the fix, before this, was counting every
// `"` on the raw line, which also counted comment quotes and rejected
// correct programs.
test('a comment containing a `"` does not report UX004', () => {
  const { diags } = lex('# a comment mentioning the " character\n', 'a.ux');
  assert.ok(!diags.some(d => d.code === 'UX004'));
});

test('a trailing comment containing a `"` after a balanced string does not report UX004', () => {
  const { diags } = lex('intent "Land"   # use " to quote\n', 'a.ux');
  assert.ok(!diags.some(d => d.code === 'UX004'));
});

test('a comment quote does not mask a real unterminated string later reported on its own line', () => {
  const src = [
    '# a comment mentioning the " character',
    'intent "Land"   # use " to quote',
    'heading "My tasks',
  ].join('\n');
  const { diags } = lex(src, 'a.ux');
  const found = diags.filter(d => d.code === 'UX004');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test('lex rejects tabs with UX001', () => {
  const { diags } = lex('screen A\n\tintent "x"\n', 'a.ux');
  assert.equal(diags[0].code, 'UX001');
  assert.equal(diags[0].line, 2);
  assert.match(diags[0].fix, /two spaces/);
});

test('lex rejects odd indentation with UX002', () => {
  const { diags } = lex('screen A\n   intent "x"\n', 'a.ux');
  assert.equal(diags[0].code, 'UX002');
});

test('treeify nests by depth', () => {
  const { lines } = lex('screen A\n  list Task\n    row title\n  action "x"\n', 'a.ux');
  const root = treeify(lines);
  assert.equal(root.children.length, 1);
  const screen = root.children[0];
  assert.deepEqual(screen.children.map(c => c.text), ['list Task', 'action "x"']);
  assert.deepEqual(screen.children[0].children.map(c => c.text), ['row title']);
});

test('lex rejects over-indentation with UX003', () => {
  const { diags } = lex('screen A\n    intent "x"\n', 'a.ux');
  assert.equal(diags[0].code, 'UX003');
  assert.equal(diags[0].line, 2);
});

test('lex allows normal one-level increase', () => {
  const { diags } = lex('screen A\n  intent "x"\n', 'a.ux');
  assert.equal(diags.length, 0);
});

test('lex allows dedenting by more than one level', () => {
  const { diags } = lex('screen A\n  list B\n    item C\naction D\n', 'a.ux');
  assert.equal(diags.length, 0);
});
