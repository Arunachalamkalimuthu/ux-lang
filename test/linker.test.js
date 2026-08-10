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
  const { diags, edges } = linkSources(INBOX, DETAIL, 'app Demo\n');
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
  const { diags } = linkSources(INBOX, DETAIL, 'app Demo\n');
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

// --- UX206: a form's fields resolve against its declared data type ---

test('a form listing a field its data type does not declare emits UX206 naming available fields', () => {
  const data = 'data Task\n  title text\n  due date\n';
  const src = [
    'screen New', '  at /', '  intent "x"',
    '  form Task',
    '    description text',
    '    submit "Create" -> Home',
    'screen Home', '  intent "x"',
    '  action "Back" -> New',
  ].join('\n');

  const { diags } = linkSources(data, src);
  const found = diags.find(d => d.code === 'UX206');
  assert.ok(found, 'expected a UX206 diagnostic');
  assert.match(found.message, /description/);
  assert.match(found.fix, /title/);
  assert.match(found.fix, /due/);
});

test('a form listing a field with an obvious typo suggests the real name', () => {
  const data = 'data Task\n  title text\n';
  const src = [
    'screen New', '  at /', '  intent "x"',
    '  form Task',
    '    titel text',
    '    submit "Create" -> Home',
    'screen Home', '  intent "x"',
    '  action "Back" -> New',
  ].join('\n');

  const { diags } = linkSources(data, src);
  const found = diags.find(d => d.code === 'UX206');
  assert.ok(found);
  assert.match(found.fix, /did you mean `title`/);
});

test('a form listing only real fields emits nothing — the regression that matters most', () => {
  const data = 'data Task\n  title text\n  due date\n';
  const src = [
    'screen New', '  at /', '  intent "x"',
    '  form Task',
    '    title required',
    '    due',
    '    submit "Create" -> Home',
    'screen Home', '  intent "x"',
    '  action "Back" -> New',
  ].join('\n');

  const { diags } = linkSources(data, src);
  assert.ok(!diags.some(d => d.code === 'UX206'));
});

test('a form whose data type is undeclared reports UX106, not UX206', () => {
  const src = [
    'screen New', '  at /', '  intent "x"',
    '  form Ghost',
    '    title text',
    '    submit "Create" -> Home',
    'screen Home', '  intent "x"',
    '  action "Back" -> New',
  ].join('\n');

  const { diags } = linkSources(src);
  assert.ok(diags.some(d => d.code === 'UX106' && d.message.includes('Ghost')));
  assert.ok(!diags.some(d => d.code === 'UX206'));
});

test('a form nested inside group/if still gets its fields checked', () => {
  const data = 'data Task\n  title text\n';
  const src = [
    'screen New', '  at /', '  intent "x"',
    '  if editing',
    '    form Task',
    '      bogus text',
    '      submit "Create" -> Home',
    'screen Home', '  intent "x"',
    '  action "Back" -> New',
  ].join('\n');

  const { diags } = linkSources(data, src);
  assert.ok(diags.some(d => d.code === 'UX206' && d.message.includes('bogus')));
});

test('regression: valid project mixing screen targets and flow targets yields an empty diagnostics array', () => {
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Done" -> completeTask\n';
  const other = 'screen Other\n  intent "x"\n  action "Back" -> Home\n';
  const flow = 'flow completeTask\n  go Other\n';

  const { diags } = linkSources(home, other, flow, 'app Demo\n');

  assert.deepEqual(diags, []);
});

// --- UX106: list names a declared data type (moved from check.js — this is a
// cross-file fact, not a single-file one; see linker.js#link) ---

test('a list naming an undeclared data type reports UX106', () => {
  const src = 'screen A\n  at /\n  intent "x"\n  list Ghost\n    empty "n"\n    loading "l"\n    error "e"\n    action "Back" -> A\n';
  const { diags } = linkSources(src);
  assert.ok(diags.some(d => d.code === 'UX106' && d.message.includes('Ghost')));
});

test('a list whose data type is declared in a different file produces no diagnostics', () => {
  const data = 'data Task\n  title text\n';
  const inbox = [
    'screen Inbox', '  at /', '  intent "x"',
    '  list Task',
    '    empty "None."', '    loading skeleton 3 rows', '    error "Failed."',
    '  action "Next" -> Other',
  ].join('\n');
  const other = 'screen Other\n  intent "x"\n  action "Back" -> Inbox\n';

  const { diags } = linkSources(data, inbox, other, 'app Demo\n');

  assert.deepEqual(diags, []);
});

