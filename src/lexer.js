import { diag } from './diagnostics.js';

// Remove a trailing `#` comment, ignoring `#` inside double-quoted strings.
function stripComment(text) {
  let out = '';
  let inString = false;
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    if (ch === '#' && !inString) break;
    out += ch;
  }
  return out;
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

    // Count `"` on the *raw* line, before comment-stripping — an unmatched
    // quote is precisely the condition that makes stripComment untrustworthy
    // (it toggles "in string" per `"` it sees, so an odd count leaves it
    // stuck "inside a string" for the rest of the line, silently eating a
    // trailing `#` comment, and leaves everything downstream — indexOutsideString,
    // splitArrow — with the same wrong idea of where the string ends).
    const quotes = (raw.match(/"/g) ?? []).length;
    if (quotes % 2 !== 0) {
      diags.push(diag('UX004', file, line,
        `Line ${line} has an unterminated string (an odd number of \`"\` characters).`,
        'close the string with a matching `"`'));
    }

    const stripped = stripComment(raw.replace(/\t/g, '  '));
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
