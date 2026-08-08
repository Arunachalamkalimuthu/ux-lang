import { diag } from './diagnostics.js';

export function link(programs) {
  const diags = [];
  const screens = new Map();
  const flows = new Map();
  const components = new Map();

  for (const program of programs) {
    for (const decl of program.decls) {
      if (decl.kind === 'Screen') registerDecl(screens, decl, diags);
      if (decl.kind === 'Flow') registerDecl(flows, decl, diags);
      if (decl.kind === 'Component') registerDecl(components, decl, diags);
    }
  }

  const edges = [];

  for (const screen of screens.values()) {
    for (const { target, via } of navigationTargets(screen)) {
      if (!target) continue;

      if (screens.has(target.name)) {
        edges.push({ from: screen.name, to: target.name, via });
        checkArity(screen, target, screens.get(target.name), diags);
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

      diags.push(diag('UX200', screen.file, screen.line,
        `\`${screen.name}\` links to \`${target.name}\`, which does not exist.`,
        `add \`screen ${target.name}\` or \`flow ${target.name}\`, or fix the spelling`));
    }

    for (const use of componentUses(screen)) {
      if (components.has(use.component)) continue;
      diags.push(diag('UX204', screen.file, use.line,
        `\`${use.component}\` is not a declared component.`,
        `add:  component ${use.component}(…)`));
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

  // Components can `use` other components too.
  for (const component of components.values()) {
    for (const use of componentUses(component)) {
      if (components.has(use.component)) continue;
      diags.push(diag('UX204', component.file, use.line,
        `\`${use.component}\` is not a declared component.`,
        `add:  component ${use.component}(…)`));
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
    diags.push(diag('UX205', decl.file, decl.line,
      `\`${decl.name}\` is already declared in \`${existing.file}\`.`,
      `rename one of the two \`${decl.name}\` declarations so the name is unique across the project`));
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
      if (element.kind === 'Action') yield { target: element.target, via: element.label ?? 'action' };
      if (element.kind === 'Tabs') yield { target: element.target, via: 'tabs' };
      if (element.kind === 'List') {
        if (element.tap) yield { target: element.tap, via: 'tap' };
        for (const state of Object.values(element.states)) {
          if (state?.action?.target) yield { target: state.action.target, via: 'state' };
        }
      }
      if (element.kind === 'Form' && element.submit?.target) {
        yield { target: element.submit.target, via: 'submit' };
      }
      if (element.kind === 'Group') yield* walk(element.body);
      if (element.kind === 'If') { yield* walk(element.then); yield* walk(element.otherwise); }
    }
  }
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

function checkArity(from, target, declared, diags) {
  const expected = declaredParams(declared).length;
  if (target.args.length === expected) return;
  diags.push(diag('UX203', from.file, from.line,
    `\`${target.name}\` expects ${expected} argument(s) but \`${from.name}\` passes ${target.args.length}.`,
    `write:  -> ${target.name}(${declaredParams(declared).join(', ')})`));
}

// `screen Detail(task)` — params live on the declaration.
function declaredParams(screen) {
  return screen.params ?? [];
}