// --- UX105: a data field's type resolves against every declared data type
// (moved from check.js — a field's type can be a primitive, an inline enum,
// or a reference to another `data`, and that third case is a project-wide
// name lookup exactly like UX106's; see linker.js#checkFieldTypes) ---

test('a field naming an undeclared data type reports UX105', () => {
  const { diags } = linkSources('data Task\n  title bogus\n');
  assert.ok(diags.some(d => d.code === 'UX105' && d.message.includes('bogus')));
});

test('a field type declared in a different file produces no diagnostics', () => {
  const user = 'data User\n  name text\n';
  const task = 'data Task\n  owner User\n';

  const { diags } = linkSources(user, task, 'app Demo\n');

  assert.deepEqual(diags, []);
});

test('a bare "status enum" field with no values reports UX105', () => {
  const { diags } = linkSources('data Task\n  status enum\n');
  assert.ok(diags.some(d => d.code === 'UX105'));
});

test('the UX105 fix text mentions the "one of" enum form', () => {
  const { diags } = linkSources('data Task\n  status enum\n');
  const found = diags.find(d => d.code === 'UX105');
  assert.match(found.fix, /one of/);
});

test('a genuine enum field with values produces no diagnostics', () => {
  const { diags } = linkSources('data Task\n  status one of draft | live = draft\n', 'app Demo\n');
  assert.deepEqual(diags, []);
});

// --- `retry` is a built-in action, not a navigation target ---

test('`action retry` inside a list\'s error state reports no UX200', () => {
  const src = [
    'screen A', '  at /', '  intent "x"',
    '  list Task',
    '    empty "None."', '    loading skeleton 3 rows',
    '    error "Failed." action retry',
    '  action "Next" -> B',
    'screen B', '  intent "x"',
    '  action "Back" -> A',
  ].join('\n');

  const { diags } = linkSources(src);

  assert.ok(!diags.some(d => d.code === 'UX200'));
});

test('a screen whose only action is `retry` is still flagged UX202 — retry is not a way out', () => {
  const src = [
    'screen A', '  at /', '  intent "x"',
    '  list Task',
    '    empty "None."', '    loading skeleton 3 rows',
    '    error "Failed." action retry',
  ].join('\n');

  const { diags } = linkSources(src);

  assert.ok(diags.some(d => d.code === 'UX202' && d.message.includes('A')));
});

// --- UX200/UX203 report the offending element's own line, not the screen's ---

test('UX200 reports the action\'s own line, not the screen\'s declaration line', () => {
  const src = [
    'screen Home',
    '  at /',
    '  intent "x"',
    '  text "padding"',
    '  text "padding"',
    '  action "Go" -> Nowhere',
  ].join('\n');
  const { diags } = linkSources(src);
  const dead = diags.find(d => d.code === 'UX200');
  assert.ok(dead);
  assert.equal(dead.line, 6);
});

test('UX203 reports the action\'s own line, not the screen\'s declaration line', () => {
  const entry = [
    'screen Home',
    '  at /',
    '  intent "x"',
    '  text "padding"',
    '  action "Go" -> Detail',
  ].join('\n');
  const { diags } = linkSources(entry, DETAIL);
  const found = diags.find(d => d.code === 'UX203');
  assert.ok(found);
  assert.equal(found.line, 5);
});

// --- UX205 is a cross-file concern only; same-file duplicates are UX107's job ---

test('two same-named screens in one file do not emit UX205', () => {
  const src = [
    'screen Dup', '  at /', '  intent "x"', '  action "Go" -> Dup',
    'screen Dup', '  intent "y"', '  action "Back" -> Dup',
  ].join('\n');
  const { diags } = linkSources(src);
  assert.ok(!diags.some(d => d.code === 'UX205'));
});

// --- UX111: exactly one `app`/`site` root, project-wide ---

test('a project with no `app` or `site` anywhere reports UX111', () => {
  const { diags } = linkSources(INBOX, DETAIL);
  assert.ok(diags.some(d => d.code === 'UX111'));
});

