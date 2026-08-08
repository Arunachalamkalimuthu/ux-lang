import { lex, treeify } from './lexer.js';
import { diag } from './diagnostics.js';
import { words, splitArrow, parseTarget, parseString, indexOutsideString } from './parse-line.js';

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
      case 'flow':
        ast.decls.push(parseFlow(node, file, diags));
        break;
      case 'component':
        ast.decls.push(parseComponent(node, file, diags));
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

  const bodyNodes = [];
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

    bodyNodes.push(child);
  }

  screen.body = parseBody(bodyNodes, file, diags);
  return screen;
}

// Parses a list of sibling line-tree nodes into Element[], folding a trailing
// `else` node into the `If` element that immediately precedes it (`else` is a
// sibling of `if` in the indentation tree, not a child). Shared by screen
// bodies, `group` bodies, `if` bodies, and (from Task 5) component bodies.
function parseBody(children, file, diags) {
  const body = [];
  for (const child of children) {
    const [keyword] = words(child.text);

    if (keyword === 'else') {
      const previous = body[body.length - 1];
      if (previous?.kind === 'If') {
        previous.otherwise = parseBody(child.children, file, diags);
      } else {
        diags.push(diag('UX015', file, child.line,
          '`else` has no matching `if`.',
          'put `else` directly after an `if` block at the same indent'));
      }
      continue;
    }

    const element = parseElement(child, file, diags);
    if (element) body.push(element);
  }
  return body;
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
        body: parseBody(node.children, file, diags),
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
  return { kind: 'If', cond, then: parseBody(node.children, file, diags), otherwise: [], line: node.line };
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
    if (words(child.text)[0] === 'submit') {
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
  const whereAt = indexOutsideString(rest, ' where ');
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
  const action = words(remainder)[0] === 'action' ? parseAction(remainder, line) : null;
  return { text: value, action };
}

const FLOW_KEYWORDS = ['set', 'call', 'go', 'toast', 'confirm', 'error'];

function parseSignature(text, keyword) {
  const target = parseTarget(text.slice(keyword.length).trim());
  return { name: target?.name ?? '', params: target?.args ?? [] };
}

function parseFlow(node, file, diags) {
  const { name, params } = parseSignature(node.text, 'flow');
  return {
    kind: 'Flow', name, params, line: node.line, file,
    steps: node.children.map(c => parseStep(c, file, diags)).filter(Boolean),
  };
}

function parseComponent(node, file, diags) {
  const { name, params } = parseSignature(node.text, 'component');
  return {
    kind: 'Component', name, params, line: node.line, file,
    body: parseBody(node.children, file, diags),
  };
}

function parseStep(node, file, diags) {
  const [keyword] = words(node.text);
  const rest = node.text.slice(keyword.length).trim();

  switch (keyword) {
    case 'set': {
      const eq = rest.indexOf('=');
      if (eq === -1) {
        diags.push(diag('UX017', file, node.line,
          '`set` needs a value.', 'write:  set task.done = true'));
        return null;
      }
      return { kind: 'Set', target: rest.slice(0, eq).trim(), value: rest.slice(eq + 1).trim(), line: node.line };
    }
    case 'call': {
      const target = parseTarget(rest) ?? parseDottedCall(rest);
      const branches = { ok: [], fail: [] };
      for (const child of node.children) {
        const [branchName] = words(child.text);
        if (branchName !== 'ok' && branchName !== 'fail') continue;
        const body = splitArrow(child.text).right;
        if (!body) continue;
        const step = parseStep({ ...child, text: body, children: [] }, file, diags);
        if (step) branches[branchName].push(step);
      }
      return { kind: 'Call', name: target.name, args: target.args, ...branches, line: node.line };
    }
    case 'go':
      return { kind: 'Go', target: parseTarget(rest), line: node.line };
    case 'toast': {
      const str = parseString(rest);
      const undoMatch = /undo\s+(\S+)/.exec(str ? str.rest : rest);
      return { kind: 'Toast', text: str ? str.value : rest, undo: undoMatch ? undoMatch[1] : null, line: node.line };
    }
    case 'confirm': {
      const str = parseString(rest);
      return { kind: 'Confirm', text: str ? str.value : rest, line: node.line };
    }
    case 'error': {
      const str = parseString(rest);
      return { kind: 'ErrorStep', text: str ? str.value : rest, line: node.line };
    }
    default:
      diags.push(diag('UX016', file, node.line,
        `\`${keyword}\` is not a flow step.`,
        `use one of: ${FLOW_KEYWORDS.join(', ')}`));
      return null;
  }
}

// `api.complete(task)` — parseTarget rejects the dot, so handle it here.
function parseDottedCall(text) {
  const match = /^([A-Za-z][\w.]*)\s*(?:\(([^)]*)\))?$/.exec(text.trim());
  if (!match) return { name: text.trim(), args: [] };
  return {
    name: match[1],
    args: (match[2] ?? '').split(',').map(a => a.trim()).filter(Boolean),
  };
}
