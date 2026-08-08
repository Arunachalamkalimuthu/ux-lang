import { lex, treeify } from './lexer.js';
import { diag } from './diagnostics.js';
import { words, splitArrow, parseTarget, parseString } from './parse-line.js';

export const PRIMITIVE_TYPES = new Set([
  'text', 'number', 'int', 'bool', 'date', 'time', 'datetime',
  'money', 'email', 'url', 'phone', 'image', 'file', 'id', 'secret',
]);

const FIELD_MODIFIERS = new Set(['required']);
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
      case 'screen':
        ast.decls.push(parseScreen(node, file, diags));
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

  if (FIELD_MODIFIERS.has(type)) {
    diags.push(diag('UX012', file, node.line,
      `Field \`${name}\` has no type.`,
      `write:  ${name} text`));
    return null;
  }

  // Strip type markers in a loop to handle any order (e.g., [text]? or [text?])
  let changed = true;
  while (changed) {
    changed = false;
    if (type.startsWith('[') && type.endsWith(']')) {
      field.list = true;
      type = type.slice(1, -1);
      changed = true;
    }
    if (type.endsWith('?')) {
      field.optional = true;
      type = type.slice(0, -1);
      changed = true;
    }
  }
  field.type = type;

  for (const modifier of parts) {
    if (modifier === 'required') field.required = true;
  }

  return field;
}

const ELEMENT_KEYWORDS = ['heading', 'text', 'show', 'group', 'tabs', 'if', 'action', 'form', 'list', 'use'];

function parseScreen(node, file, diags) {
  const screen = {
    kind: 'Screen', name: words(node.text)[1] ?? '', line: node.line, file,
    at: null, needs: null, intent: null, body: [], bind: null,
  };

  for (const child of node.children) {
    const [keyword] = words(child.text);
    const rest = child.text.slice(keyword.length).trim();

    if (keyword === 'at') { screen.at = rest; continue; }
    if (keyword === 'needs') { screen.needs = rest; continue; }
    if (keyword === 'intent') {
      const str = parseString(rest);
      if (!str) {
        diags.push(diag('UX014', file, child.line,
          'intent must be a quoted one-line sentence.',
          'write:  intent "why this screen exists"'));
      } else {
        screen.intent = str.value;
      }
      continue;
    }
    if (keyword === 'bind') { screen.bind = parseBind(child); continue; }

    if (keyword === 'else') {
      const previous = screen.body[screen.body.length - 1];
      if (previous?.kind === 'If') {
        previous.otherwise = child.children.map(c => parseElement(c, file, diags)).filter(Boolean);
      } else {
        diags.push(diag('UX015', file, child.line,
          '`else` has no matching `if`.',
          'put `else` directly after an `if` block at the same indent'));
      }
      continue;
    }

    const element = parseElement(child, file, diags);
    if (element) screen.body.push(element);
  }

  return screen;
}

function parseBind(node) {
  const bind = { fingerprint: null, confidence: null, locators: {} };
  for (const child of node.children) {
    const [keyword] = words(child.text);
    const rest = child.text.slice(keyword.length).trim();
    if (keyword === 'fingerprint') bind.fingerprint = rest;
    else if (keyword === 'confidence') bind.confidence = Number(rest);
    else {
      const str = parseString(child.text.slice(child.text.indexOf('"')));
      if (str) bind.locators[child.text.slice(0, child.text.indexOf('"')).trim()] = str.value;
    }
  }
  return bind;
}

