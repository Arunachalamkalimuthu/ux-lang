import { diag } from './diagnostics.js';
import { closestName } from './similar.js';
import { PRIMITIVE_TYPES } from './parser.js';

// Verbs a screen can send an `action` at that are handled by the runtime, not
// by the app's own navigation graph — so they need no declared `screen` or
// `flow`, and (deliberately) create no edge: they don't take the user
// anywhere, so they can't count as a screen's way out (UX202). Kept to a
// single entry on purpose; add another only when a real example needs it.
const BUILTIN_ACTIONS = new Set(['retry']);

export function link(programs) {
  const diags = [];
  const screens = new Map();
  const flows = new Map();
  const components = new Map();
  const dataTypes = new Set();
  const dataDecls = [];

  for (const program of programs) {
    for (const decl of program.decls) {
      if (decl.kind === 'Screen') registerDecl(screens, decl, diags);
      if (decl.kind === 'Flow') registerDecl(flows, decl, diags);
      if (decl.kind === 'Component') registerDecl(components, decl, diags);
      if (decl.kind === 'Data') { dataTypes.add(decl.name); dataDecls.push(decl); }
    }
  }

  // A project-wide fact, so it belongs here, not check.js: spec §5 says
  // `app` and `site` are mutually exclusive, and every project needs
  // exactly one — it's the thing that marks a project as authoring or
  // extraction. Neither declared, or more than one declared (whether two
  // `app`s, two `site`s, or one of each spread across files), left a
  // rootless or ambiguous project checking clean.
  const roots = programs
    .filter(program => program.root)
    .map(program => ({ file: program.file, root: program.root }));
  if (roots.length === 0) {
    diags.push(diag('UX111', programs[0]?.file ?? '(project)', 1,
      'This project declares no `app` or `site` root.',
      'add `app Name` to one file (authoring), or `site example.com` (extraction) — exactly one, project-wide'));
  } else if (roots.length > 1) {
    for (const { file, root } of roots) {
      diags.push(diag('UX111', file, root.line,
        `This project declares ${roots.length} roots (\`app\`/\`site\`), but \`app\` and \`site\` are mutually exclusive and only one is allowed project-wide.`,
        'keep a single `app` or `site` declaration across the whole project and delete the rest'));
    }
  }

  // A field's type resolves against every `data` in the project (primitive,
  // inline enum, or another `data` — possibly declared in a different file,
  // per spec §7's own `data/user.ux` + `data/task.ux` layout), so this
  // requires the complete `dataTypes` table above and cannot run until every
  // program has been scanned.
  for (const decl of dataDecls) {
    checkFieldTypes(decl, dataTypes, diags);
  }

  const dataByName = new Map(dataDecls.map(decl => [decl.name, decl]));

  const edges = [];

  for (const screen of screens.values()) {
    checkListDataTypes(screen.body, dataTypes, screen.file, diags);
    checkFormDataTypes(screen.body, dataTypes, dataByName, screen.file, diags);

    for (const { target, via, line } of navigationTargets(screen)) {
      if (!target) continue;
      if (BUILTIN_ACTIONS.has(target.name)) continue;

      if (screens.has(target.name)) {
        edges.push({ from: screen.name, to: target.name, via });
        checkArity(screen, target, screens.get(target.name), diags, line);
        continue;
      }
      if (flows.has(target.name)) {
        const flow = flows.get(target.name);
        for (const exitName of flowExits(flow)) {
          if (!screens.has(exitName)) continue;
          edges.push({ from: screen.name, to: exitName, via: `flow ${flow.name}` });
        }
        continue;
      }

      diags.push(diag('UX200', screen.file, line ?? screen.line,
        `\`${screen.name}\` links to \`${target.name}\`, which does not exist.`,
        `add \`screen ${target.name}\` or \`flow ${target.name}\`, or fix the spelling`));
    }

    for (const use of componentUses(screen)) {
      if (components.has(use.component)) continue;
      diags.push(diag('UX204', screen.file, use.line,
        `\`${use.component}\` is not a declared component.`,
        `component ${use.component}(…)`));
    }
  }

  // A flow's own `go` targets are navigation targets too — check them even
  // when no screen happens to invoke that flow.
  for (const flow of flows.values()) {
    for (const step of flowGoSteps(flow)) {
      const target = step.target;
      if (!target) continue;
      if (screens.has(target.name)) continue;
      diags.push(diag('UX200', flow.file, step.line,
        `\`${flow.name}\` links to \`${target.name}\`, which does not exist.`,
        `add \`screen ${target.name}\`, or fix the spelling`));
    }
  }

  // Components can `use` other components too, and can hold lists and forms of their own.
  for (const component of components.values()) {
    checkListDataTypes(component.body, dataTypes, component.file, diags);
    checkFormDataTypes(component.body, dataTypes, dataByName, component.file, diags);

    for (const use of componentUses(component)) {
      if (components.has(use.component)) continue;
      diags.push(diag('UX204', component.file, use.line,
        `\`${use.component}\` is not a declared component.`,
        `component ${use.component}(…)`));
    }
  }

  const entry = pickEntry(screens, edges);

  const reachable = new Set(entry ? [entry] : []);
  const queue = entry ? [entry] : [];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges.filter(e => e.from === current)) {
      if (reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      queue.push(edge.to);
    }
  }

  for (const screen of screens.values()) {
    if (!reachable.has(screen.name)) {
      diags.push(diag('UX201', screen.file, screen.line,
        `Nothing links to \`${screen.name}\`, so no one can reach it.`,
        `add an action on another screen:  action "…" -> ${screen.name}`));
    }

    // A self-loop ("Refresh" back to the same screen) is not a way out.
    const hasExit = edges.some(e => e.from === screen.name && e.to !== screen.name);
    if (!hasExit) {
      const other = [...screens.values()].find(s => s.name !== screen.name);
      const fix = other
        ? `add an action that leaves:  action "Back" -> ${other.name}`
        : 'add a second screen, then add an action that leaves this one for it';
      diags.push(diag('UX202', screen.file, screen.line,
        `\`${screen.name}\` has no way out — a user who lands here is stuck.`,
        fix));
    }
  }

  return { diags, screens, edges, entry };
}

