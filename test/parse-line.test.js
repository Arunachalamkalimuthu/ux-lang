import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitArrow, parseTarget, parseString, words } from '../src/parse-line.js';

test('splitArrow separates label from target', () => {
  assert.deepEqual(splitArrow('action "New" -> NewTask'),
    { left: 'action "New"', right: 'NewTask' });
});

test('splitArrow returns null right when no arrow', () => {
  assert.deepEqual(splitArrow('row title, due'), { left: 'row title, due', right: null });
});

test('splitArrow ignores arrows inside strings', () => {
  assert.deepEqual(splitArrow('text "a -> b"'), { left: 'text "a -> b"', right: null });
});

test('parseTarget reads name and args', () => {
  assert.deepEqual(parseTarget('Detail(task)'), { name: 'Detail', args: ['task'] });
  assert.deepEqual(parseTarget('Issues(owner, repo)'), { name: 'Issues', args: ['owner', 'repo'] });
  assert.deepEqual(parseTarget('NewTask'), { name: 'NewTask', args: [] });
});

test('parseTarget returns null for junk', () => {
  assert.equal(parseTarget(''), null);
  assert.equal(parseTarget('"quoted"'), null);
});

test('parseString pulls a leading quoted string', () => {
  assert.deepEqual(parseString('"All clear."  action retry'),
    { value: 'All clear.', rest: 'action retry' });
  assert.equal(parseString('no quote here'), null);
});

test('words splits on whitespace', () => {
  assert.deepEqual(words('  title   text  required '), ['title', 'text', 'required']);
});
