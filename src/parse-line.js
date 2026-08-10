// The one place that decides what a `"` means.
//
// Inside a string a backslash escapes the next character, so `\"` is a quote
// that does not close the string and `\\` is a single backslash. Every scan
// that has to know "am I inside a string right now" depends on that rule:
// stripping a trailing `#` comment, detecting an unterminated string,
// expanding tabs, finding a `->` or a ` where `, and reading the string's own
// value. Five private copies of it would drift, and then the answer to that
// question would depend on which layer happened to ask — which is exactly how
// UX004 first shipped broken.
//
// Returns, for every index: whether it belongs to a string literal (the quotes
// themselves included), and whether it was consumed by a preceding backslash.
// `unterminated` is true when the line ends with a string still open — a
// trailing backslash cannot escape the end of a line, so `text "abc\` is
// unterminated rather than silently truncated.
export function stringMask(text) {
  const inside = new Array(text.length).fill(false);
  const escaped = new Array(text.length).fill(false);
  let inString = false;
  let commentAt = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString && ch === '\\' && i + 1 < text.length) {
      inside[i] = true;
      inside[i + 1] = true;
      escaped[i + 1] = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inside[i] = true;
      inString = !inString;
      continue;
    }
    // The scan ends at a `#` that is not inside a string: everything after it
    // is a comment, and a `"` in a comment has nothing to do with whether a
    // string was closed. Counting those quotes is how UX004 first shipped
    // broken, rejecting correct lines like `intent "Land"  # use " to quote`.
    // Positions past here stay `false`, which is what a comment is: outside.
    if (ch === '#' && !inString) { commentAt = i; break; }
    inside[i] = inString;
  }

  return { inside, escaped, commentAt, unterminated: inString };
}

// Index of the first occurrence of `needle` that is not inside a double-quoted string.
export function indexOutsideString(text, needle) {
  const { inside } = stringMask(text);
  for (let i = 0; i < text.length; i++) {
    if (!inside[i] && text.startsWith(needle, i)) return i;
  }
  return -1;
}

export function splitArrow(text) {
  const at = indexOutsideString(text, '->');
  if (at === -1) return { left: text.trim(), right: null };
  return {
    left: text.slice(0, at).trim(),
    right: text.slice(at + 2).trim(),
  };
}

export function parseTarget(text) {
  const trimmed = text.trim();
  const match = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?$/.exec(trimmed);
  if (!match) return null;
  const args = (match[2] ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);
  return { name: match[1], args };
}

export function parseString(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) return null;

  // The closing quote is the first one the author did not escape.
  const { escaped } = stringMask(trimmed);
  let end = -1;
  for (let i = 1; i < trimmed.length; i++) {
    if (trimmed[i] === '"' && !escaped[i]) { end = i; break; }
  }
  if (end === -1) return null;

  return { value: unescape(trimmed.slice(1, end)), rest: trimmed.slice(end + 1).trim() };
}

// `\"` and `\\` are the whole escape vocabulary. Anything else is reported by
// the lexer (UX025) rather than quietly losing its backslash here — leaving
// room to give `\n` a meaning later without changing what any file means today.
function unescape(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) { out += text[i + 1]; i++; continue; }
    out += text[i];
  }
  return out;
}

export function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}
