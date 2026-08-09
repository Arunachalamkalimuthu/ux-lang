import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';

import { BLOB } from '../components/Chrome';

// Pages are rendered from markdown that lives in the repository root, not in
// this app — the syntax reference is the same file the Claude Code plugin
// ships, and the roadmap is the same file a reader sees on GitHub. One source,
// so the site cannot drift from either.
const REPO_ROOT = join(process.cwd(), '..');

// Everything before the first `##` is the file's own title and preamble; each
// page supplies its own. Slicing to the heading rather than to a line count
// means a preamble can grow without leaving half a sentence stranded on the
// page — which is exactly what happened when this was a line count.
function afterPreamble(markdown) {
  const lines = markdown.split('\n');
  const first = lines.findIndex(line => line.startsWith('## '));
  return first === -1 ? markdown : lines.slice(first).join('\n');
}

// A relative target is a path in the repository, not a route on this site, so
// it resolves to GitHub. Absolute URLs and anchors are left alone.
function repoLinks(html) {
  return html.replace(
    /href="(?!https?:|#|mailto:|\/)([^"]+)"/g,
    (_, href) => `href="${BLOB}${href}"`,
  );
}

export async function repoMarkdown(relativePath, { keepPreamble = false } = {}) {
  const raw = await readFile(join(REPO_ROOT, relativePath), 'utf8');
  const body = keepPreamble ? raw : afterPreamble(raw);
  return repoLinks(await marked.parse(body));
}

export async function localMarkdown(relativePath) {
  const raw = await readFile(join(process.cwd(), relativePath), 'utf8');
  return repoLinks(await marked.parse(raw));
}
