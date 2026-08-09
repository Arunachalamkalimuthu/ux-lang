import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SKILL = new URL('../plugin/skills/ux/SKILL.md', import.meta.url).pathname;

// Deliberately crude: ~4 characters per token is close enough to police a budget.
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

test('the grammar section stays inside its token budget', async () => {
  const body = await readFile(SKILL, 'utf8');
  const match = /## Grammar\n([\s\S]*?)(?=\n## |$)/.exec(body);
  assert.ok(match, 'SKILL.md must have a `## Grammar` section');
  const tokens = estimateTokens(match[1]);
  assert.ok(tokens < 800, `grammar section is ~${tokens} tokens, budget is 800`);
});
