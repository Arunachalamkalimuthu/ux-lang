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
