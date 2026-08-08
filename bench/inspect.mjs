#!/usr/bin/env node
// bench/inspect.mjs — the fidelity half of the adoption benchmark made
// mechanical. See bench/README.md for the full procedure.
//
// `ux check` answers one question: does this project parse and does it
// obey the structural rules (every screen has an intent, every list has
// empty/loading/error, every navigation target exists)? It cannot answer
// the question that actually matters for adoption: does the parsed result
// mean what the prompt asked for? Task 11 found a project that answered
// "yes" to the first question and "no" to the second — a form's fields
// were all silently named `field` because the author copied SKILL.md's
// placeholder literally, and at the time nothing checked a form's field
// names against its data type.
//
// This script does not re-run that check (src/linker.js's UX206 does, now
// that it exists). It exists for everything UX206-shaped checks can't
// catch by construction: a field that happens to be a *real* name on the
// data type but the *wrong* one, a screen that exists but does nothing
// the prompt described, a list quietly pointed at the wrong data type's
// close cousin. Automated checks catch "this doesn't exist"; a human (or a
// model) comparing this summary against the original prompt catches "this
// exists but isn't what was meant."
//
// Usage:
//   node bench/inspect.mjs <project-dir>
//   node bench/inspect.mjs examples/tasks/ux
//
// Read-only: loads and links the project exactly as `ux check` does, and
// prints a summary. Writes nothing, modifies nothing.

import { loadProject } from '../src/project.js';
import { link } from '../src/linker.js';
import { renderDiagnostics } from '../src/report.js';

const dir = process.argv[2];
if (!dir) {
  process.stderr.write('usage: node bench/inspect.mjs <project-dir>\n');
  process.exit(1);
}

// Same shape as bin/ux's own guard around this call: a missing or
// unreadable directory is the ordinary first-run state (a prompt that
// produced no `.ux` files at all, or a typo'd path), not a crash — it
// should name the problem the way every other diagnostic in this project
// does, not dump a raw Node stack trace with local absolute paths in it.
let programs, parseDiags;
try {
  ({ programs, diags: parseDiags } = await loadProject(dir));
} catch (error) {
  process.stdout.write(`Could not read \`${dir}\`: ${error.message}\n  fix:  create a ${dir}/ directory with .ux files\n`);
  process.exit(1);
}
const linked = link(programs);
const allDiags = [...parseDiags, ...linked.diags];

const root = programs.map(p => p.root).find(Boolean);
const flows = new Map();
const components = new Map();
for (const program of programs) {
  for (const decl of program.decls) {
    if (decl.kind === 'Flow') flows.set(decl.name, decl);
    if (decl.kind === 'Component') components.set(decl.name, decl);
  }
}
const screens = [...linked.screens.values()].sort((a, b) => a.name.localeCompare(b.name));
const componentList = [...components.values()].sort((a, b) => a.name.localeCompare(b.name));
const flowList = [...flows.values()].sort((a, b) => a.name.localeCompare(b.name));

// mirrors linker.js's own constant — see its comment for why `retry` creates no edge
const BUILTIN_ACTIONS = new Set(['retry']);

const out = [];
const p = (s = '') => out.push(s);
const rule = () => p('-'.repeat(70));

// ---------------------------------------------------------------- header

p(`project: ${dir}`);
p(`app: ${root ? `${root.name} (${root.kind.toLowerCase()})` : '(no `app` or `site` declared)'}`);
p(`entry screen: ${linked.entry ?? '(none reachable)'}`);
p(`counts: ${screens.length} screen(s), ${countForms(screens, componentList)} form(s), ` +
  `${countLists(screens, componentList)} list(s), ${flowList.length} flow(s), ${componentList.length} component(s)`);
p();
p('PARSE CHECK  (what `ux check` reports)');
rule();
p(renderDiagnostics(allDiags));

// ---------------------------------------------------------------- screens

p();
p('SCREENS  (intent, and where each one leads)');
rule();
if (screens.length === 0) p('(none)');
for (const screen of screens) {
  const sig = screen.params.length ? `${screen.name}(${screen.params.join(', ')})` : screen.name;
  p();
  p(`  screen ${sig}`);
  if (screen.at) p(`    at: ${screen.at}`);
  if (screen.needs) p(`    needs: ${screen.needs}`);
  p(`    intent: ${screen.intent ? `"${screen.intent}"` : '(MISSING)'}`);

  const kinds = describeBody(screen.body);
  p(`    contains: ${kinds.length ? kinds.join(', ') : '(nothing)'}`);

  const leadsTo = leadsFrom(screen);
  p(`    leads to: ${leadsTo.length ? leadsTo.join(', ') : '(nowhere — dead end)'}`);
}