// Registers `decl` under its name, unless another declaration of the same
// kind already claimed that name — in which case the first one wins and the
// duplicate is reported. `loadProject` sorts files, so "first" is
// deterministic across a real project.
function registerDecl(map, decl, diags) {
  const existing = map.get(decl.name);
  if (existing) {
    // Same-file duplicates are check.js's business (UX107) — it already sees
    // everything it needs without reading another file. UX205 exists for the
    // case a single file can't detect: the same name declared in *two
    // different* files. Reporting it here too, pointed at the file you're
    // already looking at, would restate UX107 under a code whose own message
    // ("already declared in `<file>`") names the very file you're in.
    if (existing.file !== decl.file) {
      diags.push(diag('UX205', decl.file, decl.line,
        `\`${decl.name}\` is already declared in \`${existing.file}\`.`,
        `rename one of the two \`${decl.name}\` declarations so the name is unique across the project`));
    }
    return;
  }
  map.set(decl.name, decl);
}

function pickEntry(screens, edges) {
  const list = [...screens.values()];
  const rooted = list.find(s => s.at === '/');
  if (rooted) return rooted.name;
  const targeted = new Set(edges.map(e => e.to));
  const orphan = list.find(s => !targeted.has(s.name));
  return orphan?.name ?? list[0]?.name ?? null;
}

// Every place a screen can send the user.
function* navigationTargets(screen) {
  yield* walk(screen.body);

  function* walk(elements) {
    for (const element of elements) {
      if (element.kind === 'Action') yield { target: element.target, via: element.label ?? 'action', line: element.line };
      if (element.kind === 'Tabs') yield { target: element.target, via: 'tabs', line: element.line };
      if (element.kind === 'List') {
        if (element.tap) yield { target: element.tap, via: 'tap', line: element.line };
        for (const state of Object.values(element.states)) {
          if (state?.action?.target) yield { target: state.action.target, via: 'state', line: state.action.line ?? element.line };
        }
      }
      if (element.kind === 'Form' && element.submit?.target) {
        yield { target: element.submit.target, via: 'submit', line: element.line };
      }
      if (element.kind === 'Group') yield* walk(element.body);
      if (element.kind === 'If') { yield* walk(element.then); yield* walk(element.otherwise); }
    }
  }
}

// A field's type is a primitive, an inline enum, or a reference to another
// declared `data` — and that last case is a project-wide name lookup, same
// as a list's data type below.
function checkFieldTypes(decl, dataTypes, diags) {
  for (const field of decl.fields) {
    if (field.type === 'enum' && Array.isArray(field.enum)) continue;
    if (PRIMITIVE_TYPES.has(field.type) || dataTypes.has(field.type)) continue;
    diags.push(diag('UX105', decl.file, field.line,
      `\`${field.type}\` is not a known type.`,
      `use a primitive (${[...PRIMITIVE_TYPES].slice(0, 5).join(', ')}, …), declare \`data ${field.type}\`, or use \`one of a | b\` for an enum`));
  }
}

