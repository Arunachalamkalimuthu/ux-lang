// Finding the near-miss behind a mistake.
//
// Shared because both the parser and the linker need it and neither may
// import the other: the linker already reads the parser, so a dependency
// back the other way would be a cycle. Duplicating it would be worse — two
// copies of a similarity threshold drift, and then `did you mean` says
// different things depending on which layer noticed.

export function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// The closest candidate, but only when it is *obviously* the intended one.
//
// The length guard is what stops nonsense suggestions on short words: without
// it, `go` and `ok` are distance 2 apart and every two-letter typo would
// confidently propose an unrelated keyword. A suggestion that is wrong is
// worse than none, because the whole point is that a reader can act on the
// fix line without thinking.
export function closestName(name, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best && bestDistance <= 2 && bestDistance < best.length ? best : null;
}

// Case-insensitive near-miss, for keywords. A model reaching for `onTap` or
// `Tap` has made the same mistake as one reaching for `tpa`, and all three
// should get the same answer. Compared on lowercase so `onTap` is two edits
// from `tap` rather than three.
export function closestKeyword(word, keywords) {
  const lower = word.toLowerCase();
  if (keywords.includes(lower)) return null;
  return closestName(lower, keywords);
}
