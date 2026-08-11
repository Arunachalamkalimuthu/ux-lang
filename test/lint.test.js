import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { lint } from '../src/lint.js';
import { applyIgnores } from '../src/ignore.js';
import { check } from '../src/check.js';
import { WARNING } from '../src/diagnostics.js';

const run = (...sources) => lint(sources.map((s, i) => parse(s, `f${i}.ux`).ast));
const codes = (...sources) => run(...sources).map(d => d.code);

const SCREEN = (name, body) => `screen ${name}\n  intent "Do the ${name} thing"\n${body}\n`;

test('every lint finding is a warning, never an error', () => {
  const found = run('data Ghost\n  name text\n');
  assert.ok(found.length > 0);
  for (const d of found) assert.equal(d.severity, WARNING);
});

test('UX300 flags a data type nothing uses', () => {
  assert.ok(codes('data Ghost\n  name text\n').includes('UX300'));
});

test('UX300 does not fire for a type used by a list, a form, or another type', () => {
  const listed = 'data Task\n  a text\n' + SCREEN('Inbox',
    '  list Task\n    row a\n    empty "n"\n    loading "l"\n    error "e"\n    tap -> Inbox');
  assert.ok(!codes(listed).includes('UX300'));

  const formed = 'data Task\n  a text\n' + SCREEN('New', '  form Task\n    a\n    submit "Go" -> save(t)');
  assert.ok(!codes(formed).includes('UX300'));

  // A type reached only through another type's field is still used.
  const nested = 'data User\n  name text\ndata Task\n  owner User\n' + SCREEN('Inbox',
    '  list Task\n    row owner\n    empty "n"\n    loading "l"\n    error "e"\n    tap -> Inbox');
  assert.ok(!codes(nested).includes('UX300'));
});

test('UX301 flags a flow nothing invokes, and spares one that is invoked', () => {
  assert.ok(codes('flow orphan(x)\n  go Home\n').includes('UX301'));
  const used = SCREEN('Home', '  action "Do it" -> doIt(x)') + 'flow doIt(x)\n  go Home\n';
  assert.ok(!codes(used).includes('UX301'));
});

test('UX301 counts an invocation from a list state or a form submit', () => {
  const fromState = 'data T\n  a text\n' + SCREEN('Inbox',
    '  list T\n    row a\n    tap -> Inbox\n    empty "n" action "Fix" -> repair(t)\n    loading "l"\n    error "e"')
    + 'flow repair(t)\n  go Inbox\n';
  assert.ok(!codes(fromState).includes('UX301'));
});

// The rule is about the cost of a separate file, not about reuse count — a
// component declared beside its only user costs a reader nothing.
test('UX302 flags a single-user component only when it lives in its own file', () => {
  const split = [
    'component Row(x)\n  show x.a\n',
    SCREEN('Home', '  use Row(item)\n  action "Go" -> Home'),
  ];
  assert.ok(codes(...split).includes('UX302'));

  const together = 'component Row(x)\n  show x.a\n' + SCREEN('Home', '  use Row(item)\n  action "Go" -> Home');
  assert.ok(!codes(together).includes('UX302'));
});

test('UX302 spares a component two screens use', () => {
  const shared = [
    'component Row(x)\n  show x.a\n',
    SCREEN('Home', '  use Row(item)\n  action "Go" -> Other'),
    SCREEN('Other', '  use Row(item)\n  action "Go" -> Home'),
  ];
  assert.ok(!codes(...shared).includes('UX302'));
});

test('UX303 flags an intent that only restates the screen name', () => {
  assert.ok(codes('screen Inbox\n  intent "inbox"\n  text "hi"\n').includes('UX303'));
  assert.ok(codes('screen Inbox\n  intent "TODO"\n  text "hi"\n').includes('UX303'));
});

test('UX303 flags two screens sharing one intent', () => {
  const twins = 'screen A\n  intent "Show the user their stuff"\n  text "x"\n' +
                'screen B\n  intent "Show the user their stuff"\n  text "x"\n';
  assert.ok(codes(twins).includes('UX303'));
});

