import { diag } from './diagnostics.js';

const STATE_RULES = [
  ['empty', 'UX102', 'empty "Nothing here yet."'],
  ['loading', 'UX103', 'loading skeleton 3 rows'],
  ['error', 'UX104', 'error "Could not load this."'],
];

// check.js owns *structure*: is this screen well-formed, does this list
// declare its states, is a name reused within one file. Whether a name that
// is *referenced* actually exists anywhere in the project — a list's data
// type (UX106), a field's data-type reference (UX105), a navigation target
// (UX200) — is a linker concern, because "exists" can only be answered once
// every file has been read. See linker.js.
export function check(ast) {
  const diags = [];
  const file = ast.file;

  const seen = new Set();
  for (const decl of ast.decls) {
    if (seen.has(decl.name)) {
      diags.push(diag('UX107', file, decl.line,
        `\`${decl.name}\` is declared twice in this file.`,
        'rename one of them, or delete the duplicate'));
    }
    seen.add(decl.name);

    if (decl.kind === 'Screen') checkScreen(decl, file, diags);
    if (decl.kind === 'Component') checkElements(decl.body, file, diags);
  }

  return diags;
}

function checkScreen(screen, file, diags) {
  if (!screen.intent) {
    diags.push(diag('UX100', file, screen.line,
      `Screen \`${screen.name}\` has no intent.`,
      `intent "why this screen exists"`));
  }
  if (screen.body.length === 0) {
    diags.push(diag('UX101', file, screen.line,
      `Screen \`${screen.name}\` has no content.`,
      'add at least one element, for example:  text "…"'));
  }
  checkElements(screen.body, file, diags);
}

function checkElements(elements, file, diags) {
  for (const element of elements) {
    if (element.kind === 'Group') checkElements(element.body, file, diags);
    if (element.kind === 'If') {
      checkElements(element.then, file, diags);
      checkElements(element.otherwise, file, diags);
    }
    if (element.kind !== 'List') continue;

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
