import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// bench/inspect.mjs is a benchmark tool, not part of the package `npm test`
// otherwise exercises — but it re-implements small tree-walkers over the
// same AST shape src/linker.js walks (forms, lists, `use` sites nested in
// `group`/`if`). If that AST shape ever changes without inspect.mjs being
// updated to match — precisely how the Task 11 bug (a form field's real
// shape not being checked anywhere) went unnoticed — inspect.mjs would
// start silently printing `undefined` or throwing, and nothing would catch
// it, since it sits outside every other test file. This is a thin
// regression guard, not a spec for the tool.
const run = promisify(execFile);
const INSPECT = new URL('../bench/inspect.mjs', import.meta.url).pathname;
const EXAMPLES = new URL('../examples/', import.meta.url).pathname;

async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ux-inspect-'));
  await mkdir(join(dir, 'ux', 'screens'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, 'ux', name), body);
  }
  return dir;
}

test('inspect.mjs runs clean against all three examples and prints every section', async () => {
  for (const name of ['tasks', 'shop', 'notes']) {
    const { stdout } = await run('node', [INSPECT, `${EXAMPLES}${name}/ux`]);
    for (const heading of ['SCREENS', 'FORMS', 'LISTS', 'FLOWS', 'COMPONENTS', 'NAVIGATION GRAPH']) {
      assert.match(stdout, new RegExp(heading), `${name}: missing ${heading} section`);
    }
    assert.match(stdout, /No problems found/, `${name}: expected a clean parse check`);
  }
});

test('inspect.mjs prints the actual parsed field names for a form, prominently', async () => {
  // This is the specific line that would have caught Task 11's bug: a form
  // whose fields all silently parsed to the placeholder word `field`
  // instead of the real field names, with a clean `ux check` hiding it.
  // examples/tasks' NewTask form uses real field names (`title`, `due`) —
  // assert the exact rendered line, so a future change to either the form
  // or to how inspect.mjs renders fields is caught here.
  const { stdout } = await run('node', [INSPECT, `${EXAMPLES}tasks/ux`]);
  assert.match(stdout, /form Task\n\s+FIELDS: \[title \(required\), due\]/);
});

test('inspect.mjs flags a form field name repeated across lines', async () => {
  // Reproduces the shape of Task 11's actual bug (every field parsed to the
  // same placeholder name) against a throwaway project, and confirms
  // inspect.mjs's own duplicate-field warning fires — the signal that
  // exists specifically because a clean `ux check` alone hid this once.
  const dir = await project({
    'app.ux': 'app Demo\n',
    'data.ux': 'data Expense\n  id      id\n  amount  money  required\n  note    text\n',
    'flows.ux': 'flow save(expense)\n  call api.save(expense)\n    ok -> toast "Saved"\n    fail -> error "Could not save."\n  go NewExpense\n',
    'screens/new-expense.ux': [
      'screen NewExpense',
      '  intent "Log a new expense"',
      '',
      '  form Expense',
      '    field description required',
      '    field amount required',
      '    submit "Save" -> save(expense)',
      '',
      '  action "Cancel" -> NewExpense',
      '',
    ].join('\n'),
  });

  const { stdout } = await run('node', [INSPECT, join(dir, 'ux')]);
  assert.match(stdout, /WARNING: field `field` is listed 2 times/);
});

test('inspect.mjs exits 1 with a usage message when no directory is given', async () => {
  await assert.rejects(
    run('node', [INSPECT]),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /usage:/);
      return true;
    },
  );
});
