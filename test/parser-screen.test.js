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

test('tabs with one arrow per tab reports UX020 and keeps only the first target', () => {
  const { ast, diags } = parse(
    'screen Repo\n  intent "x"\n  tabs Code | Issues\n    -> Code\n    -> Issues\n', 'a.ux');
  assert.ok(diags.some(d => d.code === 'UX020'));
  const tabs = ast.decls[0].body[0];
  assert.deepEqual(tabs.target, { name: 'Code', args: [] });
});

test('tabs with a single arrow reports no UX020', () => {
  const { diags } = parse(
    'screen Repo\n  intent "x"\n  tabs Code | Issues\n    -> Issues\n', 'a.ux');
  assert.ok(!diags.some(d => d.code === 'UX020'));
});

test('the UX020 fix explains tabs takes one destination', () => {
  const { diags } = parse(
    'screen Repo\n  intent "x"\n  tabs Code | Issues\n    -> Code\n    -> Issues\n', 'a.ux');
  const found = diags.find(d => d.code === 'UX020');
  assert.match(found.fix, /single destination|one destination|one arrow/);
});

test('parses a form with a submit target', () => {
  const { ast } = parse(
    'screen New\n  intent "x"\n  form Task\n    title required\n    due\n    submit "Create" -> create(task)\n',
    'a.ux');
  const form = ast.decls[0].body[0];
  assert.equal(form.data, 'Task');
  assert.deepEqual(form.fields.map(f => ({ name: f.name, modifiers: f.modifiers })), [
    { name: 'title', modifiers: ['required'] },
    { name: 'due', modifiers: [] },
  ]);
  assert.equal(form.submit.label, 'Create');
  assert.deepEqual(form.submit.target, { name: 'create', args: ['task'] });
});

test('a form field\'s modifiers are kept, not discarded', () => {
  const { ast } = parse(
    'screen New\n  intent "x"\n  form Task\n    title required\n    due\n', 'a.ux');
  const form = ast.decls[0].body[0];
  assert.equal(form.fields[0].name, 'title');
  assert.ok(form.fields[0].modifiers.includes('required'));
  assert.equal(form.fields[1].name, 'due');
  assert.deepEqual(form.fields[1].modifiers, []);
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

test('if/else nested inside a group folds correctly with no diagnostics', () => {
  const { ast, diags } = parse(
    'screen A\n  intent "x"\n  group "Section"\n    if user.admin\n      text "yes"\n    else\n      text "no"\n',
    'a.ux');
  assert.equal(diags.length, 0);
  const group = ast.decls[0].body[0];
  assert.equal(group.kind, 'Group');
  const branch = group.body[0];
  assert.equal(branch.kind, 'If');
  assert.equal(branch.then[0].text, 'yes');
  assert.equal(branch.otherwise[0].text, 'no');
});

test('if/else nested inside another if\'s then branch folds correctly', () => {
  const { ast, diags } = parse(
    'screen A\n  intent "x"\n  if outer\n    if inner\n      text "yes"\n    else\n      text "no"\n',
    'a.ux');
  assert.equal(diags.length, 0);
  const outer = ast.decls[0].body[0];
  assert.equal(outer.kind, 'If');
  const inner = outer.then[0];
  assert.equal(inner.kind, 'If');
  assert.equal(inner.then[0].text, 'yes');
  assert.equal(inner.otherwise[0].text, 'no');
});

test('else inside a group with no preceding if reports UX015, not UX013', () => {
  const { diags } = parse(
    'screen A\n  intent "x"\n  group "Section"\n    text "hi"\n    else\n      text "no"\n',
    'a.ux');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 'UX015');
});

test('list where-split is quote-aware', () => {
  const { ast, diags } = parse(
    'screen A\n  intent "x"\n  list Task where name is "a where b"\n', 'a.ux');
  assert.equal(diags.length, 0);
  const list = ast.decls[0].body[0];
  assert.equal(list.data, 'Task');
  assert.equal(list.where, 'name is "a where b"');
});

test('form field named "submitted" is kept, and a real submit still parses', () => {
  const { ast, diags } = parse(
    'screen A\n  intent "x"\n  form Task\n    submitted date\n    submit "Create" -> create(task)\n',
    'a.ux');
  assert.equal(diags.length, 0);
  const form = ast.decls[0].body[0];
  assert.deepEqual(form.fields.map(f => f.name), ['submitted']);
  assert.equal(form.submit.label, 'Create');
  assert.deepEqual(form.submit.target, { name: 'create', args: ['task'] });
});

test('regression: two consecutive if/else pairs at screen top level fold independently', () => {
  const { ast, diags } = parse(
    'screen A\n  intent "x"\n  if a\n    text "a-yes"\n  else\n    text "a-no"\n  if b\n    text "b-yes"\n  else\n    text "b-no"\n',
    'a.ux');
  assert.equal(diags.length, 0);
  const [first, second] = ast.decls[0].body;
  assert.equal(first.cond, 'a');
  assert.equal(first.then[0].text, 'a-yes');
  assert.equal(first.otherwise[0].text, 'a-no');
  assert.equal(second.cond, 'b');
  assert.equal(second.then[0].text, 'b-yes');
  assert.equal(second.otherwise[0].text, 'b-no');
});

test('regression: a screen body with no else anywhere still parses with no diagnostics', () => {
  const { diags } = parse(SCREEN, 'a.ux');
  assert.equal(diags.length, 0);
});

// ---- audit regressions -----------------------------------------------------

test('a screen declared with spaced parameters keeps its name and params', () => {
  const { ast, diags } = parse('screen Detail(task, mode)\n  intent "Read one"\n  text "x"\n', 'a.ux');
  assert.deepEqual(diags, []);
  assert.equal(ast.decls[0].name, 'Detail');
  assert.deepEqual(ast.decls[0].params, ['task', 'mode']);
});

test('an element that takes no indented body reports UX021 instead of dropping it', () => {
  const source = 'screen Home\n  intent "Land"\n  text "Everything"\n    list Task\n      row title\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX021').length, 1);
  assert.match(diags.find(d => d.code === 'UX021').message, /`text`/);
});

