// Canonical layout for a `.ux` file.
//
// This is deliberately a *layout* formatter and nothing more. It normalises
// whitespace and blank lines and touches nothing else — it does not reorder
// declarations, rewrite keywords, or align columns.
//
// The reason is that a formatter which changes meaning is worse than no
// formatter, and every richer option risks it. Re-printing from the AST would
// be the usual approach and is ruled out here: the AST carries no comments, so
// a round trip would delete them. Aligning columns would mean deciding what a
// "column" is in a language whose only structure is indentation. Rewriting
// near-miss keywords (`onTap` to `tap`) needs positional context to be safe and
// is a language change that should carry benchmark evidence.
//
// So: work on raw lines, preserve everything that is not whitespace, and be
// provably meaning-preserving. `test/format.test.js` asserts that the AST and
// the diagnostics are identical before and after formatting, for every example
// in the repo.

// Depth is floored, exactly as `lexer.js` computes it. Anything else would
// re-nest a line that the parser had already placed.
const depthOf = indent => Math.floor(indent / 2);

const TOP_LEVEL = /^(app|site|data|screen|component|flow)\b/;

export function formatSource(source) {
  const out = [];
  let blankRun = 0;

  for (const raw of source.split('\n')) {
    // Tabs become two spaces before anything else, matching the lexer, so a
    // tab-indented file formats to the structure the parser already saw.
    const line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');

    if (line === '') { blankRun++; continue; }

    const indent = line.length - line.trimStart().length;
    const text = line.trimStart();
    const isTopLevel = indent === 0 && TOP_LEVEL.test(text);

    if (out.length > 0) {
      // One blank line between top-level declarations; at most one anywhere
      // else. Blank lines inside a declaration are the author's paragraphing
      // and worth keeping — collapsing them to zero would run a screen's
      // sections together.
      if (isTopLevel) out.push('');
      else if (blankRun > 0) out.push('');
    }
    blankRun = 0;

    out.push(' '.repeat(depthOf(indent) * 2) + text);
  }

  // Exactly one trailing newline, and no leading blank lines (dropped above,
  // since `out` is empty until the first real line).
  return out.length ? out.join('\n') + '\n' : '';
}

// True when the file is already canonical. Used by `ux fmt --check`, which
// must not write anything.
export function isFormatted(source) {
  return formatSource(source) === source;
}
