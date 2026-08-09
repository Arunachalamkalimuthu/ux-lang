import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Two pages keep their hand-written HTML rather than becoming markdown or JSX.
//
// Both are laid out in bands with a label in the left gutter — a structure
// markdown cannot express, and one worth keeping: the gutter is what makes a
// long page skimmable. Rewriting them as JSX would gain nothing but a
// transcription risk, since neither has any behaviour. The framework is here
// for routing, shared layout, markdown and the playground; static prose with a
// bespoke structure is not a problem it needs to solve.
//
// The content is ours and contains no user input, so injecting it is safe.
export async function fragment(name) {
  return readFile(join(process.cwd(), 'content', name), 'utf8');
}
