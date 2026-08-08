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
      // Finding 6: bin/ux's own hint lines must use the same `fix:` label
      // as every diagnostic, not a leftover `add:` — this hint is an
      // instruction ("create a .../ directory..."), not a line to add.
      assert.match(err.stdout, /\n {2}fix: {2}create a .+ directory with \.ux files\n/);
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

// Finding 6: this is the message most users will hit first (a typo'd
// subcommand), and bin/ux writes it by hand rather than through
// renderDiagnostics — it must still carry the same `fix:` label, with the
// renderer's exact spacing, so the CLI's own hints and every diagnostic
// line up in one terminal session.
test('unknown command message uses the `fix:` label with the renderer\'s exact spacing', async () => {
  await assert.rejects(
    run('node', [CLI, 'bogus']),
    err => {
      assert.equal(err.code, 1);
      assert.match(err.stdout, /\n {2}fix: {2}ux check\n/);
      assert.doesNotMatch(err.stdout, /add:/);
      return true;
    },
  );
});

// Regression guard for Finding 2: renderDiagnostics already prepends
// `  fix:  ` to every fix (it used to be `  add:  `, which was wrong — not
// every fix is a line to add, see report round 2). A fix string that bakes
// the same kind of boilerplate into itself (as `check.js`'s UX100 fix used
// to, with a baked-in `add:  `) would render as a doubled
// `fix:  add:  ...` line. Assert on the actual rendered stdout, not on the
// diagnostic object, since testing the layers in isolation is exactly why
// this bug survived.
test('check output never doubles the fix-line prefix and the fix is a pasteable .ux line', async () => {
  const dir = await project({ 'home.ux': 'screen Home\n  at /\n  text "no intent"\n' });
  await assert.rejects(
    run('node', [CLI, 'check', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.doesNotMatch(err.stdout, /fix:\s*(add|write):/);
      assert.match(err.stdout, /fix:\s+intent "why this screen exists"/);
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

// --- MEDIUM 7: an empty project directory is an error, not a silent pass ---

test('check on a `ux/` directory with zero .ux files exits 1, not "No problems found"', async () => {
  const dir = await mktempDir();
  await mkdir(join(dir, 'ux'), { recursive: true });
  await assert.rejects(
    run('node', [CLI, 'check', join(dir, 'ux')]),
    err => {
      assert.equal(err.code, 1);
      assert.doesNotMatch(err.stdout, /No problems found/);
      assert.match(err.stdout, /no \.ux files/);
      assert.match(err.stdout, /\n {2}fix: {2}create a .+ directory with \.ux files\n/);
      return true;
    },
  );
});

// --- MEDIUM 8: diagnostics print sorted by file, then line, then code ---

test('check output is sorted by file, then line, then code, even though the checker and linker emit diagnostics out of order', async () => {
  // `First` (line 1) is unreachable — the linker only discovers that in its
  // final reachability pass, which runs after (and therefore appends after)
  // the per-screen pass that reports `Second`'s dead link at line 8. Before
  // sorting, dead-link-at-8 prints before unreachable-at-1: out of order.
  const dir = await project({
    'app.ux': 'app Demo\n',
    'screens.ux': [
      'screen First',
      '  intent "x"',
      '  action "Back" -> Second',
      '',
      'screen Second',
      '  at /',
      '  intent "y"',
      '  action "Broken" -> NoSuchScreen',
    ].join('\n'),
  });
  const { stdout } = await run('node', [CLI, 'check', join(dir, 'ux')]).catch(e => e);
  const locations = [...stdout.matchAll(/^\S+:(\d+)\s+(UX\d+)/gm)]
    .map(m => [Number(m[1]), m[2]]);
  assert.ok(locations.length >= 3, `expected several diagnostics, got:\n${stdout}`);
  const sorted = [...locations].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  assert.deepEqual(locations, sorted);
});