// A `list`'s data type resolves across the whole project (spec R5: names
// resolve globally, no imports), so this is a linker concern, not
// check.js's — a project conventionally keeps `data` in its own file,
// separate from the screens whose lists reference it.
function checkListDataTypes(elements, dataTypes, file, diags) {
  for (const list of listElements(elements)) {
    if (list.data && !dataTypes.has(list.data)) {
      diags.push(diag('UX106', file, list.line,
        `\`${list.data}\` is not a declared data type.`,
        `data ${list.data}`));
    }
  }
}

function* listElements(elements) {
  for (const element of elements) {
    if (element.kind === 'List') yield element;
    if (element.kind === 'Group') yield* listElements(element.body);
    if (element.kind === 'If') { yield* listElements(element.then); yield* listElements(element.otherwise); }
  }
}

// A `form`'s data type resolves across the whole project the same way a
// `list`'s does (UX106) — and, once resolved, each field the form lists must
// actually exist on that `data` (UX206). Forms were never wired into either
// check before this: `parseForm` happily kept any first word as a field
// name, so a form could list fields that don't exist on its data type and
// nothing ever said so.
function checkFormDataTypes(elements, dataTypes, dataByName, file, diags) {
  for (const form of formElements(elements)) {
    if (!form.data) continue;
    if (!dataTypes.has(form.data)) {
      diags.push(diag('UX106', file, form.line,
        `\`${form.data}\` is not a declared data type.`,
        `data ${form.data}`));
      continue;
    }

    const decl = dataByName.get(form.data);
    const declaredNames = decl.fields.map(f => f.name);
    for (const field of form.fields) {
      if (declaredNames.includes(field.name)) continue;
      diags.push(diag('UX206', file, field.line ?? form.line,
        `\`${form.data}\` has no field \`${field.name}\`.`,
        formFieldFix(field.name, form.data, declaredNames)));
    }
  }
}

function* formElements(elements) {
  for (const element of elements) {
    if (element.kind === 'Form') yield element;
    if (element.kind === 'Group') yield* formElements(element.body);
    if (element.kind === 'If') { yield* formElements(element.then); yield* formElements(element.otherwise); }
  }
}

// Prefer a close-spelling suggestion when one is obviously the intended
// field; otherwise the more useful fix is just showing what is actually
// there, since the writer usually needs to see the real names, not guess.
function formFieldFix(name, dataName, declaredNames) {
  const close = closestName(name, declaredNames);
  const available = declaredNames.length
    ? `\`${dataName}\` has: ${declaredNames.join(', ')}`
    : `\`${dataName}\` declares no fields`;
  return close ? `did you mean \`${close}\`? ${available}` : available;
}


function* componentUses(owner) {
  yield* walk(owner.body);
  function* walk(elements) {
    for (const element of elements) {
      if (element.kind === 'Use') yield element;
      if (element.kind === 'Group') yield* walk(element.body);
      if (element.kind === 'If') { yield* walk(element.then); yield* walk(element.otherwise); }
    }
  }
}

// Every `Go` step in a flow, including those nested inside a `call`'s `ok`
// and `fail` branches.
function* flowGoSteps(flow) {
  yield* walk(flow.steps);
  function* walk(steps) {
    for (const step of steps) {
      if (step.kind === 'Go') yield step;
      if (step.kind === 'Call') { yield* walk(step.ok); yield* walk(step.fail); }
    }
  }
}

// The set of screen names a flow can land the user on. A flow with no `go`
// at all has no exits — it returns the user to wherever they called it from.
function flowExits(flow) {
  const names = new Set();
  for (const step of flowGoSteps(flow)) {
    if (step.target?.name) names.add(step.target.name);
  }
  return [...names];
}

function checkArity(from, target, declared, diags, line) {
  const expected = declaredParams(declared).length;
  if (target.args.length === expected) return;
  diags.push(diag('UX203', from.file, line ?? from.line,
    `\`${target.name}\` expects ${expected} argument(s) but \`${from.name}\` passes ${target.args.length}.`,
    `-> ${target.name}(${declaredParams(declared).join(', ')})`));
}

// `screen Detail(task)` — params live on the declaration.
function declaredParams(screen) {
  return screen.params ?? [];
}
