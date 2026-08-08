import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { check } from '../src/check.js';

function codes(src) {
  const { ast } = parse(src, 'a.ux');
  return check(ast).map(d => d.code);
}

test('screen without intent reports UX100', () => {
  assert.ok(codes('screen A\n  text "x"\n').includes('UX100'));
});

test('list missing all three states reports UX102, UX103, UX104', () => {
  const found = codes('data Task\n  title text\nscreen A\n  intent "x"\n  list Task\n    row title\n');
  assert.ok(found.includes('UX102'));
  assert.ok(found.includes('UX103'));
  assert.ok(found.includes('UX104'));
});

test('the UX102 fix text is copy-pasteable', () => {
  const { ast } = parse('data Task\n  title text\nscreen A\n  intent "x"\n  list Task\n    row title\n', 'a.ux');
  const empty = check(ast).find(d => d.code === 'UX102');
  assert.match(empty.fix, /^empty "/);
});

test('complete list produces no state errors', () => {
  const src = [
    'data Task', '  title text',
    'screen A', '  intent "x"',
    '  list Task', '    row title',
    '    empty "None."', '    loading skeleton 3 rows', '    error "Failed."',
  ].join('\n');
  assert.deepEqual(codes(src), []);
});

test('duplicate declaration reports UX107', () => {
  assert.ok(codes('data Task\n  title text\ndata Task\n  title text\n').includes('UX107'));
});

test('list nested inside a group and inside an if branch still reports missing states', () => {
  const src = [
    'data Task', '  title text',
    'screen A', '  intent "x"',
    '  group "Section"',
    '    list Task', '      row title',
    '  if user.admin',
    '    list Task', '      row title',
    '  else',
    '    text "no"',
  ].join('\n');
  const found = codes(src);
  const count = found.filter(c => c === 'UX102').length;
  assert.equal(count, 2);
  assert.equal(found.filter(c => c === 'UX103').length, 2);
  assert.equal(found.filter(c => c === 'UX104').length, 2);
});

test('list inside a component body missing states reports UX102, UX103, UX104', () => {
  const src = 'data Task\n  title text\ncomponent TaskList(task)\n  list Task\n    row title\n';
  const found = codes(src);
  assert.ok(found.includes('UX102'));
  assert.ok(found.includes('UX103'));
  assert.ok(found.includes('UX104'));
});

test('a fully valid file produces no diagnostics at all', () => {
  const src = [
    'data Task', '  title text',
    'screen A', '  intent "x"',
    '  list Task', '    row title',
    '    empty "None."', '    loading skeleton 3 rows', '    error "Failed."',
    'screen B', '  intent "y"',
    '  group "Section"',
    '    list Task', '      row title',
    '      empty "None."', '      loading skeleton 3 rows', '      error "Failed."',
  ].join('\n');
  assert.deepEqual(codes(src), []);
});

test('data and screen sharing a name in one file reports UX107', () => {
  const src = 'data Task\n  title text\nscreen Task\n  intent "x"\n  text "hi"\n';
  assert.ok(codes(src).includes('UX107'));
});
