import { lex, treeify } from './lexer.js';
import { diag } from './diagnostics.js';
import { words, splitArrow, parseTarget, parseString, indexOutsideString } from './parse-line.js';
import { closestKeyword } from './similar.js';

export const PRIMITIVE_TYPES = new Set([
  'text', 'number', 'int', 'bool', 'date', 'time', 'datetime',
  'money', 'email', 'url', 'phone', 'image', 'file', 'id', 'secret',
]);

const FIELD_MODIFIERS = new Set(['required']);
// A wrong keyword is the most common way to get this language wrong, and it is
// almost always a near-miss rather than an invention — `onTap` for `tap`,
// `button` for `action`. Design rule R4 wanted these to parse with a warning
// and normalise; that needs a formatter to canonicalise them, which does not
// exist yet, and accepting an alias with nothing to rewrite it would leave the
// alias in the file forever and fragment the language. So it stays an error,
// but the error names the word the author meant — which is what R4 was
// actually for: self-correction in one round trip.
function keywordFix(word, keywords, display = keywords) {
  const close = closestKeyword(word, keywords);
  return close ? `did you mean \`${close}\`?` : `use one of: ${display.join(', ')}`;
}

const TOP_LEVEL = ['app', 'site', 'data', 'screen', 'component', 'flow'];

// The one rule this parser was missing: nothing the author wrote may be
// discarded in silence.
//
// Every keyword below reads its children or it does not. The ones that do not
// used to `return`/`break` while `treeify` had already hung an indented block
// underneath them — so the block existed in the line tree and was visited by
// nobody. That is the worst failure this tool can have, because the checker
// cannot report what the parser threw away: a list with no `empty` case, an
// undeclared data type and a dangling `tap` all vanished together and
// `ux check` exited 0. Two spaces of indentation switched off every rule the
// language calls strict. So a keyword that takes no body now says so.
function noBody(node, keyword, file, diags, code, fix) {
  if (node.children.length === 0) return;
  diags.push(diag(code, file, node.children[0].line,
    `\`${keyword}\` takes no indented body, so the ${node.children.length} line(s) under it are not part of this file.`,
    fix));
}

export function parse(source, file) {
  const { lines, diags, ignores } = lex(source, file);
  const root = treeify(lines);
  const ast = { kind: 'Program', file, root: null, decls: [], ignores };

  for (const node of root.children) {
    const [keyword, ...rest] = words(node.text);
    const name = rest.join(' ').trim();

    switch (keyword) {
      case 'app':
      case 'site':
        // `app`/`site` name the project and take no body. They were the only
        // two declaration keywords that read neither their children nor
        // complained about them: `treeify` nests every following declaration
        // inside an indented block, so a whole project written under
        // `app Demo` parsed to zero decls and checked clean — the
        // empty-green-checkmark case, arriving through indentation.
        noBody(node, keyword, file, diags, 'UX022',
          `out-dent them to column 0 — \`${keyword}\` names the project, it does not contain it`);
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
          keywordFix(keyword, TOP_LEVEL)));
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
      `${name} text`));
    return null;
  }

  if (FIELD_MODIFIERS.has(type)) {
    diags.push(diag('UX012', file, node.line,
      `Field \`${name}\` has no type.`,
      `${name} text`));
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

const LIST_KEYWORDS = ['sort', 'row', 'tap', 'empty', 'loading', 'error'];
// `sort` is the keyword the parser matches; `sort by` is how it is written.
const LIST_DISPLAY = ['sort by', 'row', 'tap', 'empty', 'loading', 'error'];
const ELEMENT_KEYWORDS = ['heading', 'text', 'show', 'group', 'tabs', 'if', 'action', 'form', 'list', 'use'];

function parseScreen(node, file, diags) {
  // The whole rest of the line, not `words(...)[1]` — a signature is one
  // token only when it has no spaces, and `screen Detail(task, mode)` is the
  // spelling the reference, the tests and the linker's own UX203 fix line all
  // use. Splitting on whitespace registered that screen as `Detail(task,` and
  // produced three cascading errors whose fixes were unactionable (one of them
  // suggested renaming the screen to the name it already had). `flow` and
  // `component` read their signatures this way already.
  const signature = node.text.slice('screen'.length).trim();
  const parsed = parseTarget(signature);
  const screen = {
    kind: 'Screen',
    name: parsed?.name ?? signature,
    params: parsed?.args ?? [],
    line: node.line, file,
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
          'intent "why this screen exists"'));
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

// The elements that read `node.children`. Everything else in ELEMENT_KEYWORDS
// is a leaf, and gets UX021 when it is given a body — `group` is the keyword
// that wants an indented block, and it sits next to `heading` in every example,
// which is exactly why the slip is easy to make.
const CONTAINER_ELEMENTS = new Set(['group', 'if', 'form', 'list', 'tabs']);

function parseElement(node, file, diags) {
  const [keyword] = words(node.text);
  const rest = node.text.slice(keyword.length).trim();

  if (ELEMENT_KEYWORDS.includes(keyword) && !CONTAINER_ELEMENTS.has(keyword)) {
    noBody(node, keyword, file, diags, 'UX021',
      `out-dent them to sit beside \`${keyword}\`, or wrap them in \`group "…"\` if they belong together`);
  }

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
      const arrowChildren = node.children.filter(c => c.text.startsWith('->'));
      // `tabs` reads only its `->` children. Anything else indented under it
      // was filtered away and never seen again.
      for (const stray of node.children.filter(c => !c.text.startsWith('->'))) {
        diags.push(diag('UX021', file, stray.line,
          '`tabs` reads only its `->` destination, so this line is not part of the screen.',
          'out-dent it to sit beside `tabs`, or give the tab its own screen'));
      }
      if (arrowChildren.length > 1) {
        diags.push(diag('UX020', file, node.line,
          '`tabs` supports a single destination, but this one has more than one `->` child.',
          'give each tab its own screen and use `action "…" -> Screen` links for per-tab destinations — `tabs` takes one arrow for the whole bar, not one per tab'));
      }
      const target = arrowChildren[0]
        ? navTarget(arrowChildren[0].text.slice(2), 'tabs', file, arrowChildren[0].line, diags)
        : null;
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
        keywordFix(keyword, ELEMENT_KEYWORDS)));
      return null;
  }
}