test('UX304 flags casing and suggests the corrected name', () => {
  const found = run('data user_profile\n  Full_Name text\n' + 'flow Do_Thing(x)\n  go Home\n');
  const fixes = found.filter(d => d.code === 'UX304').map(d => d.fix);
  assert.ok(fixes.some(f => f.includes('UserProfile')), fixes.join(' | '));
  assert.ok(fixes.some(f => f.includes('fullName')), fixes.join(' | '));
  assert.ok(fixes.some(f => f.includes('doThing')), fixes.join(' | '));
});

test('UX305 flags a list nobody can act on, and spares one with a tap or a state action', () => {
  const inert = 'data T\n  a text\n' + SCREEN('Home',
    '  list T\n    row a\n    empty "n"\n    loading "l"\n    error "e"\n  action "Go" -> Home');
  assert.ok(codes(inert).includes('UX305'));

  const tappable = 'data T\n  a text\n' + SCREEN('Home',
    '  list T\n    row a\n    tap -> Home\n    empty "n"\n    loading "l"\n    error "e"');
  assert.ok(!codes(tappable).includes('UX305'));

  const actionable = 'data T\n  a text\n' + SCREEN('Home',
    '  list T\n    row a\n    empty "n" action "Add" -> Home\n    loading "l"\n    error "e"');
  assert.ok(!codes(actionable).includes('UX305'));
});

test('lint reaches elements nested inside group and if', () => {
  const nested = 'data T\n  a text\n' + SCREEN('Home',
    '  group "Section"\n    if cond\n      list T\n        row a\n        empty "n"\n        loading "l"\n        error "e"\n  action "Go" -> Home');
  assert.ok(codes(nested).includes('UX305'));
});

// The guard that matters most: a clean project must produce nothing at all,
// or the warnings become noise people mute.
test('a well-formed project produces no warnings', () => {
  const clean =
    'data Task\n  title text  required\n' +
    'screen Inbox\n  at /\n  intent "See what is due and clear it"\n' +
    '  list Task\n    row title\n    tap -> Detail(task)\n' +
    '    empty "All clear."\n    loading skeleton 3 rows\n    error "Could not load."\n' +
    '  action "New" -> newTask(task)\n' +
    'screen Detail(task)\n  intent "Read one task and finish it"\n  show task.title\n  action "Back" -> Inbox\n' +
    'flow newTask(task)\n  go Inbox\n';
  assert.deepEqual(run(clean), []);
});

test('UX305 does not repeat the `add:` prefix the renderer supplies', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task\n    row title\n';
  const warnings = lint([parse(source, 'a.ux').ast]);
  const inert = warnings.find(d => d.code === 'UX305');
  assert.doesNotMatch(inert.fix, /^add:/);
});

// ---- inline suppression ----------------------------------------------------

test('a trailing ux:ignore suppresses that warning on that line', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task   # ux:ignore UX305\n    row title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(lint([ast]), [ast]);
  assert.deepEqual(kept.filter(d => d.code === 'UX305'), []);
});

test('ux:ignore only suppresses the codes it names', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task   # ux:ignore UX300\n    row title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(lint([ast]), [ast]);
  assert.equal(kept.filter(d => d.code === 'UX305').length, 1);
});

test('ux:ignore accepts several codes', () => {
  const source = 'data Task\n  title text\n\nscreen Home\n  intent "Land"\n  list Task   # ux:ignore UX300, UX305\n    row title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(lint([ast]), [ast]);
  assert.deepEqual(kept.filter(d => d.code === 'UX305'), []);
});

test('ux:ignore refuses to suppress an error and says so', () => {
  const source = 'screen Home\n  intent "Land"\n  form   # ux:ignore UX110\n    title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(check(ast), [ast]);
  assert.equal(kept.filter(d => d.code === 'UX110').length, 1, 'the error is still reported');
  assert.equal(kept.filter(d => d.code === 'UX026').length, 1, 'and the attempt is named');
});

test('an ignore that suppresses nothing is reported so it cannot rot', () => {
  const source = 'data Task\n  title text\n\nscreen Home\n  intent "Land"\n  list Task   # ux:ignore UX303\n    row title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(lint([ast]), [ast]);
  assert.equal(kept.filter(d => d.code === 'UX027').length, 1);
});

test('a comment that is not an ignore directive is left alone', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task   # just a note about UX305\n    row title\n';
  const { ast } = parse(source, 'a.ux');
  const kept = applyIgnores(lint([ast]), [ast]);
  assert.equal(kept.filter(d => d.code === 'UX305').length, 1);
});
