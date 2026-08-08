import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';

test('parses app root', () => {
  const { ast, diags } = parse('app Tasks\n', 'a.ux');
  assert.equal(diags.length, 0);
  assert.deepEqual({ kind: ast.root.kind, name: ast.root.name }, { kind: 'App', name: 'Tasks' });
});

test('parses site root with a domain', () => {
  const { ast } = parse('site github.com\n', 'a.ux');
  assert.deepEqual({ kind: ast.root.kind, name: ast.root.name }, { kind: 'Site', name: 'github.com' });
});

test('parses data fields with modifiers', () => {
  const src = [
    'data Task',
    '  title  text  required',
    '  done   bool  = false',
    '  due    date?',
    '  owner  User',
    '  tags   [text]',
  ].join('\n');
  const { ast, diags } = parse(src, 'a.ux');
  assert.equal(diags.length, 0);
  const fields = ast.decls[0].fields;
  assert.deepEqual(fields.map(f => f.name), ['title', 'done', 'due', 'owner', 'tags']);
  assert.equal(fields[0].required, true);
  assert.equal(fields[1].default, 'false');
  assert.equal(fields[2].optional, true);
  assert.equal(fields[3].type, 'User');
  assert.equal(fields[4].list, true);
  assert.equal(fields[4].type, 'text');
});

test('parses an inline enum', () => {
  const { ast } = parse('data Post\n  status one of draft | live | archived = draft\n', 'a.ux');
  const field = ast.decls[0].fields[0];
  assert.deepEqual(field.enum, ['draft', 'live', 'archived']);
  assert.equal(field.default, 'draft');
});

test('unknown top-level keyword reports UX010', () => {
  const { diags } = parse('widget Thing\n', 'a.ux');
  assert.equal(diags[0].code, 'UX010');
  assert.match(diags[0].fix, /app|data|screen|component|flow/);
});