// A destination the author wrote and `parseTarget` could not read.
//
// It used to be stored as `null` and then skipped by the linker's
// `if (!target) continue` — so `tap -> task-detail` did not become a dangling
// link, it became no link at all, and UX200 never ran. `action` escaped this
// only by accident, because UX109 independently reports an action with no
// target; the other four navigation sites had no such backstop. Note the
// asymmetry that made it convincing: `screen task-detail` is *accepted* as a
// declaration (a UX304 style warning at most), so the language says kebab
// names are legal-but-unstyled while every reference to one was deleted.
function navTarget(raw, what, file, line, diags) {
  const text = (raw ?? '').trim();
  const target = parseTarget(text);
  if (target) return target;

  diags.push(diag('UX023', file, line,
    text === ''
      ? `This \`${what}\` has \`->\` but no destination.`
      : `\`${text}\` is not a usable ${what} target.`,
    'name a screen or flow — letters, digits and `_`, starting with a letter, as in `Detail` or `Detail(task)`'));
  return null;
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
      // Only an arrow that is present but unreadable is UX023. A `submit` with
      // no `->` at all is a different question, and not this one.
      form.submit = {
        label: str ? str.value : null,
        target: right === null ? null : navTarget(right, 'submit', file, child.line, diags),
      };
      continue;
    }
    // `title required` -> { name: 'title', modifiers: ['required'] }. The
    // modifiers are kept, not enforced here — a form field's actual
    // requiredness comes from `data`'s own declaration; these are advisory
    // for the generator. Dropping them silently was the bug: nothing should
    // vanish a value the author wrote.
    const [name, ...modifiers] = words(child.text);
    form.fields.push({ name, modifiers, line: child.line });
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
    if (keyword === 'tap') {
      const { right } = splitArrow(child.text);
      list.tap = right === null ? null : navTarget(right, 'tap', file, child.line, diags);
      continue;
    }
    if (keyword === 'empty' || keyword === 'loading' || keyword === 'error') {
      list.states[keyword] = parseState(child.text, keyword, child.line);
      continue;
    }
    diags.push(diag('UX013', file, child.line,
      `\`${keyword}\` is not valid inside a list.`,
      keywordFix(keyword, LIST_KEYWORDS, LIST_DISPLAY)));
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
          '`set` needs a value.', 'set task.done = true'));
        return null;
      }
      const value = rest.slice(eq + 1).trim();
      if (value.startsWith('=')) {
        diags.push(diag('UX017', file, node.line,
          '`set` uses a single `=`, not `==`.', 'set task.done = true'));
        return null;
      }
      return { kind: 'Set', target: rest.slice(0, eq).trim(), value, line: node.line };
    }
    case 'call': {
      const target = parseTarget(rest) ?? parseDottedCall(rest);
      const branches = { ok: [], fail: [] };
      for (const child of node.children) {
        const [branchName] = words(child.text);
        if (branchName !== 'ok' && branchName !== 'fail') {
          // The last keyword position in the language that dropped a
          // near-miss without a word. Every other one — UX010, UX013, UX016,
          // UX018, UX019 — names what the author meant. The trigger is not
          // exotic: an over-indented ordinary step lands here too, so a plain
          // indentation slip used to delete a whole branch and its `go`.
          diags.push(diag('UX024', file, child.line,
            `\`${branchName}\` is not a branch of \`call\`.`,
            keywordFix(branchName, ['ok', 'fail'])));
          continue;
        }
        const body = splitArrow(child.text).right;
        if (!body) {
          diags.push(diag('UX019', file, child.line,
            `\`${branchName}\` needs \`->\` and a step.`,
            `${branchName} -> toast "Done"`));
          continue;
        }
        if (child.children.length > 0) {
          diags.push(diag('UX018', file, child.line,
            'A step inside an `ok`/`fail` branch cannot have its own branches.',
            'move these steps into their own `flow` and call it from here'));
        }
        const step = parseStep({ ...child, text: body, children: [] }, file, diags);
        if (step) branches[branchName].push(step);
      }
      return { kind: 'Call', name: target.name, args: target.args, ...branches, line: node.line };
    }
    case 'go':
      return { kind: 'Go', target: navTarget(rest, 'go', file, node.line, diags), line: node.line };
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
        keywordFix(keyword, FLOW_KEYWORDS)));
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
