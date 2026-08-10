import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse } from './parser.js';
import { check } from './check.js';

// Exported so `ux fmt` walks exactly the same set of files as `ux check`.
// Two walkers would eventually disagree about what a project contains.
//
// `seen` holds real paths, because following links means the walk can be sent
// back up its own tree and would otherwise recurse until the stack ran out.
export async function findUxFiles(dir, seen = new Set()) {
  const real = await realpath(dir).catch(() => dir);
  if (seen.has(real)) return [];
  seen.add(real);

  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (await isDirectory(entry, path)) found.push(...await findUxFiles(path, seen));
    else if (extname(entry.name) === '.ux') found.push(path);
  }
  return found.sort();
}

// `readdir` reports on the link, not its destination, so a symlinked directory
// answers no to `isDirectory()` — it used to fall through to the extension
// test and take its whole subtree with it, silently. A project that keeps
// shared screens behind a link was then rejected with UX200/UX202 for screens
// that do exist. A dangling link is deliberately not a directory here: it goes
// on to fail the read, which is a thing worth reporting rather than skipping.
async function isDirectory(entry, path) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  return stat(path).then(s => s.isDirectory(), () => false);
}

export async function loadProject(dir) {
  const programs = [];
  const diags = [];

  for (const path of await findUxFiles(dir)) {
    const source = await readFile(path, 'utf8');
    const { ast, diags: parseDiags } = parse(source, path);
    diags.push(...parseDiags, ...check(ast));
    programs.push(ast);
  }

  return { programs, diags };
}