function parseElement(node, file, diags) {
  const [keyword] = words(node.text);
  const rest = node.text.slice(keyword.length).trim();

  switch (keyword) {
    case 'heading':
    case 'text': {
      const str = parseString(rest);
      return { kind: keyword === 'heading' ? 'Heading' : 'Text', text: str ? str.value : rest, line: node.line };
    }
    case 'show':
      return { kind: 'Show', expr: rest, line: node.line };
    case 'group': {
      const str = parseString(rest);
      return {
        kind: 'Group', title: str ? str.value : rest, line: node.line,
        body: node.children.map(c => parseElement(c, file, diags)).filter(Boolean),
      };
    }
    case 'tabs': {
      const items = rest.split('|').map(s => s.trim()).filter(Boolean);
      const arrowChild = node.children.find(c => c.text.startsWith('->'));
      const target = arrowChild ? parseTarget(arrowChild.text.slice(2)) : null;
      return { kind: 'Tabs', items, target, line: node.line };
    }
    case 'if':
      return parseIf(node, rest, file, diags);
    case 'action':
      return parseAction(node.text, node.line);
    case 'form':
      return parseForm(node, rest, file, diags);
    case 'list':
      return parseList(node, rest, file, diags);
    case 'use': {
      const target = parseTarget(rest);
      return { kind: 'Use', component: target?.name ?? rest, args: target?.args ?? [], line: node.line };
    }
    default:
      diags.push(diag('UX013', file, node.line,
        `\`${keyword}\` is not a screen element.`,
        `use one of: ${ELEMENT_KEYWORDS.join(', ')}`));
      return null;
  }
}

function parseIf(node, cond, file, diags) {
  const branch = { kind: 'If', cond, then: [], otherwise: [], line: node.line };
  for (const child of node.children) {
    const element = parseElement(child, file, diags);
    if (element) branch.then.push(element);
  }
  return branch;
}

// `action "New task" -> NewTask`  |  `action star`
function parseAction(text, line) {
  const { left, right } = splitArrow(text);
  const afterKeyword = left.slice('action'.length).trim();
  const str = parseString(afterKeyword);
  const label = str ? str.value : null;
  const bare = str ? str.rest : afterKeyword;
  const target = right ? parseTarget(right) : parseTarget(bare);
  return { kind: 'Action', label, target, line };
}

function parseForm(node, rest, file, diags) {
  const form = { kind: 'Form', data: rest.trim(), fields: [], submit: null, line: node.line };
  for (const child of node.children) {
    if (child.text.startsWith('submit')) {
      const { left, right } = splitArrow(child.text);
      const str = parseString(left.slice('submit'.length).trim());
      form.submit = { label: str ? str.value : null, target: right ? parseTarget(right) : null };
      continue;
    }
    form.fields.push(words(child.text)[0]);
  }
  return form;
}

function parseList(node, rest, file, diags) {
  const whereAt = rest.indexOf(' where ');
  const list = {
    kind: 'List', line: node.line,
    data: (whereAt === -1 ? rest : rest.slice(0, whereAt)).trim(),
    where: whereAt === -1 ? null : rest.slice(whereAt + 7).trim(),
    sortBy: null, row: [], tap: null,
    states: { empty: null, loading: null, error: null },
  };

  for (const child of node.children) {
    const [keyword] = words(child.text);
    const body = child.text.slice(keyword.length).trim();

    if (keyword === 'sort') { list.sortBy = body.replace(/^by\s+/, '').trim(); continue; }
    if (keyword === 'row') { list.row = body.split(',').map(s => s.trim()).filter(Boolean); continue; }
    if (keyword === 'tap') { list.tap = parseTarget(splitArrow(child.text).right ?? ''); continue; }
    if (keyword === 'empty' || keyword === 'loading' || keyword === 'error') {
      list.states[keyword] = parseState(child.text, keyword, child.line);
      continue;
    }
    diags.push(diag('UX013', file, child.line,
      `\`${keyword}\` is not valid inside a list.`,
      'use one of: sort by, row, tap, empty, loading, error'));
  }

  return list;
}

// `empty "All clear." action "New task" -> NewTask`
function parseState(text, keyword, line) {
  const afterKeyword = text.slice(keyword.length).trim();
  const str = parseString(afterKeyword);
  const value = str ? str.value : afterKeyword;
  const remainder = str ? str.rest : '';
  const action = remainder.startsWith('action') ? parseAction(remainder, line) : null;
  return { text: value, action };
}