// ---------------------------------------------------------------- forms

p();
p('FORMS  (data type + the ACTUAL PARSED FIELD NAMES — read this against the prompt, not the .ux source)');
rule();
const allForms = [...ownedElements(screens, componentList, formsIn)];
if (allForms.length === 0) p('(none)');
for (const { owner, ownerKind, element: form } of allForms) {
  p();
  p(`  ${ownerKind} ${owner} -> form ${form.data || '(MISSING DATA TYPE)'}`);
  const rendered = form.fields.map(f =>
    f.modifiers.length ? `${f.name} (${f.modifiers.join(', ')})` : f.name);
  p(`    FIELDS: [${rendered.join(', ')}]`);
  for (const warning of formWarnings(form)) p(`    WARNING: ${warning}`);
  p(`    submit: ${form.submit
    ? `"${form.submit.label ?? ''}" -> ${form.submit.target ? targetStr(form.submit.target) : '(MISSING TARGET)'}`
    : '(MISSING)'}`);
}

// ---------------------------------------------------------------- lists

p();
p('LISTS  (data type, filter, and the row fields actually shown)');
rule();
const allLists = [...ownedElements(screens, componentList, listsIn)];
if (allLists.length === 0) p('(none)');
for (const { owner, ownerKind, element: list } of allLists) {
  p();
  p(`  ${ownerKind} ${owner} -> list ${list.data || '(MISSING DATA TYPE)'}`);
  if (list.where) p(`    where: ${list.where}`);
  if (list.sortBy) p(`    sort by: ${list.sortBy}`);
  p(`    row: [${list.row.join(', ')}]`);
  p(`    tap: ${list.tap ? targetStr(list.tap) : '(none)'}`);
  const states = ['empty', 'loading', 'error']
    .map(s => `${s}=${list.states[s] ? 'present' : 'MISSING'}`);
  p(`    states: ${states.join(', ')}`);
}

// ---------------------------------------------------------------- flows

p();
p('FLOWS  (every declared flow, its steps, and where it goes)');
rule();
if (flowList.length === 0) p('(none)');
for (const flow of flowList) {
  const sig = flow.params.length ? `${flow.name}(${flow.params.join(', ')})` : flow.name;
  p();
  p(`  flow ${sig}`);
  for (const line of flow.steps.map(s => stepStr(s, '    '))) p(line);
  const exits = flowExits(flow);
  p(`    goes to: ${exits.length ? exits.join(', ') : '(nowhere — returns to caller)'}`);
}

// ---------------------------------------------------------------- components

p();
p('COMPONENTS  (declared, and where they are actually used)');
rule();
if (componentList.length === 0) p('(none)');
for (const component of componentList) {
  const sig = component.params.length ? `${component.name}(${component.params.join(', ')})` : component.name;
  const usedBy = usersOf(component.name, screens, componentList);
  p();
  p(`  component ${sig}`);
  p(`    contains: ${describeBody(component.body).join(', ') || '(nothing)'}`);
  p(`    used by: ${usedBy.length ? usedBy.join(', ') : '(nowhere — declared but never used)'}`);
}

// ---------------------------------------------------------------- graph

p();
p('NAVIGATION GRAPH  (a target marked * is reachable only through a conditional if/else branch — see SCREENS above for which condition)');
rule();
const width = Math.max(0, ...screens.map(s => s.name.length));
for (const screen of screens) {
  const edges = resolvedEdges(screen);
  const targetNames = [...new Set(edges.map(e => e.to))].sort();
  const rendered = targetNames.map(name =>
    edges.filter(e => e.to === name).every(e => e.note) ? `${name}*` : name);
  p(`  ${screen.name.padEnd(width)} -> ${rendered.length ? rendered.join(' | ') : '(nowhere)'}`);
}

process.stdout.write(out.join('\n') + '\n');

// ==================================================================
// helpers — local, read-only tree walkers over the parsed AST. These
// duplicate small pieces of src/linker.js's private walkers on purpose:
// this file only reads `screen.body` / `component.body`, `flow.steps`,
// and `linked.screens` from the existing modules, and never reaches into
// their internals or modifies them. Navigation edges are walked and
// resolved locally (not read from `linked.edges`) specifically to keep
// each edge's enclosing `if`/`else` condition, which the linker's own
// edge model does not track — see `resolvedEdges` below.

