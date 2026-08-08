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
