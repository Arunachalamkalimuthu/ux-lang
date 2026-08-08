import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diag, WARNING } from '../src/diagnostics.js';
import { renderDiagnostics } from '../src/report.js';

test('every diagnostic prints location, code, message, and fix', () => {
  const out = renderDiagnostics([
    diag('UX102', 'ux/screens/inbox.ux', 12, 'This list has no `empty` case.', 'empty "Nothing here yet."'),
  ]);
  assert.match(out, /ux\/screens\/inbox\.ux:12/);
  assert.match(out, /UX102/);
  assert.match(out, /add:\s+empty "Nothing here yet\."/);
});

test('clean input reports success', () => {
  assert.match(renderDiagnostics([]), /No problems found/);
});

test('warning diagnostic counts in warning column, not error', () => {
  const out = renderDiagnostics([
    diag('UX100', 'file.ux', 5, 'This is an error', 'fix this'),
    diag('UX101', 'file.ux', 10, 'This is a warning', 'fix this too', WARNING),
    diag('UX102', 'file.ux', 15, 'Another warning', 'fix it', WARNING),
  ]);
  assert.match(out, /1 error\(s\), 2 warning\(s\)/);
});
