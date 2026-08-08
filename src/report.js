import { ERROR } from './diagnostics.js';

export function renderDiagnostics(diags) {
  if (diags.length === 0) return 'No problems found.';

  const lines = [];
  for (const d of diags) {
    lines.push(`${d.file}:${d.line}  ${d.code}  ${d.message}`);
    lines.push(`  fix:  ${d.fix}`);
    lines.push('');
  }

  const errors = diags.filter(d => d.severity === ERROR).length;
  const warnings = diags.length - errors;
  lines.push(`${errors} error(s), ${warnings} warning(s)`);
  return lines.join('\n');
}
