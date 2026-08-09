import { diag, WARNING } from './diagnostics.js';

// Lint: things that are valid but probably not what you meant.
//
// The boundary against the other two layers is the severity, not the subject.
// `check.js` and `linker.js` report what is *wrong* — a file that trips them
// is broken and the build fails. Everything here describes a program that
// works: it parses, it links, it would run. So these are WARNING, they never
// affect an exit code unless the caller asks with --strict, and every one of
// them has a legitimate exception. A lint rule that cannot be ignored is an
// error wearing the wrong label.
//
// This is also what the WARNING severity was for. It has existed since the
// first commit, exported and used by nothing, so every run of the tool has
// ended `0 warning(s)` since the day it was written.

const PLACEHOLDER_INTENTS = new Set(['todo', 'tbd', 'screen', 'page', 'wip', 'fixme', '...']);

export function lint(programs) {
  const diags = [];
  const decls = programs.flatMap(p => p.decls);

  const screens = decls.filter(d => d.kind === 'Screen');
  const owners = decls.filter(d => d.kind === 'Screen' || d.kind === 'Component');

  // One pass to collect every name the program refers to, so each rule below
  // is a set lookup rather than another walk.
  const referencedTypes = new Set();
  const navTargets = new Set();
  const componentUses = new Map();

  for (const decl of decls) {
    if (decl.kind === 'Data') {
      // A data type used only as another type's field is still used.
      for (const field of decl.fields) if (field.type) referencedTypes.add(field.type);
    }
  }

  for (const owner of owners) {
    for (const element of walk(owner.body)) {
      if (element.kind === 'List' && element.data) referencedTypes.add(element.data);
      if (element.kind === 'Form' && element.data) referencedTypes.add(element.data);
      if (element.kind === 'Use' && element.component) {
        const users = componentUses.get(element.component) ?? [];
        users.push(owner);
        componentUses.set(element.component, users);
      }
      for (const target of targetsOf(element)) navTargets.add(target);
    }
  }

  checkUnusedData(decls, referencedTypes, diags);
  checkUnusedFlows(decls, navTargets, diags);
  checkLonelyComponents(decls, componentUses, diags);
  checkIntents(screens, diags);
  checkNaming(decls, diags);
  checkInertLists(owners, diags);

  return diags;
}

// ---- rules ---------------------------------------------------------------

function checkUnusedData(decls, referenced, diags) {
  for (const decl of decls) {
    if (decl.kind !== 'Data' || referenced.has(decl.name)) continue;
    diags.push(diag('UX300', decl.file, decl.line,
      `Nothing uses \`${decl.name}\`.`,
      `list or form over it, reference it from another data type, or delete it`,
      WARNING));
  }
}

function checkUnusedFlows(decls, navTargets, diags) {
  for (const decl of decls) {
    if (decl.kind !== 'Flow' || navTargets.has(decl.name)) continue;
    diags.push(diag('UX301', decl.file, decl.line,
      `Nothing invokes \`${decl.name}\`.`,
      `point an action at it:  action "…" -> ${decl.name}(…)`,
      WARNING));
  }
}

// The format's guidance is that a component earns *its own file* at three or
// more users — the cost being paid is the reader's, in files they must open to
// understand one screen. So a single-user component is only a smell when it
// lives somewhere else: declared beside its one user it costs nothing, and
// pulling it into its own file to be used once is the split that hurts.
function checkLonelyComponents(decls, uses, diags) {
  for (const decl of decls) {
    if (decl.kind !== 'Component') continue;
    const users = uses.get(decl.name) ?? [];
    if (users.length !== 1 || users[0].file === decl.file) continue;
    diags.push(diag('UX302', decl.file, decl.line,
      `\`${decl.name}\` has its own file but only \`${users[0].name}\` uses it.`,
      `move it into ${users[0].file}, or use it from a third screen before splitting it out`,
      WARNING));
  }
}

