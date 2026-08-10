import { diag } from './diagnostics.js';

// The one walk that decides what "inside a string" means for a raw line —
// used both to strip a trailing `#` comment (stop at `#` only when *not*
// inside a string) and to detect an unterminated string (UX004: still
// inside a string when the line ends). These two questions must be answered
// by the same loop, not two loops that can silently drift apart — that
// drift is exactly how UX004 first shipped broken: a first draft counted
// `"` characters on the whole raw line, which also counts a `"` that
// appears *inside a `#` comment* and has nothing to do with an unterminated
// string, rejecting correct programs like `intent "Land"   # use " to quote`.
// A `#` reached while already inside a string does *not* end the scan (it's
// just a character inside the string), so `text "Nothing overdue # ok`
// (no closing quote) is still correctly flagged: the walk never reaches a
// point where it's "not in a string" before running off the end of the line.
// Tabs become two spaces so the depth the parser computes matches the depth a
// reader sees — but only outside a string. A tab *inside* a string literal is
// a character the author wrote: replacing it silently changed the value, and
// UX001 told them their indentation was wrong when nothing about their
// indentation was. Exported so `format.js` normalises tabs by this exact rule
// and not a second copy of it; the formatter's whole contract is that it
// cannot change the parse, which two implementations of this would eventually
// break.
export function expandTabs(text) {
  let out = '';
  let inString = false;
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    if (ch === '\t' && !inString) { out += '  '; continue; }
    out += ch;
  }
  return out;
}

function scanLine(text) {
  let stripped = '';
  let inString = false;
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    if (ch === '#' && !inString) break;
    stripped += ch;
  }
  return { stripped, unterminated: inString };
}

export function lex(source, file) {
  const diags = [];
  const lines = [];
  let previousDepth = -1;

  // A byte-order mark is an encoding marker, not content. Left in place it
  // became a one-character indent on line 1 — UX002, "Indent of 1 spaces is
  // not a multiple of 2", with a fix ("use 0 spaces") the file already
  // satisfied, on a file that looks correct in every editor.
  source.replace(/^﻿/, '').split('\n').forEach((raw, index) => {
    const line = index + 1;

    const expanded = expandTabs(raw);
    if (expanded !== raw) {
      diags.push(diag('UX001', file, line,
        'Tabs cannot be used for indentation.',
        'replace each tab with two spaces'));
    }

    const { stripped, unterminated } = scanLine(expanded);
    if (unterminated) {
      diags.push(diag('UX004', file, line,
        `Line ${line} has an unterminated string (a \`"\` is opened but never closed outside any \`#\` comment).`,
        'close the string with a matching `"`'));
    }

    const text = stripped.trim();
    if (text === '') return;

    const indent = stripped.length - stripped.trimStart().length;
    if (indent % 2 !== 0) {
      // Floor, matching the depth the lexer actually assigns below. Rounding
      // reads as friendlier — 3 spaces "looks like" it wanted 4 — but it made
      // the fix line change the parse: at 3 spaces the line is already nested
      // one level, and following the advice to use 4 silently nested it two.
      // A `fix:` that alters meaning is worse than no fix, because the whole
      // contract is that you can apply it without thinking.
      const suggestion = Math.floor(indent / 2) * 2;
      diags.push(diag('UX002', file, line,
        `Indent of ${indent} spaces is not a multiple of 2.`,
        `use ${suggestion} spaces`));
    }

    const depth = Math.floor(indent / 2);
    if (depth > previousDepth + 1) {
      diags.push(diag('UX003', file, line,
        `This line is indented ${depth} levels, but the line above is at ${previousDepth}.`,
        `indent it ${(previousDepth + 1) * 2} spaces`));
    }

    lines.push({ depth, text, line, file });
    previousDepth = depth;
  });

  return { lines, diags };
}

export function treeify(lines) {
  const root = { depth: -1, text: '<root>', children: [] };
  const stack = [root];

  for (const entry of lines) {
    const node = { ...entry, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root;
}
