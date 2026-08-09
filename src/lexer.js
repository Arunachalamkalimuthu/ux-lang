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

  source.split('\n').forEach((raw, index) => {
    const line = index + 1;

    if (raw.includes('\t')) {
      diags.push(diag('UX001', file, line,
        'Tabs cannot be used for indentation.',
        'replace each tab with two spaces'));
    }

    const { stripped, unterminated } = scanLine(raw.replace(/\t/g, '  '));
    if (unterminated) {
      diags.push(diag('UX004', file, line,
        `Line ${line} has an unterminated string (a \`"\` is opened but never closed outside any \`#\` comment).`,
        'close the string with a matching `"`'));
    }

    const text = stripped.trim();
    if (text === '') return;

    const indent = stripped.length - stripped.trimStart().length;
    if (indent % 2 !== 0) {
      const suggestion = Math.round(indent / 2) * 2;
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
