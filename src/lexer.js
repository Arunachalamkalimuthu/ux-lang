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

  source.split('\n').forEach((raw, index) => {
    const line = index + 1;

    if (raw.includes('\t')) {
      diags.push(diag('UX001', file, line,
        'Tabs cannot be used for indentation.',
        'replace each tab with two spaces'));
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

    lines.push({ depth: Math.floor(indent / 2), text, line, file });
  });

  return { lines, diags };
}

export function treeify(lines) {
  const root = { depth: -1, text: '<root>', line: 0, file: lines[0]?.file ?? '', children: [] };
  const stack = [root];

  for (const entry of lines) {
    const node = { ...entry, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root;
}
