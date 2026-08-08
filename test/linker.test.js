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

// --- Fix round 1: flows in the navigation graph ---

test('a screen whose only action targets a flow ending in `go Other` produces an edge, and neither screen is flagged UX201/UX202', () => {
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Done" -> completeTask\n';
  const other = 'screen Other\n  intent "x"\n  action "Back" -> Home\n';
  const flow = 'flow completeTask\n  go Other\n';

  const { diags, edges } = linkSources(home, other, flow);

  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'Other' && e.via === 'flow completeTask'));
  assert.ok(!diags.some(d => d.code === 'UX201' || d.code === 'UX202'));
});

test('a flow with a `go` inside a call\'s ok branch also produces its edge', () => {
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Save" -> saveFlow\n';
  const other = 'screen Other\n  intent "x"\n  action "Back" -> Home\n';
  const flow = [
    'flow saveFlow',
    '  call api.save(task)',
    '    ok -> go Other',
    '    fail -> error "Could not save."',
  ].join('\n');

  const { diags, edges } = linkSources(home, other, flow);

  assert.ok(edges.some(e => e.from === 'Home' && e.to === 'Other' && e.via === 'flow saveFlow'));
  assert.ok(!diags.some(d => d.code === 'UX201' || d.code === 'UX202'));
});

test('a flow with no `go` at all contributes no edges, so a screen invoking it alone is still UX202', () => {
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Noop" -> noopFlow\n';
  const flow = 'flow noopFlow\n  toast "Done"\n';

  const { diags } = linkSources(home, flow);

  assert.ok(diags.some(d => d.code === 'UX202' && d.message.includes('Home')));
});

test('`flow X` containing `go Nowhere` emits UX200', () => {
  const flow = 'flow X\n  go Nowhere\n';

  const { diags } = linkSources(flow);

  assert.ok(diags.some(d => d.code === 'UX200' && d.message.includes('Nowhere')));
});

test('the same screen name declared in two files emits UX205', () => {
  const dupA = 'screen Dup\n  at /\n  intent "x"\n  action "Go" -> Dup\n';
  const dupB = 'screen Dup\n  intent "x"\n  action "Go" -> Dup\n';

  const { diags } = linkSources(dupA, dupB);

  assert.ok(diags.some(d => d.code === 'UX205'));
});

test('a component containing `use Missing` emits UX204', () => {
  const comp = 'component Card(task)\n  use Missing(task)\n';

  const { diags } = linkSources(comp);

  assert.ok(diags.some(d => d.code === 'UX204' && d.message.includes('Missing')));
});

test('a screen whose only edge is a self-loop is flagged UX202', () => {
  const src = 'screen Loop\n  at /\n  intent "x"\n  action "Refresh" -> Loop\n';

  const { diags } = linkSources(src);

  assert.ok(diags.some(d => d.code === 'UX202' && d.message.includes('Loop')));
});

test('regression: valid project mixing screen targets and flow targets yields an empty diagnostics array', () => {
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Done" -> completeTask\n';
  const other = 'screen Other\n  intent "x"\n  action "Back" -> Home\n';
  const flow = 'flow completeTask\n  go Other\n';

  const { diags } = linkSources(home, other, flow);

  assert.deepEqual(diags, []);
});

test('regression: UX205 does not fire for a single file declaring one screen, one flow, and one component with distinct names', () => {
  const src = [
    'screen Home',
    '  at /',
    '  intent "x"',
    '  use Card(task)',
    '  action "Go" -> Other',
    'screen Other',
    '  intent "x"',
    '  action "Back" -> Home',
    'component Card(task)',
    '  text "hi"',
    'flow doThing',
    '  go Home',
  ].join('\n');

  const { diags } = linkSources(src);

  assert.ok(!diags.some(d => d.code === 'UX205'));
});