// `intent` is required, so the pressure is to write *something*. A line that
// restates the screen's own name, or that two screens share, costs a reader
// the one thing the field exists to give them.
function checkIntents(screens, diags) {
  const byIntent = new Map();

  for (const screen of screens) {
    if (!screen.intent) continue;
    const normalised = screen.intent.trim().toLowerCase();

    if (PLACEHOLDER_INTENTS.has(normalised) || normalised === screen.name.toLowerCase()) {
      diags.push(diag('UX303', screen.file, screen.line,
        `\`${screen.name}\`'s intent doesn't say anything its name didn't.`,
        'say why someone comes here, not what the screen is called',
        WARNING));
      continue;
    }

    const seen = byIntent.get(normalised);
    if (seen) {
      diags.push(diag('UX303', screen.file, screen.line,
        `\`${screen.name}\` and \`${seen.name}\` have the same intent.`,
        'if they really do the same thing, one of them may be unnecessary',
        WARNING));
    } else {
      byIntent.set(normalised, screen);
    }
  }
}

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;

function checkNaming(decls, diags) {
  for (const decl of decls) {
    const isType = decl.kind === 'Data' || decl.kind === 'Screen' || decl.kind === 'Component';

    if (isType && decl.name && !PASCAL.test(decl.name)) {
      diags.push(diag('UX304', decl.file, decl.line,
        `\`${decl.name}\` is not PascalCase.`,
        `rename it to \`${toPascal(decl.name)}\``,
        WARNING));
    }

    if (decl.kind === 'Flow' && decl.name && !CAMEL.test(decl.name)) {
      diags.push(diag('UX304', decl.file, decl.line,
        `Flow \`${decl.name}\` is not camelCase.`,
        `rename it to \`${toCamel(decl.name)}\``,
        WARNING));
    }

    if (decl.kind === 'Data') {
      for (const field of decl.fields) {
        if (!field.name || CAMEL.test(field.name)) continue;
        diags.push(diag('UX304', decl.file, field.line,
          `Field \`${field.name}\` is not camelCase.`,
          `rename it to \`${toCamel(field.name)}\``,
          WARNING));
      }
    }
  }
}

// A list with nothing to tap and no action in any of its states is a wall of
// rows a person can look at and not touch. Sometimes that is exactly right —
// a read-only summary — which is why it warns rather than fails.
function checkInertLists(owners, diags) {
  for (const owner of owners) {
    for (const element of walk(owner.body)) {
      if (element.kind !== 'List' || element.tap) continue;
      const stateAction = Object.values(element.states).some(s => s?.action?.target);
      if (stateAction) continue;
      diags.push(diag('UX305', owner.file, element.line,
        'Nothing in this list can be acted on.',
        `add:  tap -> SomeScreen(${(element.data ?? 'item').toLowerCase()})`,
        WARNING));
    }
  }
}

// ---- shared walking ------------------------------------------------------

function* walk(elements) {
  for (const element of elements ?? []) {
    yield element;
    if (element.kind === 'Group') yield* walk(element.body);
    if (element.kind === 'If') { yield* walk(element.then); yield* walk(element.otherwise); }
  }
}

// Every name an element can point at, whether it turns out to be a screen or
// a flow — lint only needs to know the name was mentioned.
function* targetsOf(element) {
  if (element.kind === 'Action' && element.target) yield element.target.name;
  if (element.kind === 'Tabs' && element.target) yield element.target.name;
  if (element.kind === 'Form' && element.submit?.target) yield element.submit.target.name;
  if (element.kind === 'List') {
    if (element.tap) yield element.tap.name;
    for (const state of Object.values(element.states)) {
      if (state?.action?.target) yield state.action.target.name;
    }
  }
}

const words = name => name.split(/[-_\s]+/).filter(Boolean);
const capitalise = w => w[0].toUpperCase() + w.slice(1);

function toPascal(name) {
  return words(name).map(capitalise).join('') || name;
}

function toCamel(name) {
  const [first, ...rest] = words(name);
  if (!first) return name;
  return first[0].toLowerCase() + first.slice(1) + rest.map(capitalise).join('');
}
