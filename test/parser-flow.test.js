import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';

test('parses flow name, params, and simple steps', () => {
  const src = [
    'flow complete(task)',
    '  set task.done = true',
    '  toast "Done" undo 5s',
    '  go Inbox',
  ].join('\n');
  const { ast, diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 0);
  const flow = ast.decls[0];
  assert.equal(flow.kind, 'Flow');
  assert.equal(flow.name, 'complete');
  assert.deepEqual(flow.params, ['task']);
  assert.deepEqual(flow.steps[0], { kind: 'Set', target: 'task.done', value: 'true', line: 2 });
  assert.equal(flow.steps[1].kind, 'Toast');
  assert.equal(flow.steps[1].undo, '5s');
  assert.deepEqual(flow.steps[2].target, { name: 'Inbox', args: [] });
});

test('parses call with ok and fail branches', () => {
  const src = [
    'flow complete(task)',
    '  call api.complete(task)',
    '    ok -> toast "Done"',
    '    fail -> error "Could not complete it."',
  ].join('\n');
  const { ast } = parse(src, 'a.ux');
  const call = ast.decls[0].steps[0];
  assert.equal(call.kind, 'Call');
  assert.equal(call.name, 'api.complete');
  assert.deepEqual(call.args, ['task']);
  assert.equal(call.ok[0].kind, 'Toast');
  assert.equal(call.fail[0].kind, 'ErrorStep');
});

test('parses a component with params', () => {
  const { ast } = parse('component TaskRow(task)\n  text "hi"\n', 'a.ux');
  const component = ast.decls[0];
  assert.equal(component.kind, 'Component');
  assert.deepEqual(component.params, ['task']);
  assert.equal(component.body[0].kind, 'Text');
});

test('unknown flow step reports UX016', () => {
  const { diags } = parse('flow x()\n  teleport home\n', 'a.ux');
  assert.equal(diags[0].code, 'UX016');
});

test('component with if/else folds else branch via parseBody, no diagnostics', () => {
  const src = [
    'component TaskRow(task)',
    '  if task.done',
    '    text "done"',
    '  else',
    '    text "not done"',
  ].join('\n');
  const { ast, diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 0);
  const component = ast.decls[0];
  assert.equal(component.kind, 'Component');
  const ifElement = component.body[0];
  assert.equal(ifElement.kind, 'If');
  assert.equal(ifElement.otherwise.length, 1);
  assert.equal(ifElement.otherwise[0].kind, 'Text');
  assert.equal(ifElement.otherwise[0].text, 'not done');
});

test('flow step keyword that merely starts with a valid keyword is reported as UX016, not treated as a prefix match', () => {
  const { diags } = parse('flow x()\n  setting x = 1\n', 'a.ux');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'UX016');
});

// --- Fix round 1 ---

test('a branch step with its own nested branches reports UX018 against the branch line, and recovers', () => {
  const src = [
    'flow x()',
    '  call api.outer()',
    '    ok -> call api.inner()',
    '      ok -> toast "Nested done"',
    '      fail -> error "Nested failed"',
  ].join('\n');
  const { ast, diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'UX018');
  assert.equal(diags[0].line, 3);

  const call = ast.decls[0].steps[0];
  assert.equal(call.kind, 'Call');
  assert.equal(call.ok[0].kind, 'Call');
  assert.equal(call.ok[0].name, 'api.inner');
  assert.deepEqual(call.ok[0].ok, []);
  assert.deepEqual(call.ok[0].fail, []);
});

test('`set x == true` reports UX017 instead of silently mis-parsing', () => {
  const { diags } = parse('flow x()\n  set task.done == true\n', 'a.ux');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'UX017');
});

test('a bare `ok` line with no arrow reports UX019', () => {
  const src = [
    'flow x()',
    '  call api.foo()',
    '    ok',
  ].join('\n');
  const { diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'UX019');
  assert.equal(diags[0].line, 3);
});

test('regression: a normal one-level call with ok/fail branches still parses with no diagnostics', () => {
  const src = [
    'flow complete(task)',
    '  call api.complete(task)',
    '    ok -> toast "Done"',
    '    fail -> error "Could not complete it."',
  ].join('\n');
  const { ast, diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 0);
  const call = ast.decls[0].steps[0];
  assert.equal(call.ok[0].kind, 'Toast');
  assert.equal(call.fail[0].kind, 'ErrorStep');
});

test('regression: `set task.done = true` still yields value "true" with no diagnostic', () => {
  const { ast, diags } = parse('flow x()\n  set task.done = true\n', 'a.ux');
  assert.equal(diags.length, 0);
  assert.deepEqual(ast.decls[0].steps[0], { kind: 'Set', target: 'task.done', value: 'true', line: 2 });
});

test('regression: a call with no branches at all yields empty ok/fail with no diagnostic', () => {
  const { ast, diags } = parse('flow x()\n  call api.foo()\n', 'a.ux');
  assert.equal(diags.length, 0);
  const call = ast.decls[0].steps[0];
  assert.deepEqual(call.ok, []);
  assert.deepEqual(call.fail, []);
});

// ---- audit regressions -----------------------------------------------------

test('a misspelled call branch reports UX024 instead of being dropped', () => {
  const source = 'flow saveThing\n  call api.save\n    ok -> go Other\n    faild -> go Nowhere\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX024').length, 1);
  assert.match(diags.find(d => d.code === 'UX024').message, /faild/);
});

test('UX024 suggests the branch keyword the author meant', () => {
  const { diags } = parse('flow f\n  call api.save\n    fial -> go Home\n', 'a.ux');
  assert.match(diags.find(d => d.code === 'UX024').fix, /fail/);
});

test('well-formed ok and fail branches stay silent', () => {
  const source = 'flow saveThing\n  call api.save\n    ok -> go Other\n    fail -> toast "No"\n';
  const { diags } = parse(source, 'a.ux');
  assert.deepEqual(diags.filter(d => d.code === 'UX024'), []);
});

test('a `go` target that cannot be parsed reports UX023', () => {
  const { diags } = parse('flow f\n  go some-screen\n', 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX023').length, 1);
});

test('a well-formed `go` stays silent', () => {
  const { diags } = parse('flow f\n  go Home\n', 'a.ux');
  assert.deepEqual(diags.filter(d => d.code === 'UX023'), []);
});
