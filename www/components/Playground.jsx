'use client';

import { useEffect, useRef, useState } from 'react';

// These are the toolchain's own modules, imported directly out of `src/`. Not a
// copy, not a build artefact — the same files `bin/ux` imports.
//
// It works because only `src/project.js` touches the filesystem; everything
// else is a pure function over strings. That property is what made the
// playground possible in the first place, and it is worth protecting: the
// moment a checker reaches for `node:fs`, this page stops being able to prove
// it runs the real thing.
import { parse } from '../../src/parser.js';
import { check } from '../../src/check.js';
import { link } from '../../src/linker.js';

// Mirrors the ordering in `bin/ux`. Ordering is a presentation concern rather
// than part of what a diagnostic is, so it lives outside `src/` in both places;
// the diagnostics themselves come from the real modules above.
const LEXICAL = new Set(['UX001', 'UX002', 'UX003', 'UX004']);

function sortDiagnostics(diags) {
  return [...diags].sort((a, b) => {
    const phase = Number(LEXICAL.has(b.code)) - Number(LEXICAL.has(a.code));
    if (phase !== 0) return phase;
    return a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code);
  });
}

const SAMPLE = `app Tasks

data Task
  title  text  required
  done   bool  = false
  due    date?

screen Inbox
  at /
  intent "See what's due and clear it"

  list Task where not done
    sort by due
    row   title, due
    tap   -> Detail(task)
    empty   "All clear."
    loading skeleton 3 rows
    error   "Couldn't load." action retry

  action "New task" -> NewTask

screen Detail(task)
  intent "Read one task and finish it"
  show task.title

screen NewTask
  intent "Capture a task in one step"
  form Task
    title required
    due
    submit "Create" -> create(task)
  action "Cancel" -> Inbox

flow create(task)
  call api.create(task)
    ok   -> toast "Task added"
    fail -> error "Couldn't create that."
  go Inbox
`;

const VARIANTS = {
  deadend: s => s.replace('  show task.title\n', '  show task.title\n  action "Back" -> Inbox\n'),
  typo: s => s.replace('tap   -> Detail(task)', 'tap   -> Detials(task)'),
  states: s => s.replace('    loading skeleton 3 rows\n', ''),
  reset: () => SAMPLE,
};

function analyse(source) {
  try {
    const { ast, diags: parseDiags } = parse(source, 'ux/app.ux');
    return {
      diags: sortDiagnostics([...parseDiags, ...check(ast), ...link([ast]).diags]),
      crashed: null,
    };
  } catch (error) {
    return { diags: [], crashed: error?.message ?? String(error) };
  }
}

export default function Playground() {
  const [source, setSource] = useState(SAMPLE);
  const [result, setResult] = useState(() => analyse(SAMPLE));
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(analyse(source)), 140);
    return () => clearTimeout(timer.current);
  }, [source]);

  const { diags, crashed } = result;
  const errors = diags.filter(d => d.severity === 'error').length;
  const warnings = diags.length - errors;
  const lexical = diags.filter(d => LEXICAL.has(d.code)).length;

  let chip = { text: 'clean', className: 'chip good' };
  if (crashed) chip = { text: 'error', className: 'chip bad' };
  else if (errors > 0) chip = { text: `${errors} error${errors === 1 ? '' : 's'}`, className: 'chip bad' };
  else if (warnings > 0) chip = { text: `${warnings} warning${warnings === 1 ? '' : 's'}`, className: 'chip' };

  return (
    <>
      <div className="pg">
        <div className="pane">
          <div className="pane-head"><span>ux/app.ux</span><span className={chip.className}>{chip.text}</span></div>
          <textarea
            id="src"
            spellCheck={false}
            aria-label="Editable .ux source"
            value={source}
            onChange={event => setSource(event.target.value)}
          />
        </div>
        <div className="pane">
          <div className="pane-head"><span>ux check</span><span>live</span></div>
          <pre id="out" aria-live="polite" aria-atomic="true">
            {crashed && <span className="d-code">The playground hit an unexpected error.{'\n'}{crashed}</span>}

            {!crashed && diags.length === 0 && <span className="d-clean">No problems found.</span>}

            {!crashed && lexical > 0 && (
              <span className="d-banner">
                {lexical} lexical error(s). Fix these first — anything below may be derived from a broken line.
              </span>
            )}

            {!crashed && diags.map((d, i) => (
              <span key={`${d.code}-${d.line}-${i}`}>
                <span className="d-where">{d.file}:{d.line}</span>{'  '}
                <span className="d-code">{d.code}</span>{'  '}{d.message}{'\n'}
                {'  '}<span className="d-fix">fix:  {d.fix}</span>{'\n\n'}
              </span>
            ))}

            {!crashed && diags.length > 0 && (
              <span className="d-where">{errors} error(s), {warnings} warning(s)</span>
            )}
          </pre>
        </div>
      </div>

      <div className="tryline">
        {[
          ['deadend', 'Give Detail a way out'],
          ['typo', 'Break a link'],
          ['states', 'Drop a list state'],
          ['reset', 'Reset'],
        ].map(([key, label]) => (
          <button key={key} className="try" onClick={() => setSource(current => VARIANTS[key](current))}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
