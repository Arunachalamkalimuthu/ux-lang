import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { link } from '../src/linker.js';

function linkSources(...sources) {
  const programs = sources.map((src, i) => parse(src, `f${i}.ux`).ast);
  return link(programs);
}

const INBOX = [
  'screen Inbox', '  at /', '  intent "x"',
  '  action "Open" -> Detail(task)',
].join('\n');

const DETAIL = [
  'screen Detail(task)', '  intent "x"',
  '  action "Back" -> Inbox',
].join('\n');

test('resolves a link across files', () => {
  const { diags, edges } = linkSources(INBOX, DETAIL);
  assert.deepEqual(diags, []);
  assert.ok(edges.some(e => e.from === 'Inbox' && e.to === 'Detail'));
});

test('dead link reports UX200', () => {
  const { diags } = linkSources('screen A\n  at /\n  intent "x"\n  action "Go" -> Checkout\n');
  const dead = diags.find(d => d.code === 'UX200');
  assert.match(dead.message, /Checkout/);
});

test('unreachable screen reports UX201', () => {
  const orphan = 'screen Orphan\n  intent "x"\n  action "Back" -> Inbox\n';
  const { diags } = linkSources(INBOX, DETAIL, orphan);
  assert.ok(diags.some(d => d.code === 'UX201' && d.message.includes('Orphan')));
});

test('dead-end screen reports UX202', () => {
  const stuck = 'screen Stuck\n  intent "x"\n  text "you are here"\n';
  const entry = 'screen Home\n  at /\n  intent "x"\n  action "Go" -> Stuck\n';
  const { diags } = linkSources(entry, stuck);
  assert.ok(diags.some(d => d.code === 'UX202' && d.message.includes('Stuck')));
});

test('argument arity mismatch reports UX203', () => {
  const entry = 'screen Home\n  at /\n  intent "x"\n  action "Go" -> Detail\n';
  const { diags } = linkSources(entry, DETAIL);
  assert.ok(diags.some(d => d.code === 'UX203'));
});

test('unknown component reports UX204', () => {
  const src = 'screen Home\n  at /\n  intent "x"\n  use TaskRow(task)\n  action "x" -> Home\n';
  const { diags } = linkSources(src);
  assert.ok(diags.some(d => d.code === 'UX204'));
});

// --- Additional tests beyond the brief ---

test('navigation targets nested in group and if branches produce edges', () => {
  const entry = [
    'screen Home',
    '  at /',
    '  intent "x"',
    '  group "Section"',
    '    action "ToGroupTarget" -> GroupTarget',
    '  if condition',
    '    action "ToIfTarget" -> IfTarget',
    '  else',
    '    action "ToElseTarget" -> ElseTarget',
  ].join('\n');
  const groupTarget = 'screen GroupTarget\n  intent "x"\n  action "Back" -> Home\n';
  const ifTarget = 'screen IfTarget\n  intent "x"\n  action "Back" -> Home\n';
  const elseTarget = 'screen ElseTarget\n  intent "x"\n  action "Back" -> Home\n';

  const { diags, edges } = linkSources(entry, groupTarget, ifTarget, elseTarget);

  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'GroupTarget'));
  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'IfTarget'));
  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'ElseTarget'));
  assert.ok(!diags.some(d => d.code === 'UX201'));
});

test('a target reached only via a list empty-state action is an edge and reachable', () => {
  const entry = [
    'screen Home',
    '  at /',
    '  intent "x"',
    '  list Task',
    '    empty "None" action "Create" -> CreateTask',
  ].join('\n');
  const createTask = 'screen CreateTask\n  intent "x"\n  action "Back" -> Home\n';

  const { diags, edges } = linkSources(entry, createTask);

  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'CreateTask' && e.via === 'state'));
  assert.ok(!diags.some(d => d.code === 'UX201' && d.message.includes('CreateTask')));
});

test('a two-screen cycle with no `at /` still resolves an entry and terminates', () => {
  const a = 'screen A\n  intent "x"\n  action "ToB" -> B\n';
  const b = 'screen B\n  intent "x"\n  action "ToA" -> A\n';

  const { entry } = linkSources(a, b);

  assert.ok(entry === 'A' || entry === 'B');
});

test('a small valid project produces an empty diagnostics array', () => {
  const { diags } = linkSources(INBOX, DETAIL);
  assert.deepEqual(diags, []);
});
