import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';

const SCREEN = [
  'screen Inbox',
  '  at /inbox',
  '  needs signed-in',
  '  intent "See what\'s due and clear it"',
  '  heading "Inbox"',
  '  list Task where owner is me and not done',
  '    sort by due',
  '    row title, due',
  '    tap -> Detail(task)',
  '    empty "All clear." action "New task" -> NewTask',
  '    loading skeleton 3 rows',
  '    error "Could not load tasks." action retry',
  '  action "New task" -> NewTask',
].join('\n');

test('parses screen header fields', () => {
  const { ast, diags } = parse(SCREEN, 'a.ux');
  assert.equal(diags.length, 0);
  const screen = ast.decls[0];
  assert.equal(screen.kind, 'Screen');
  assert.equal(screen.name, 'Inbox');
  assert.equal(screen.at, '/inbox');
  assert.equal(screen.needs, 'signed-in');
  assert.equal(screen.intent, "See what's due and clear it");
});

test('parses a list with query, row, tap, and states', () => {
  const { ast } = parse(SCREEN, 'a.ux');
  const list = ast.decls[0].body.find(e => e.kind === 'List');
  assert.equal(list.data, 'Task');
  assert.equal(list.where, 'owner is me and not done');
  assert.equal(list.sortBy, 'due');
  assert.deepEqual(list.row, ['title', 'due']);
  assert.deepEqual(list.tap, { name: 'Detail', args: ['task'] });
  assert.equal(list.states.empty.text, 'All clear.');
  assert.deepEqual(list.states.empty.action.target, { name: 'NewTask', args: [] });
  assert.equal(list.states.loading.text, 'skeleton 3 rows');
  assert.deepEqual(list.states.error.action.target, { name: 'retry', args: [] });
});

test('parses a bare action verb as a flow target', () => {
  const { ast } = parse('screen A\n  intent "x"\n  action star\n', 'a.ux');
  const action = ast.decls[0].body[0];
  assert.equal(action.label, null);
  assert.deepEqual(action.target, { name: 'star', args: [] });
});

test('parses tabs', () => {
  const { ast } = parse(
    'screen Repo\n  intent "x"\n  tabs Code | Issues | Actions\n    -> Issues(owner, repo)\n', 'a.ux');
  const tabs = ast.decls[0].body[0];
  assert.deepEqual(tabs.items, ['Code', 'Issues', 'Actions']);
  assert.deepEqual(tabs.target, { name: 'Issues', args: ['owner', 'repo'] });
});

test('parses a form with a submit target', () => {
  const { ast } = parse(
    'screen New\n  intent "x"\n  form Task\n    title required\n    due\n    submit "Create" -> create(task)\n',
    'a.ux');
  const form = ast.decls[0].body[0];
  assert.equal(form.data, 'Task');
  assert.deepEqual(form.fields, ['title', 'due']);
  assert.equal(form.submit.label, 'Create');
  assert.deepEqual(form.submit.target, { name: 'create', args: ['task'] });
});

test('parses group and if/else nesting', () => {
  const { ast } = parse(
    'screen A\n  intent "x"\n  group "Overdue"\n    text "late"\n  if user.admin\n    text "yes"\n  else\n    text "no"\n',
    'a.ux');
  const [group, branch] = ast.decls[0].body;
  assert.equal(group.title, 'Overdue');
  assert.equal(group.body[0].text, 'late');
  assert.equal(branch.cond, 'user.admin');
  assert.equal(branch.then[0].text, 'yes');
  assert.equal(branch.otherwise[0].text, 'no');
});

test('unknown element keyword reports UX013', () => {
  const { diags } = parse('screen A\n  intent "x"\n  sparkle "hi"\n', 'a.ux');
  assert.equal(diags[0].code, 'UX013');
});
