import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CLI = new URL('../bin/ux', import.meta.url).pathname;

async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ux-'));
  await mkdir(join(dir, 'ux'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, 'ux', name), body);
  }
  return dir;
}

const GOOD = {
  'app.ux': 'app Demo\n',
  'home.ux': 'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> About\n',
  'about.ux': 'screen About\n  intent "Explain"\n  action "Back" -> Home\n',
};

test('check exits 0 on a clean project', async () => {
  const dir = await project(GOOD);
  const { stdout } = await run('node', [CLI, 'check', join(dir, 'ux')]);
  assert.match(stdout, /No problems found/);
});

test('check exits 1 and explains the fix on a broken project', async () => {
  const dir = await project({ 'home.ux': 'screen Home\n  at /\n  text "no intent"\n' });
  await assert.rejects(
    run('node', [CLI, 'check', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /UX100/);
      assert.match(err.stdout, /intent "/);
      return true;
    },
  );
});

test('map prints the flow graph', async () => {
  const dir = await project(GOOD);
  const { stdout } = await run('node', [CLI, 'map', join(dir, 'ux')]);
  assert.match(stdout, /Home\s+-> About/);
});

test('no arguments prints usage and exits 0; unknown command exits 1 naming a valid command', async () => {
  const { stdout, code } = await run('node', [CLI]);
  assert.match(stdout, /ux check/);
  assert.match(stdout, /ux map/);
  assert.equal(code ?? 0, 0);

  const dir = await project(GOOD);
  await assert.rejects(
    run('node', [CLI, 'bogus', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /Unknown command/);
      assert.match(err.stdout, /ux check/);
      return true;
    },
  );
});

test('map writes <dir>/.build/app.map to disk matching stdout', async () => {
  const dir = await project(GOOD);
  const { stdout } = await run('node', [CLI, 'map', join(dir, 'ux')]);
  const written = await readFile(join(dir, 'ux', '.build', 'app.map'), 'utf8');
  assert.equal(written, stdout);
});

test('check on a missing directory exits 1 and names it, without a raw stack trace', async () => {
  const dir = await mktempDir();
  const missing = join(dir, 'nope');
  await assert.rejects(
    run('node', [CLI, 'check', missing]),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /nope/);
      assert.doesNotMatch(err.stdout, /at file:|at Object\.|node:internal/);
      return true;
    },
  );
});

async function mktempDir() {
  return mkdtemp(join(tmpdir(), 'ux-'));
}

// Regression guard for Finding 1: the command must be validated before the
// directory is ever touched. A bare tmpdir has no `ux/` subfolder at all —
// the ordinary first-run state — so if command validation ran after
// `loadProject`, this would misreport a missing-directory error instead of
// naming the actual typo.
test('unknown command against a directory with no ux/ folder names the command, not the missing directory', async () => {
  const dir = await mktempDir(); // deliberately bare — no `ux/` subfolder created
  await assert.rejects(
    run('node', [CLI, 'bogus', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /Unknown command `bogus`/);
      assert.doesNotMatch(err.stdout, /Could not read/);
      return true;
    },
  );
});

// Regression guard for Finding 2: renderDiagnostics already prepends
// `  add:  ` to every fix. A fix string that bakes the same prefix into
// itself (as `check.js`'s UX100 fix used to) would render as a doubled
// `add:  add:  ...` line. Assert on the actual rendered stdout, not on the
// diagnostic object, since testing the layers in isolation is exactly why
// this bug survived.
test('check output never doubles the fix-line prefix and the fix is a pasteable .ux line', async () => {
  const dir = await project({ 'home.ux': 'screen Home\n  at /\n  text "no intent"\n' });
  await assert.rejects(
    run('node', [CLI, 'check', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.doesNotMatch(err.stdout, /add:\s*add:/);
      assert.match(err.stdout, /add:\s+intent "why this screen exists"/);
      return true;
    },
  );
});

// Finding 3: `ux map` always exits 0 (a map of a broken project is exactly
// what you want when hunting a dead end) but must not stay silent about
// errors.
test('map on a broken project still prints the map, exits 0, and reports the error count', async () => {
  const dir = await project({
    'app.ux': 'app Demo\n',
    'home.ux': 'screen Home\n  at /\n  intent "Land here"\n  action "Go" -> About\n',
    'about.ux': 'screen About\n  text "no intent"\n  action "Back" -> Home\n',
  });
  const { stdout, code } = await run('node', [CLI, 'map', join(dir, 'ux')]);
  assert.equal(code ?? 0, 0);
  assert.match(stdout, /Home\s+-> About/);
  assert.match(stdout, /1 error\(s\) — run `ux check` for details/);
});

test('map on a clean project prints only the map, with no error-count line', async () => {
  const dir = await project(GOOD);
  const { stdout, code } = await run('node', [CLI, 'map', join(dir, 'ux')]);
  assert.equal(code ?? 0, 0);
  assert.doesNotMatch(stdout, /error\(s\)/);
});