test('a project with exactly one `app` reports no UX111', () => {
  const withRoot = 'app Demo\n' + INBOX;
  const { diags } = linkSources(withRoot, DETAIL);
  assert.ok(!diags.some(d => d.code === 'UX111'));
});

test('a project declaring both `app` and `site` reports UX111', () => {
  const appFile = 'app Demo\n' + INBOX;
  const siteFile = 'site example.com\n' + DETAIL;
  const { diags } = linkSources(appFile, siteFile);
  assert.ok(diags.some(d => d.code === 'UX111'));
});

test('a project declaring two `app` roots reports UX111', () => {
  const first = 'app One\n' + INBOX;
  const second = 'app Two\n' + DETAIL;
  const { diags } = linkSources(first, second);
  assert.ok(diags.some(d => d.code === 'UX111'));
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

// ---- audit regressions -----------------------------------------------------

const APP = 'app Demo\n';
const graphOf = files => linkSources(...files);
const diagsOf = files => graphOf(files).diags;

test('a dangling link inside a component is reported', () => {
  const files = [
    APP + 'component Nav\n  action "Broken" -> Nowhere\n',
    'screen Home\n  at /\n  intent "Land"\n  use Nav\n  action "Go" -> Other\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  const diags = diagsOf(files);
  assert.equal(diags.filter(d => d.code === 'UX200').length, 1);
  assert.match(diags.find(d => d.code === 'UX200').message, /Nowhere/);
});

test('a screen whose only way out is inside a used component is not a dead end', () => {
  const files = [
    APP + 'component Nav\n  action "Home" -> Home\n  action "Settings" -> Settings\n',
    'screen Home\n  at /\n  intent "Land"\n  use Nav\n  text "hi"\n',
    'screen Settings\n  intent "Settings"\n  use Nav\n  text "s"\n',
  ];
  assert.deepEqual(diagsOf(files), []);
});

test('component navigation appears in the flow graph', () => {
  const files = [
    APP + 'component Nav\n  action "Settings" -> Settings\n',
    'screen Home\n  at /\n  intent "Land"\n  use Nav\n  text "hi"\n',
    'screen Settings\n  intent "Settings"\n  action "Back" -> Home\n',
  ];
  const linked = graphOf(files);
  assert.ok(linked.edges.some(e => e.from === 'Home' && e.to === 'Settings'),
    'the Home -> Settings edge the component supplies is missing from the graph');
});

test('a component that uses another component inherits its navigation without looping', () => {
  const files = [
    APP + 'component Inner\n  action "Settings" -> Settings\n',
    'component Outer\n  use Inner\n  use Outer\n',
    'screen Home\n  at /\n  intent "Land"\n  use Outer\n  text "hi"\n',
    'screen Settings\n  intent "Settings"\n  action "Back" -> Home\n',
  ];
  const linked = graphOf(files);
  assert.ok(linked.edges.some(e => e.from === 'Home' && e.to === 'Settings'));
});

test('a list row naming a field its data type does not declare is reported', () => {
  const files = [
    APP + 'data Task\n  title text required\n',
    'screen Home\n  at /\n  intent "Land"\n  list Task\n    row titel\n  action "Go" -> Other\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  const diags = diagsOf(files);
  const found = diags.filter(d => d.code === 'UX206');
  assert.equal(found.length, 1);
  assert.match(found[0].fix, /title/);
});

test('a list sort key naming an unknown field is reported, and a direction is not a field', () => {
  const base = APP + 'data Task\n  title text required\n  due date\n';
  const screens = key => [
    base,
    `screen Home\n  at /\n  intent "Land"\n  list Task\n    sort by ${key}\n  action "Go" -> Other\n`,
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  assert.equal(diagsOf(screens('nope')).filter(d => d.code === 'UX206').length, 1);
  assert.deepEqual(diagsOf(screens('due desc')).filter(d => d.code === 'UX206'), []);
});

test('a dotted row path is left alone', () => {
  const files = [
    APP + 'data Task\n  title text required\n',
    'screen Home\n  at /\n  intent "Land"\n  list Task\n    row task.owner.name\n  action "Go" -> Other\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  assert.deepEqual(diagsOf(files).filter(d => d.code === 'UX206'), []);
});

test('a list with no data name is reported the way a form with no data name is', () => {
  const files = [
    APP,
    'screen Home\n  at /\n  intent "Land"\n  list\n    row title\n  action "Go" -> Other\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  assert.equal(diagsOf(files).filter(d => d.code === 'UX112').length, 1);
});

test('argument arity is checked when a target resolves to a flow', () => {
  const files = [
    APP + 'flow archive(task)\n  go Other\n',
    'screen Home\n  at /\n  intent "Land"\n  action "Archive" -> archive\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  const found = diagsOf(files).filter(d => d.code === 'UX203');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /expects 1 argument/);
});

test('a data name declared in two files is reported as a cross-file duplicate', () => {
  const files = [
    APP + 'data Task\n  title text required\n',
    'data Task\n  name text required\n',
    'screen Home\n  at /\n  intent "Land"\n  list Task\n    row title\n  action "Go" -> Other\n',
    'screen Other\n  intent "Other"\n  action "Back" -> Home\n',
  ];
  assert.equal(diagsOf(files).filter(d => d.code === 'UX205').length, 1);
});

test('two screens claiming the same route are reported', () => {
  const files = [
    APP,
    'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> Other\n',
    'screen Other\n  at /\n  intent "Somewhere else"\n  action "Back" -> Home\n',
  ];
  const found = diagsOf(files).filter(d => d.code === 'UX113');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /\//);
});

test('screens with distinct routes, or none, are not reported', () => {
  const files = [
    APP,
    'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> Other\n',
    'screen Other\n  at /other\n  intent "Somewhere else"\n  action "Back" -> Home\n',
  ];
  assert.deepEqual(diagsOf(files).filter(d => d.code === 'UX113'), []);
});

test('a `use` that passes the wrong number of arguments is reported', () => {
  const files = [
    APP + 'component Card(x)\n  text "card"\n',
    'screen Home\n  at /\n  intent "Land here"\n  use Card(a, b, c)\n  action "Go" -> Other\n',
    'screen Other\n  intent "Somewhere else"\n  action "Back" -> Home\n',
  ];
  const found = diagsOf(files).filter(d => d.code === 'UX203');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /expects 1 argument/);
});

test('a `use` with matching arity is not reported', () => {
  const files = [
    APP + 'component Card(x)\n  text "card"\n',
    'screen Home\n  at /\n  intent "Land here"\n  use Card(task)\n  action "Go" -> Other\n',
    'screen Other\n  intent "Somewhere else"\n  action "Back" -> Home\n',
  ];
  assert.deepEqual(diagsOf(files).filter(d => d.code === 'UX203'), []);
});

test("a flow's `go` is arity-checked against the screen it lands on", () => {
  const files = [
    APP + 'flow open\n  go Detail(a, b, c)\n',
    'screen Home\n  at /\n  intent "Land here"\n  action "Open" -> open\n',
    'screen Detail(task)\n  intent "Read one thing"\n  action "Back" -> Home\n',
  ];
  const found = diagsOf(files).filter(d => d.code === 'UX203');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /expects 1 argument/);
});

test("a shadowed duplicate declaration's own link errors are still reported", () => {
  const files = [
    APP,
    'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> Other\n',
    'screen Other\n  intent "Somewhere else"\n  action "Back" -> Home\n',
    'screen Home\n  intent "A second Home"\n  action "Broken" -> NoSuchScreen\n  list Undeclared\n    row x\n    empty "e"\n    loading skeleton 1 rows\n    error "x"\n',
  ];
  const diags = diagsOf(files);
  assert.equal(diags.filter(d => d.code === 'UX205').length, 1, 'the duplicate itself is still reported');
  assert.equal(diags.filter(d => d.code === 'UX200').length, 1, 'the shadowed copy\'s dangling link is reported');
  assert.equal(diags.filter(d => d.code === 'UX106').length, 1, 'the shadowed copy\'s undeclared data type is reported');
});

test("a shadowed duplicate data declaration's own field errors are still reported", () => {
  const files = [
    APP + 'data Task\n  title text required\n',
    'data Task\n  title NotAType required\n',
    'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> Other\n',
    'screen Other\n  intent "Somewhere else"\n  action "Back" -> Home\n',
  ];
  const diags = diagsOf(files);
  assert.equal(diags.filter(d => d.code === 'UX205').length, 1);
  assert.equal(diags.filter(d => d.code === 'UX105').length, 1, "the shadowed copy's unknown field type is reported");
});
