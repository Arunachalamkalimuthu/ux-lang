export const ERROR = 'error';
export const WARNING = 'warning';

export function diag(code, file, line, message, fix, severity = ERROR) {
  return { code, file, line, message, fix, severity };
}

export function hasErrors(diags) {
  return diags.some(d => d.severity === ERROR);
}
