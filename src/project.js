import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse } from './parser.js';
import { check } from './check.js';

// Exported so `ux fmt` walks exactly the same set of files as `ux check`.
// Two walkers would eventually disagree about what a project contains.
export async function findUxFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findUxFiles(path));
    else if (extname(entry.name) === '.ux') found.push(path);
  }
  return found.sort();
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
