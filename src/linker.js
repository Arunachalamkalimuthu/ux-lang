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
  // `data` went through a bare `Set.add` while every other declaration kind
  // went through `registerDecl`, so the same `data` name in two files silently
  // shadowed — last file won — and UX206 then reported a form field the author
  // *had* declared as not existing. Registering it the same way makes the
  // collision visible (UX205) and resolution first-wins like everything else.
  const dataDecls = new Map();

  // Two lists, deliberately. The maps hold the declaration each *name*
  // resolves to — first wins — and drive the graph. These hold every
  // declaration as written, and drive the per-declaration checks, because a
  // duplicate name used to hide the loser's own errors behind the UX205: its
  // dangling links and undeclared types were never looked at, even though it
  // is a real block of text in a real file that someone has to fix.
  const allScreens = [];
  const allComponents = [];
  const allData = [];

  for (const program of programs) {
    for (const decl of program.decls) {
      if (decl.kind === 'Screen') { allScreens.push(decl); registerDecl(screens, decl, diags); }
      if (decl.kind === 'Flow') registerDecl(flows, decl, diags);
      if (decl.kind === 'Component') { allComponents.push(decl); registerDecl(components, decl, diags); }
      if (decl.kind === 'Data') { allData.push(decl); registerDecl(dataDecls, decl, diags); }
    }
  }

  const dataTypes = new Set(dataDecls.keys());

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
  for (const decl of allData) {
    checkFieldTypes(decl, dataTypes, diags);
  }

  const dataByName = dataDecls;

  const edges = [];

  // One resolver for every navigation site in the project.
  //
  // `owner` is the declaration the line is written in — that is where a
  // diagnostic belongs. `from` is the screen the edge leaves, which for a link
  // a screen inherits from a component is the *screen*, not the component.
  // `report` is false for those inherited links, because the component's own
  // pass already reported them once, at the line they are written on.
  function resolveTarget(owner, from, { target, via, line }, report) {
    if (!target || BUILTIN_ACTIONS.has(target.name)) return;

    if (screens.has(target.name)) {
      if (from) edges.push({ from, to: target.name, via });
      if (report) checkArity(owner, target, screens.get(target.name).params ?? [], diags, line);
      return;
    }

    if (flows.has(target.name)) {
      const flow = flows.get(target.name);
      // Arity was checked only when a target resolved to a screen; a flow
      // invoked with the wrong number of arguments passed silently.
      if (report) checkArity(owner, target, flow.params ?? [], diags, line);
      for (const exitName of flowExits(flow)) {
        if (!screens.has(exitName)) continue;
        if (from) edges.push({ from, to: exitName, via: `flow ${flow.name}` });
      }
      return;
    }

    if (!report) return;
    diags.push(diag('UX200', owner.file, line ?? owner.line,
      `\`${owner.name}\` links to \`${target.name}\`, which does not exist.`,
      `add \`screen ${target.name}\` or \`flow ${target.name}\`, or fix the spelling`));
  }

  // `use Card(a, b)` against `component Card(x)` is the same mistake UX203
  // reports for a navigation target, and it went unchecked — UX204 asked only
  // whether the component existed.
  function checkUses(owner, diags) {
    for (const use of componentUses(owner)) {
      const component = components.get(use.component);
      if (!component) {
        diags.push(diag('UX204', owner.file, use.line,
          `\`${use.component}\` is not a declared component.`,
          `component ${use.component}(…)`));
        continue;
      }
      checkArity(owner, { name: use.component, args: use.args }, component.params ?? [], diags, use.line);
    }
  }

  // Two screens claiming one route is the ambiguity UX111 reports for the
  // project root, one level down: `pickEntry` silently takes the first, and
  // the other becomes a screen the router can never send anyone to.
  const byRoute = new Map();
  for (const screen of screens.values()) {
    const route = screen.at?.trim();
    if (!route) continue;
    const first = byRoute.get(route);
    if (first) {
      diags.push(diag('UX113', screen.file, screen.line,
        `\`${screen.name}\` and \`${first.name}\` both declare the route \`${route}\`.`,
        'give one of them a different route — a route names exactly one screen'));
      continue;
    }
    byRoute.set(route, screen);
  }

  for (const screen of allScreens) {
    // A shadowed duplicate still gets every check that is about the text in
    // front of you; what it does not get is edges, because the name resolves
    // to the declaration that claimed it first.
    const from = screens.get(screen.name) === screen ? screen.name : null;

    checkListDataTypes(screen.body, dataTypes, dataByName, screen.file, diags);
    checkFormDataTypes(screen.body, dataTypes, dataByName, screen.file, diags);

    for (const nav of navigationTargets(screen)) resolveTarget(screen, from, nav, true);
    for (const nav of inheritedTargets(screen, components)) resolveTarget(screen, from, nav, false);

    checkUses(screen, diags);
  }

  // A flow's own `go` targets are navigation targets too — check them even
  // when no screen happens to invoke that flow.
  for (const flow of flows.values()) {
    for (const step of flowGoSteps(flow)) {
      const target = step.target;
      if (!target) continue;
      if (screens.has(target.name)) {
        checkArity(flow, target, screens.get(target.name).params ?? [], diags, step.line);
        continue;
      }
      diags.push(diag('UX200', flow.file, step.line,
        `\`${flow.name}\` links to \`${target.name}\`, which does not exist.`,
        `add \`screen ${target.name}\`, or fix the spelling`));
    }
  }

  // Components can `use` other components too, and can hold lists and forms of their own.
  for (const component of allComponents) {
    checkListDataTypes(component.body, dataTypes, dataByName, component.file, diags);
    checkFormDataTypes(component.body, dataTypes, dataByName, component.file, diags);

    // A component's own `-> Name` links, reported once here at the line they
    // are written on. They build no edges of their own — a component is not a
    // place a user stands — so the edges are attributed to each screen that
    // uses it, above.
    for (const nav of navigationTargets(component)) resolveTarget(component, null, nav, true);

    checkUses(component, diags);
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

  // Which screens can get *back* to the entry. UX202 asks a local question —
  // does this screen have an outgoing edge — and a group of screens that only
  // point at each other answers yes while trapping the user in it: a two-step
  // checkout where Step1 and Step2 link to each other and neither returns to
  // Home checked completely clean. That is not a defect in UX202, whose
  // contract is written down as a per-screen test in four places, so it gets
  // its own code rather than a quiet redefinition of that one.
  const canReachEntry = new Set(entry ? [entry] : []);
  const backwards = new Map();
  for (const edge of edges) {
    if (!backwards.has(edge.to)) backwards.set(edge.to, []);
    backwards.get(edge.to).push(edge.from);
  }
  const backQueue = entry ? [entry] : [];
  while (backQueue.length) {
    for (const from of backwards.get(backQueue.shift()) ?? []) {
      if (canReachEntry.has(from)) continue;
      canReachEntry.add(from);
      backQueue.push(from);
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
      continue;
    }

    // Only for screens that do have a way out — one with none is already
    // UX202, and saying both about the same screen would be two names for the
    // one thing the reader has to fix.
    if (entry && !canReachEntry.has(screen.name)) {
      diags.push(diag('UX207', screen.file, screen.line,
        `\`${screen.name}\` has links out, but none of them lead back to \`${entry}\` — a user who comes here cannot return.`,
        `add an action that leaves the group:  action "Home" -> ${entry}`));
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

// Every place a component a screen uses can send the user, transitively.
//
// A shared nav or row component is the main reason to write a component at
// all, and its links were invisible here: the dangling ones were never
// reported, and the real ones never became edges — so a screen whose only way
// out lived in a component was called a dead end, its destination was called
// unreachable, and `ux map` drew neither. `lint.js` already counts a
// component's `-> Name` when deciding whether a flow is used; this brings the
// linker into line with it.
//
// `seen` guards the component graph, which the language does not stop from
// containing a cycle: a component may `use` itself, or two may use each other.
function* inheritedTargets(owner, components, seen = new Set()) {
  for (const use of componentUses(owner)) {
    const component = components.get(use.component);
    if (!component || seen.has(component.name)) continue;
    seen.add(component.name);
    yield* navigationTargets(component);
    yield* inheritedTargets(component, components, seen);
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
function checkListDataTypes(elements, dataTypes, dataByName, file, diags) {
  for (const list of listElements(elements)) {
    // A `form` with no data name is UX110; a `list` with no data name used to
    // be accepted, because the guard here was `if (list.data && …)` and the
    // parser stores the missing name as `''`. Same omission, same severity.
    if (!list.data) {
      diags.push(diag('UX112', file, list.line,
        'This `list` has no data name.',
        'list DataName'));
      continue;
    }
    if (!dataTypes.has(list.data)) {
      diags.push(diag('UX106', file, list.line,
        `\`${list.data}\` is not a declared data type.`,
        `data ${list.data}`));
      continue;
    }
    checkListFields(list, dataByName.get(list.data), file, diags);
  }
}

// Only a bare name can be resolved against a `data` block. `row product.name`
// walks a relation, `sort by due desc` carries a direction, and an expression
// is not a field — none of those are this check's business, and guessing at
// them would trade a silent miss for a false positive, which is worse.
const BARE_FIELD = /^[A-Za-z][A-Za-z0-9_]*$/;

// `row` and `sort by` name fields on the list's data type, exactly as a form's
// field lines do — and the identical typo was a hard UX206 error in a form and
// silent here. Half the data-binding surface went unvalidated, which is worse
// than none of it: a reader who has seen UX206 fire reasonably concludes that
// stale field references are caught project-wide.
function checkListFields(list, decl, file, diags) {
  const declaredNames = decl.fields.map(f => f.name);
  const sortKey = list.sortBy?.replace(/\s+(asc|desc)$/i, '').trim();
  const referenced = [...list.row, ...(sortKey ? [sortKey] : [])];

  for (const name of referenced) {
    if (!BARE_FIELD.test(name) || declaredNames.includes(name)) continue;
    diags.push(diag('UX206', file, list.line,
      `\`${decl.name}\` has no field \`${name}\`.`,
      formFieldFix(name, decl.name, declaredNames)));
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

// `screen Detail(task)` and `flow archive(task)` — params live on the
// declaration, and both kinds are checked. Taking the parameter list rather
// than the declaration is what lets a flow target reuse this.
function checkArity(from, target, params, diags, line) {
  if (target.args.length === params.length) return;
  diags.push(diag('UX203', from.file, line ?? from.line,
    `\`${target.name}\` expects ${params.length} argument(s) but \`${from.name}\` passes ${target.args.length}.`,
    `-> ${target.name}(${params.join(', ')})`));
}