// A screen's own navigation targets, walked directly from its body rather
// than read off `linked.edges` — the linker's edge model deliberately
// tracks no conditionality (see src/linker.js: that's not its job, and
// finding 2 of the Task 12 review is explicit that this file must not
// change that), so an edge that only exists inside an `if`/`else` branch
// looked identical there to an unconditional one. A cold reader of
// `examples/shop` read only this line and concluded "Add to cart" was
// reachable from any product page; it only exists `if product.stock > 0`,
// and the `else` branch offers no action at all. This walk carries the
// enclosing condition(s) alongside each target so that reading is no
// longer available.
function* navigationTargetsWithConditions(elements, context = []) {
  for (const el of elements) {
    if (el.kind === 'Action') yield { target: el.target, via: el.label ?? 'action', context };
    if (el.kind === 'Tabs') yield { target: el.target, via: 'tabs', context };
    if (el.kind === 'List') {
      if (el.tap) yield { target: el.tap, via: 'tap', context };
      for (const [state, value] of Object.entries(el.states)) {
        if (value?.action?.target) yield { target: value.action.target, via: `${state} state`, context };
      }
    }
    if (el.kind === 'Form' && el.submit?.target) {
      yield { target: el.submit.target, via: 'submit', context };
    }
    if (el.kind === 'Group') yield* navigationTargetsWithConditions(el.body, context);
    if (el.kind === 'If') {
      yield* navigationTargetsWithConditions(el.then, [...context, el.cond]);
      if (el.otherwise.length) {
        yield* navigationTargetsWithConditions(el.otherwise, [...context, `NOT (${el.cond})`]);
      }
    }
  }
}

// Resolves each raw navigation target to the screen(s) it actually leads
// to — following a `flow` target through to its own `go` steps, and
// dropping built-in actions, the same way linker.js's own edge-builder
// does (see `link()`'s main loop) — while keeping the conditional context
// each target carried on the way in.
function resolvedEdges(screen) {
  const edges = [];
  for (const { target, via, context } of navigationTargetsWithConditions(screen.body)) {
    if (!target || BUILTIN_ACTIONS.has(target.name)) continue;
    const note = context.length ? `only if ${context.join(' and ')}` : null;
    if (linked.screens.has(target.name)) {
      edges.push({ to: target.name, via, note });
      continue;
    }
    if (flows.has(target.name)) {
      for (const exit of flowExits(flows.get(target.name))) {
        edges.push({ to: exit, via: `flow ${target.name}`, note });
      }
      continue;
    }
    // Doesn't resolve to a screen or a flow — the project isn't parsing
    // clean (this is what `ux check` reports as UX200). Show it anyway,
    // labeled, rather than silently dropping a target that doesn't exist.
    edges.push({ to: `${target.name} (undeclared)`, via, note });
  }
  return edges;
}

function leadsFrom(screen) {
  return resolvedEdges(screen).map(e => `${e.to} (via ${e.via})${e.note ? ` [${e.note}]` : ''}`);
}

function targetStr(target) {
  if (!target) return '(none)';
  return target.args.length ? `${target.name}(${target.args.join(', ')})` : target.name;
}

// Describes a body's elements, expanding `if`/`else` inline instead of
// flattening it to a bare "if" kind — a reviewer reading only this line
// mistook a conditional "Add to cart" action for an unconditional one
// (finding 2, Task 12 review): the old version listed "if" and "action" as
// two independent, equally-weighted facts about the screen, with no way to
// tell the action *was* the if's then-branch. This makes that structure
// literal in the text: `if COND: then-contents / else: else-contents`.
// Deduped through a Set — screens with several plain `show`s still render
// as one `show`, but two different `if` conditions stay distinct entries.
function describeBody(elements) {
  const parts = [];
  for (const el of elements) {
    if (el.kind === 'Group') { parts.push('group', ...describeBody(el.body)); continue; }
    if (el.kind === 'If') {
      const then = describeBody(el.then).join(', ') || '(nothing)';
      let entry = `if ${el.cond}: ${then}`;
      if (el.otherwise.length) entry += ` / else: ${describeBody(el.otherwise).join(', ') || '(nothing)'}`;
      parts.push(entry);
      continue;
    }
    parts.push(el.kind.toLowerCase());
  }
  return [...new Set(parts)];
}

