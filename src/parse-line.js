// Index of the first occurrence of `needle` that is not inside a double-quoted string.
function indexOutsideString(text, needle) {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') inString = !inString;
    if (!inString && text.startsWith(needle, i)) return i;
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
  const end = trimmed.indexOf('"', 1);
  if (end === -1) return null;
  return { value: trimmed.slice(1, end), rest: trimmed.slice(end + 1).trim() };
}

export function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}
