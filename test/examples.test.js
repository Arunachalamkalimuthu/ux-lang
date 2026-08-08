import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadProject } from '../src/project.js';
import { link } from '../src/linker.js';
import { renderDiagnostics } from '../src/report.js';
import { hasErrors } from '../src/diagnostics.js';

const ROOT = new URL('../examples/', import.meta.url).pathname;

test('every example project checks clean', async () => {
  const names = await readdir(ROOT);
  assert.ok(names.length >= 3, 'expected at least three examples');

  for (const name of names) {
    const { programs, diags } = await loadProject(join(ROOT, name, 'ux'));
    const linked = link(programs);
    const all = [...diags, ...linked.diags];
    assert.equal(hasErrors(all), false, `${name}:\n${renderDiagnostics(all)}`);
  }
});
