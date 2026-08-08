import { lex, treeify } from './lexer.js';
import { diag } from './diagnostics.js';
import { words } from './parse-line.js';

export const PRIMITIVE_TYPES = new Set([
  'text', 'number', 'int', 'bool', 'date', 'time', 'datetime',
  'money', 'email', 'url', 'phone', 'image', 'file', 'id', 'secret',
]);

const TOP_LEVEL = ['app', 'site', 'data', 'screen', 'component', 'flow'];

export function parse(source, file) {
  const { lines, diags } = lex(source, file);
  const root = treeify(lines);
  const ast = { kind: 'Program', file, root: null, decls: [] };

  for (const node of root.children) {
    const [keyword, ...rest] = words(node.text);
    const name = rest.join(' ').trim();

    switch (keyword) {
      case 'app':
      case 'site':
        ast.root = { kind: keyword === 'app' ? 'App' : 'Site', name, line: node.line };
        break;
      case 'data':
        ast.decls.push(parseData(node, file, diags));
        break;
      default:
        diags.push(diag('UX010', file, node.line,
          `\`${keyword}\` is not a top-level keyword.`,
          `use one of: ${TOP_LEVEL.join(', ')}`));
    }
  }

  return { ast, diags };
}

function parseData(node, file, diags) {
  const decl = { kind: 'Data', name: words(node.text)[1] ?? '', line: node.line, file, fields: [] };
  const seen = new Set();

  for (const child of node.children) {
    const field = parseField(child, file, diags);
    if (!field) continue;
    if (seen.has(field.name)) {
      diags.push(diag('UX011', file, child.line,
        `Field \`${field.name}\` is declared twice in \`${decl.name}\`.`,
        'remove or rename the duplicate'));
      continue;
    }
    seen.add(field.name);
    decl.fields.push(field);
  }

  return decl;
}

function parseField(node, file, diags) {
  let text = node.text;
  let def = null;

  const eq = text.indexOf('=');
  if (eq !== -1) {
    def = text.slice(eq + 1).trim();
    text = text.slice(0, eq).trim();
  }

  const parts = words(text);
  const name = parts.shift();
  if (!name) return null;

  const field = {
    name, type: null, line: node.line,
    optional: false, required: false, default: def, list: false, enum: null,
  };

  if (parts[0] === 'one' && parts[1] === 'of') {
    field.type = 'enum';
    field.enum = parts.slice(2).join(' ').split('|').map(s => s.trim()).filter(Boolean);
    return field;
  }

  let type = parts.shift();
  if (!type) {
    diags.push(diag('UX012', file, node.line,
      `Field \`${name}\` has no type.`,
      `write:  ${name} text`));
    return null;
  }

  if (type.startsWith('[') && type.endsWith(']')) {
    field.list = true;
    type = type.slice(1, -1);
  }
  if (type.endsWith('?')) {
    field.optional = true;
    type = type.slice(0, -1);
  }
  field.type = type;

  for (const modifier of parts) {
    if (modifier === 'required') field.required = true;
  }

  return field;
}
