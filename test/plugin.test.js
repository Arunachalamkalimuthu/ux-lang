import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// The plugin is the product for anyone who reaches ux-lang through Claude Code
// rather than through the CLI, and none of it was covered by a test. Two of
// these guards exist because a real defect got through: `plugin.json` shipped
// `"author": "ux-lang contributors"` as a string where the manifest schema
// requires an object, which makes the manifest invalid and the plugin fail to
// load — `claude plugin validate` says so, but nothing in CI ran it. The rest
// pin the things that are written down in more than one place.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = async path => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

const PKG = 'package.json';
const MANIFEST = 'plugin/.claude-plugin/plugin.json';
const MARKETPLACE = '.claude-plugin/marketplace.json';
const SKILL = 'plugin/skills/ux/SKILL.md';

test('the plugin manifest matches the fields the loader requires', async () => {
  const manifest = await readJson(MANIFEST);

  assert.equal(typeof manifest.name, 'string', '`name` is the one required field');
  assert.ok(manifest.name.length > 0);

  // The schema takes an object here, not a string. A string parses as JSON and
  // reads fine to a human, which is exactly why it survived.
  assert.equal(typeof manifest.author, 'object', '`author` must be an object, not a string');
  assert.ok(manifest.author !== null && !Array.isArray(manifest.author));
  assert.equal(typeof manifest.author.name, 'string');
});

test('the marketplace entry points at a directory that really holds the plugin', async () => {
  const marketplace = await readJson(MARKETPLACE);
  assert.ok(Array.isArray(marketplace.plugins) && marketplace.plugins.length > 0);

  for (const entry of marketplace.plugins) {
    const dir = join(ROOT, entry.source);
    assert.ok((await stat(dir)).isDirectory(), `${entry.source} is not a directory`);
    const manifest = join(dir, '.claude-plugin', 'plugin.json');
    assert.ok((await stat(manifest)).isFile(), `${entry.source} has no .claude-plugin/plugin.json`);
  }
});

// Three files carry the plugin's version and description. This repository's
// whole argument against duplication is that two copies of a fact drift and
// then the answer depends on which one you read; the plugin metadata was the
// one place that argument had not been applied.
test('the plugin version tracks the package version', async () => {
  const [pkg, manifest] = await Promise.all([readJson(PKG), readJson(MANIFEST)]);
  assert.equal(manifest.version, pkg.version,
    'plugin.json and package.json disagree about the version');
});

test('the marketplace entry describes the plugin the same way the plugin does', async () => {
  const [manifest, marketplace] = await Promise.all([readJson(MANIFEST), readJson(MARKETPLACE)]);
  const entry = marketplace.plugins.find(p => p.name === manifest.name);
  assert.ok(entry, `marketplace.json has no entry named \`${manifest.name}\``);
  assert.equal(entry.description, manifest.description,
    'marketplace.json and plugin.json disagree about what the plugin does');
});

// SKILL.md is loaded in full every time the skill fires, so its whole size is
// the cost — not just the grammar section that skill-budget.test.js polices.
// The budget is a ratchet: raise it deliberately, in a commit that says why.
test('SKILL.md as a whole stays inside its token budget', async () => {
  const body = await readFile(join(ROOT, SKILL), 'utf8');
  const tokens = Math.ceil(body.length / 4);
  assert.ok(tokens < 1600, `SKILL.md is ~${tokens} tokens, budget is 1600`);
});

// `${CLAUDE_PLUGIN_ROOT}` resolves inside skill and command content. A
// hand-written `<path-to-...>` does not: it reaches the model as literal angle
// brackets and it has to guess, which is how the CLI fallback was written.
test('no shipped plugin markdown leaves an angle-bracket path placeholder', async () => {
  const files = [
    SKILL,
    'plugin/commands/ux.md',
    'plugin/commands/ux-import.md',
    'plugin/skills/ux/reference/codegen.md',
    'plugin/skills/ux/reference/import.md',
  ];

  for (const file of files) {
    const body = await readFile(join(ROOT, file), 'utf8');
    const found = body.match(/<path-to-[^>]*>/g);
    assert.equal(found, null, `${file} still tells the model to substitute ${found?.[0]} itself`);
  }
});

// Every rule SKILL.md claims is enforced must correspond to a code the checker
// actually emits, and the four failure modes the audit turned into diagnostics
// have to be stated where the model reads them — a diagnostic is a mistake the
// prompt failed to prevent, and the prompt is this file.
test('SKILL.md states the parse-level traps the checker now reports', async () => {
  const body = await readFile(join(ROOT, SKILL), 'utf8');
  const required = [
    [/`app` takes no indented body/i, 'that `app` takes no indented body (UX022)'],
    [/[Nn]othing (?:may be )?nest(?:ed|s) under/, 'that leaf elements take no indented body (UX021)'],
    [/PascalCase/, 'that navigation targets are PascalCase names (UX023)'],
    [/\\"/, 'how to put a quote inside a string (UX025)'],
  ];

  for (const [pattern, what] of required) {
    assert.match(body, pattern, `SKILL.md does not say ${what}`);
  }
});