test('UX021 names each leaf element that was given a body', () => {
  for (const keyword of ['heading "H"', 'text "T"', 'show a.b', 'action "A" -> Home', 'use Card']) {
    const source = `screen Home\n  intent "Land"\n  ${keyword}\n    text "orphan"\n`;
    const { diags } = parse(source, 'a.ux');
    assert.equal(diags.filter(d => d.code === 'UX021').length, 1, `expected UX021 for \`${keyword}\``);
  }
});

test('a `group` still takes an indented body without UX021', () => {
  const { diags } = parse('screen Home\n  intent "Land"\n  group "Section"\n    text "inside"\n', 'a.ux');
  assert.deepEqual(diags.filter(d => d.code === 'UX021'), []);
});

test('an indented block under `app` reports UX022 rather than vanishing', () => {
  const source = 'app Demo\n  screen Home\n    at /\n    intent "Land"\n    text "hi"\n';
  const { ast, diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX022').length, 1);
  assert.equal(ast.decls.length, 0, 'the nested declarations are still not parsed — UX022 is what tells you so');
});

test('an indented block under `site` reports UX022', () => {
  const { diags } = parse('site example.com\n  screen Home\n    intent "Land"\n', 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX022').length, 1);
});

test('`app` with no body stays silent', () => {
  const { diags } = parse('app Demo\n', 'a.ux');
  assert.deepEqual(diags.filter(d => d.code === 'UX022'), []);
});

test('a `tap` target that cannot be parsed reports UX023 instead of becoming no target', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task\n    tap -> task-detail\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX023').length, 1);
  assert.match(diags.find(d => d.code === 'UX023').message, /task-detail/);
});

test('an empty arrow target reports UX023', () => {
  const { diags } = parse('screen Home\n  intent "Land"\n  list Task\n    tap ->\n', 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX023').length, 1);
});

test('a `form submit` target that cannot be parsed reports UX023', () => {
  const source = 'screen Home\n  intent "Land"\n  form Task\n    submit "Save" -> save.thing\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX023').length, 1);
});

test('a `tabs` target that cannot be parsed reports UX023', () => {
  const source = 'screen Home\n  intent "Land"\n  tabs A | B\n    -> not-a-name\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX023').length, 1);
});

test('a well-formed tap target stays silent', () => {
  const source = 'screen Home\n  intent "Land"\n  list Task\n    tap -> Detail(task)\n';
  const { diags } = parse(source, 'a.ux');
  assert.deepEqual(diags.filter(d => d.code === 'UX023'), []);
});

test('a non-arrow child of `tabs` reports UX021 rather than being dropped', () => {
  const source = 'screen Home\n  intent "Land"\n  tabs A | B\n    text "dropped"\n';
  const { diags } = parse(source, 'a.ux');
  assert.equal(diags.filter(d => d.code === 'UX021').length, 1);
});

test('a screen intent can contain an escaped quote', () => {
  const { ast, diags } = parse('screen Home\n  intent "Show \\"recently viewed\\" items"\n  text "x"\n', 'a.ux');
  assert.deepEqual(diags, []);
  assert.equal(ast.decls[0].intent, 'Show "recently viewed" items');
});
