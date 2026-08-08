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

const { programs, diags: parseDiags } = await loadProject(dir);
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

  const kinds = elementKinds(screen.body);
  p(`    contains: ${kinds.length ? kinds.join(', ') : '(nothing)'}`);

  const leadsTo = leadsFrom(screen.name);
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
  p(`    contains: ${elementKinds(component.body).join(', ') || '(nothing)'}`);
  p(`    used by: ${usedBy.length ? usedBy.join(', ') : '(nowhere — declared but never used)'}`);
}

// ---------------------------------------------------------------- graph

p();
p('NAVIGATION GRAPH');
rule();
const width = Math.max(0, ...screens.map(s => s.name.length));
for (const screen of screens) {
  const targets = [...new Set(linked.edges.filter(e => e.from === screen.name).map(e => e.to))].sort();
  p(`  ${screen.name.padEnd(width)} -> ${targets.length ? targets.join(' | ') : '(nowhere)'}`);
}

process.stdout.write(out.join('\n') + '\n');

// ==================================================================
// helpers — local, read-only tree walkers over the parsed AST. These
// duplicate small pieces of src/linker.js's private walkers on purpose:
// this file only reads `screen.body` / `component.body`, `flow.steps`,
// and `linked.edges` from the existing modules, and never reaches into
// their internals.

function leadsFrom(screenName) {
  return linked.edges
    .filter(e => e.from === screenName)
    .map(e => `${e.to} (via ${e.via})`);
}

function targetStr(target) {
  if (!target) return '(none)';
  return target.args.length ? `${target.name}(${target.args.join(', ')})` : target.name;
}

function elementKinds(elements) {
  const seen = new Set();
  walk(elements);
  return [...seen];
  function walk(els) {
    for (const el of els) {
      seen.add(el.kind.toLowerCase());
      if (el.kind === 'Group') walk(el.body);
      if (el.kind === 'If') { walk(el.then); walk(el.otherwise); }
    }
  }
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
// copied on every line instead of the real field name. Since Task 11,
// UX206 catches the case where that repeated name isn't a real field on
// the data type at all; this catches the shape of the bug directly, so it
// still flags a repeated name even on the unlucky day it happens to match
// a real field.
function formWarnings(form) {
  const warnings = [];
  const counts = new Map();
  for (const field of form.fields) counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
  for (const [name, count] of counts) {
    if (count > 1) {
      warnings.push(`field \`${name}\` is listed ${count} times — likely a placeholder word copied on every line, not ${count} distinct fields`);
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
