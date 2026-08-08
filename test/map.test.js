import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { link } from '../src/linker.js';
import { renderMap } from '../src/map.js';

test('renders one line per screen with sorted targets', () => {
  const sources = [
    'screen Login\n  at /\n  intent "x"\n  action "In" -> Inbox\n  action "Reset" -> ResetPassword\n',
    'screen Inbox\n  intent "x"\n  action "Open" -> Detail\n',
    'screen Detail\n  intent "x"\n  action "Back" -> Inbox\n',
    'screen ResetPassword\n  intent "x"\n  action "Back" -> Login\n',
  ];
  const map = renderMap(link(sources.map((s, i) => parse(s, `f${i}.ux`).ast)));
  assert.equal(map.split('\n')[0], 'Login         -> Inbox | ResetPassword');
  assert.ok(map.includes('Detail        -> Inbox'));
});

test('marks a screen with no outgoing edges', () => {
  const map = renderMap(link([parse('screen Only\n  at /\n  intent "x"\n  text "hi"\n', 'a.ux').ast]));
  assert.match(map, /Only\s+-> \(nowhere\)/);
});

test('empty project with no screens returns sensible output', () => {
  const map = renderMap({ screens: new Map(), edges: [], entry: null });
  assert.strictEqual(map, '');
});

// --- MEDIUM 10: two guards the existing GOOD-fixture-shaped tests above
// can't distinguish, because in every fixture above declaration order
// already happens to match sorted order, and the entry screen is always
// declared first. ---

test('targets print sorted, not in declaration order', () => {
  // Declared "Zeta" before "Alpha" — if renderMap ever stopped sorting and
  // fell back to declaration/edge order, this would print "Zeta | Alpha".
  const src = 'screen Home\n  at /\n  intent "x"\n  action "Z" -> Zeta\n  action "A" -> Alpha\n';
  const zeta = 'screen Zeta\n  intent "x"\n  action "Back" -> Home\n';
  const alpha = 'screen Alpha\n  intent "x"\n  action "Back" -> Home\n';
  const map = renderMap(link([src, zeta, alpha].map((s, i) => parse(s, `f${i}.ux`).ast)));
  assert.match(map, /^Home\s+-> Alpha \| Zeta$/m);
});

test('the entry screen (`at /`) is hoisted first even when declared last', () => {
  // "Home" (`at /`) is declared after "Other" here — if renderMap ever fell
  // back to declaration order instead of hoisting the entry, "Other" would
  // print first.
  const other = 'screen Other\n  intent "x"\n  action "Go" -> Home\n';
  const home = 'screen Home\n  at /\n  intent "x"\n  action "Back" -> Other\n';
  const map = renderMap(link([other, home].map((s, i) => parse(s, `f${i}.ux`).ast)));
  assert.equal(map.split('\n')[0].trim().startsWith('Home'), true);
});

test('deduplicates targets from multiple edges', () => {
  const src1 = 'screen Home\n  at /\n  intent "x"\n  action "A" -> Target\n  action "B" -> Target\n';
  const src2 = 'screen Target\n  intent "x"\n  action "Back" -> Home\n';
  const result = link([parse(src1, 'f1.ux').ast, parse(src2, 'f2.ux').ast]);
  const map = renderMap(result);
  assert.match(map, /^Home\s+-> Target$/m);
  assert.ok(!map.match(/Target.*Target/));
});
