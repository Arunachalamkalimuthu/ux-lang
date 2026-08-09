export function renderMap({ screens, edges, entry }) {
  const names = [...screens.keys()];
  const ordered = entry ? [entry, ...names.filter(n => n !== entry)] : names;
  const width = Math.max(0, ...names.map(n => n.length));

  return ordered.map(name => {
    const targets = [...new Set(edges.filter(e => e.from === name).map(e => e.to))].sort();
    const right = targets.length ? targets.join(' | ') : '(nowhere)';
    return `${name.padEnd(width)} -> ${right}`;
  }).join('\n');
}
