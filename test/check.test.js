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

test('a form repeating a field name reports UX108', () => {
  const src = [
    'data Expense', '  amount money', '  note text',
    'screen A', '  intent "x"',
    '  form Expense',
    '    amount required',
    '    amount required',
    '    submit "Save" -> A',
  ].join('\n');
  const found = codes(src);
  assert.ok(found.includes('UX108'));
});

test('the UX108 fix names the fields already listed', () => {
  const src = [
    'data Expense', '  amount money', '  note text',
    'screen A', '  intent "x"',
    '  form Expense',
    '    amount required',
    '    amount required',
    '    submit "Save" -> A',
  ].join('\n');
  const { ast } = parse(src, 'a.ux');
  const dup = check(ast).find(d => d.code === 'UX108');
  assert.match(dup.fix, /amount/);
});

test('a form listing each field once emits no UX108 — the regression that matters most', () => {
  const src = [
    'data Expense', '  amount money', '  note text',
    'screen A', '  intent "x"',
    '  form Expense',
    '    amount required',
    '    note',
    '    submit "Save" -> A',
  ].join('\n');
  assert.ok(!codes(src).includes('UX108'));
});

// --- UX109: an `action` with no target renders but does nothing ---

test('a bare `action` with nothing after it reports UX109', () => {
  assert.ok(codes('screen A\n  intent "x"\n  action\n').includes('UX109'));
});

test('`action ""` (empty label, no target) reports UX109', () => {
  assert.ok(codes('screen A\n  intent "x"\n  action ""\n').includes('UX109'));
});

test('`action "Just a label"` with no `->` target reports UX109', () => {
  assert.ok(codes('screen A\n  intent "x"\n  action "Just a label with no target"\n').includes('UX109'));
});

test('`action "Save" ->` with a dangling arrow and no target reports UX109', () => {
  assert.ok(codes('screen A\n  intent "x"\n  action "Save" ->\n').includes('UX109'));
});

test('a bare-verb action with a target but no label is legal — no UX109', () => {
  assert.ok(!codes('screen A\n  intent "x"\n  action star\n').includes('UX109'));
});

test('a labeled action with a real target is legal — no UX109', () => {
  assert.ok(!codes('screen A\n  intent "x"\n  action "New task" -> NewTask\n').includes('UX109'));
});

test('the UX109 fix shows both valid shapes', () => {
  const { ast } = parse('screen A\n  intent "x"\n  action\n', 'a.ux');
  const found = check(ast).find(d => d.code === 'UX109');
  assert.match(found.fix, /action "Label" -> ScreenName/);
  assert.match(found.fix, /action flowName/);
});

// --- UX110: a `form` with no data name ---

test('a bare `form` with no data name reports UX110', () => {
  assert.ok(codes('screen A\n  intent "x"\n  form\n    submit "Save" -> A\n').includes('UX110'));
});

test('a `form DataName` with a real data name reports no UX110', () => {
  const src = 'data Task\n  title text\nscreen A\n  intent "x"\n  form Task\n    title\n    submit "Save" -> A\n';
  assert.ok(!codes(src).includes('UX110'));
});

test('the UX110 fix is a pasteable line', () => {
  const { ast } = parse('screen A\n  intent "x"\n  form\n    submit "Save" -> A\n', 'a.ux');
  const found = check(ast).find(d => d.code === 'UX110');
  assert.equal(found.fix, 'form DataName');
});

test('a form nested inside a group still gets its fields checked for UX108', () => {
  const src = [
    'data Expense', '  amount money',
    'screen A', '  intent "x"',
    '  group "Section"',
    '    form Expense',
    '      amount required',
    '      amount required',
    '      submit "Save" -> A',
  ].join('\n');
  assert.ok(codes(src).includes('UX108'));
});

test('a form submit with no target is reported the way a targetless action is', () => {
  const source = 'screen Home\n  intent "Land"\n  form Task\n    title\n    submit "Save"\n';
  const diags = check(parse(source, 'a.ux').ast);
  assert.equal(diags.filter(d => d.code === 'UX114').length, 1);
});

test('a form submit with a target is not reported', () => {
  const source = 'screen Home\n  intent "Land"\n  form Task\n    title\n    submit "Save" -> Done\n';
  assert.deepEqual(check(parse(source, 'a.ux').ast).filter(d => d.code === 'UX114'), []);
});
