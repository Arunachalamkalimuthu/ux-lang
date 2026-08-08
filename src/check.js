import { diag } from './diagnostics.js';
import { PRIMITIVE_TYPES } from './parser.js';

const STATE_RULES = [
  ['empty', 'UX102', 'empty "Nothing here yet."'],
  ['loading', 'UX103', 'loading skeleton 3 rows'],
  ['error', 'UX104', 'error "Could not load this."'],
];

export function check(ast) {
  const diags = [];
  const file = ast.file;
  const dataNames = new Set(ast.decls.filter(d => d.kind === 'Data').map(d => d.name));

  const seen = new Set();
  for (const decl of ast.decls) {
    if (seen.has(decl.name)) {
      diags.push(diag('UX107', file, decl.line,
        `\`${decl.name}\` is declared twice in this file.`,
        'rename one of them, or delete the duplicate'));
    }
    seen.add(decl.name);

    if (decl.kind === 'Data') checkData(decl, dataNames, file, diags);
    if (decl.kind === 'Screen') checkScreen(decl, dataNames, file, diags);
    if (decl.kind === 'Component') checkElements(decl.body, dataNames, file, diags);
  }

  return diags;
}

function checkData(decl, dataNames, file, diags) {
  for (const field of decl.fields) {
    if (field.type === 'enum') continue;
    if (PRIMITIVE_TYPES.has(field.type) || dataNames.has(field.type)) continue;
    diags.push(diag('UX105', file, field.line,
      `\`${field.type}\` is not a known type.`,
      `use a primitive (${[...PRIMITIVE_TYPES].slice(0, 5).join(', ')}, …) or declare \`data ${field.type}\``));
  }
}

function checkScreen(screen, dataNames, file, diags) {
  if (!screen.intent) {
    diags.push(diag('UX100', file, screen.line,
      `Screen \`${screen.name}\` has no intent.`,
      `add:  intent "why this screen exists"`));
  }
  if (screen.body.length === 0) {
    diags.push(diag('UX101', file, screen.line,
      `Screen \`${screen.name}\` has no content.`,
      'add at least one element, for example:  text "…"'));
  }
  checkElements(screen.body, dataNames, file, diags);
}

function checkElements(elements, dataNames, file, diags) {
  for (const element of elements) {
    if (element.kind === 'Group') checkElements(element.body, dataNames, file, diags);
    if (element.kind === 'If') {
      checkElements(element.then, dataNames, file, diags);
      checkElements(element.otherwise, dataNames, file, diags);
    }
    if (element.kind !== 'List') continue;

    if (element.data && !dataNames.has(element.data)) {
      diags.push(diag('UX106', file, element.line,
        `\`${element.data}\` is not a declared data type.`,
        `add:  data ${element.data}`));
    }

    for (const [state, code, suggestion] of STATE_RULES) {
      if (element.states[state]) continue;
      diags.push(diag(code, file, element.line,
        `This list has no \`${state}\` case. Every list must say what happens when it is ${describe(state)}.`,
        suggestion));
    }
  }
}

function describe(state) {
  if (state === 'empty') return 'empty';
  if (state === 'loading') return 'still loading';
  return 'unable to load';
}