function* formsIn(elements) {
  for (const el of elements) {
    if (el.kind === 'Form') yield el;
    if (el.kind === 'Group') yield* formsIn(el.body);
    if (el.kind === 'If') { yield* formsIn(el.then); yield* formsIn(el.otherwise); }
  }
}

function* listsIn(elements) {
  for (const el of elements) {
    if (el.kind === 'List') yield el;
    if (el.kind === 'Group') yield* listsIn(el.body);
    if (el.kind === 'If') { yield* listsIn(el.then); yield* listsIn(el.otherwise); }
  }
}

function* useElementsIn(elements) {
  for (const el of elements) {
    if (el.kind === 'Use') yield el;
    if (el.kind === 'Group') yield* useElementsIn(el.body);
    if (el.kind === 'If') { yield* useElementsIn(el.then); yield* useElementsIn(el.otherwise); }
  }
}

// Yields { owner, ownerKind, element } for every element `find` locates
// inside any screen's or component's body — screens and components are
// the only two things in the language that own a body of elements.
function* ownedElements(screenList, componentListArg, find) {
  for (const screen of screenList) {
    for (const element of find(screen.body)) yield { owner: screen.name, ownerKind: 'screen', element };
  }
  for (const component of componentListArg) {
    for (const element of find(component.body)) yield { owner: component.name, ownerKind: 'component', element };
  }
}

function usersOf(componentName, screenList, componentListArg) {
  const users = [];
  for (const screen of screenList) {
    if ([...useElementsIn(screen.body)].some(u => u.component === componentName)) users.push(`screen ${screen.name}`);
  }
  for (const component of componentListArg) {
    if (component.name === componentName) continue;
    if ([...useElementsIn(component.body)].some(u => u.component === componentName)) users.push(`component ${component.name}`);
  }
  return users;
}

function countForms(screenList, componentListArg) {
  return [...ownedElements(screenList, componentListArg, formsIn)].length;
}

function countLists(screenList, componentListArg) {
  return [...ownedElements(screenList, componentListArg, listsIn)].length;
}

// The specific check Task 11 shows a clean parse can hide: a form whose
// field list has the same name more than once. It is exactly what
// happens when a placeholder word (`field`) — or any other word — gets
// copied on every line instead of the real field name. `UX108` (src/check.js)
// now catches exact duplicates at the language level; this warning stays
// for the same reason it existed before UX108 landed — as a redundant,
// human-readable signal — and normalises name/whitespace (`Field` vs
// `field`, a trailing space) so a near-miss UX108's exact-match doesn't
// also slip past this warning.
function formWarnings(form) {
  const warnings = [];
  const counts = new Map();
  for (const field of form.fields) {
    const key = field.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count > 1) {
      warnings.push(`field \`${name}\` is listed ${count} times (case/whitespace-insensitive) — likely a placeholder word copied on every line, not ${count} distinct fields`);
    }
  }
  return warnings;
}

function stepStr(step, indent) {
  switch (step.kind) {
    case 'Set':
      return `${indent}set ${step.target} = ${step.value}`;
    case 'Call': {
      const lines = [`${indent}call ${step.name}(${step.args.join(', ')})`];
      for (const s of step.ok) lines.push(`${indent}  ok   -> ${stepStr(s, '').trim()}`);
      for (const s of step.fail) lines.push(`${indent}  fail -> ${stepStr(s, '').trim()}`);
      return lines.join('\n');
    }
    case 'Go':
      return `${indent}go ${targetStr(step.target)}`;
    case 'Toast':
      return `${indent}toast "${step.text}"${step.undo ? ` undo ${step.undo}` : ''}`;
    case 'Confirm':
      return `${indent}confirm "${step.text}"`;
    case 'ErrorStep':
      return `${indent}error "${step.text}"`;
    default:
      return `${indent}${step.kind}`;
  }
}

// The screens a flow can land the user on, including `go` steps nested
// inside a `call`'s `ok`/`fail` branches (a flow with no `go` at all
// returns the user to wherever they called it from).
function flowExits(flow) {
  const names = new Set();
  walk(flow.steps);
  return [...names];
  function walk(steps) {
    for (const step of steps) {
      if (step.kind === 'Go' && step.target?.name) names.add(step.target.name);
      if (step.kind === 'Call') { walk(step.ok); walk(step.fail); }
    }
  }
}
