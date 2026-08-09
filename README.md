# ux-lang

A small declarative language for describing what a user interface **means** — screens, what is on them, what a user can do, and where each action leads.

Not a template language. Not a styling language. `.ux` describes structure and flow, and leaves rendering to whatever generates or drives the app.

```
app Tasks

data Task
  title  text  required
  done   bool  = false
  due    date?
  owner  User

screen Inbox
  needs signed-in
  intent "See what's due and clear it"

  list Task where owner is me and not done
    sort by due
    row   title, due
    tap   -> Detail(task)
    empty   "All clear."  action "New task" -> NewTask
    loading skeleton 3 rows
    error   "Couldn't load tasks."  action retry

  action "New task" -> NewTask

flow complete(task)
  set task.done = true
  toast "Done"  undo 5s
```

Twenty lines, and you know what the app is. So does a model that has never seen the rest of the codebase.

## Two directions

`.ux` is written in one direction and read in the other.

**Authoring** — an AI writes `.ux`, a generator emits a real app. The `.ux` file is the source of truth you keep; the generated code is output you can throw away and rebuild. Today nothing records what an app is *supposed* to be, so regenerations silently drop steps and flows dead-end. This is that missing record.

**Extraction** — an indexer reads a live page and writes `.ux`. An agent driving a browser then navigates the index instead of the DOM: a fraction of the tokens, stable across redeploys that break every selector, and a map it can plan a route through rather than discovering a site one click at a time.

Same grammar both ways.

## Design constraint

No model has been trained on this language, so it has to be learnable in-context from a spec small enough to ship inside a prompt. That single constraint drives everything: no invented punctuation, no synonyms, no import statements, and a hard one-page budget on the grammar.

It also makes the language testable in a way languages usually aren't — given the spec and the worked examples, what fraction of a model's first attempts parse clean? A low number means the language is wrong, not the model.

## Try it

```bash
git clone <repo> && cd ux-lang
node bin/ux check examples/tasks/ux
node bin/ux map   examples/tasks/ux
npm test
```

Requires Node 20 or newer. There are no dependencies to install — the CLI
runs straight from a clean clone.

`examples/` has worked projects of increasing size (`tasks`, `notes`,
`shop`). `ux check` validates a project against diagnostics for unresolved
references, missing `intent`, screens with no way out, lists missing
`empty`/`loading`/`error`, and more — every diagnostic prints a `fix:` line
naming the correction. Most fixes are a line you can paste directly into the
file; some are instructions instead (rename this, delete that) — the label
is the neutral `fix:` rather than `add:` on purpose, because not every fix
is a line to add. `ux map` prints the navigation graph and writes it to
`<dir>/.build/app.map`.

## Using it with Claude Code

Install the plugin in `plugin/`:

```
/plugin marketplace add /path/to/ux-lang
/plugin install ux-lang@ux-lang
```

The plugin is markdown only — a skill, a `/ux` command, and reference docs.
It does not ship a `ux` binary; it drives the CLI in this repo. Make `ux`
available one of these ways before (or instead of) using the plugin:

- `npm link` from the repo root — adds a global `ux` command.
- `npx ux <args>` from the repo root — no install; `npx` resolves the
  package's own `bin` entry when run inside it.
- `node bin/ux <args>` from the repo root — works with no setup at all, and
  is what the skill and `/ux` command fall back to if `ux` isn't linked.

Then describe an app — Claude writes the `.ux`, checks it against
`plugin/skills/ux/SKILL.md`'s grammar, and generates code from it. See
`plugin/commands/ux.md` for the workflow the plugin follows.

## Status

Format designed and specified. Toolchain built: lexer, parser, checker,
linker, CLI (`ux check`, `ux map`), and Claude Code plugin. The full test
suite (`npm test`) passes. The adoption benchmark in `bench/` measures
whether a model that has never seen `.ux` can write it correctly from the
plugin's skill alone — both parse rate and whether the parsed result
actually means what was asked. Known limitations:

- The Chrome indexer (live page → `.ux`) is specified in the design but not
  yet built.
- No search or filter-by-typed-input. A `list`'s `where` cannot reference a
  value the user just typed on that screen — see the format spec §10 and
  `bench/README.md` for the details.
- Generated-code drift is not enforced by the CLI. `codegen.md` asks a
  generator to keep code and `.ux` in sync; nothing in `ux check` verifies
  that it actually did.

- **[Format design](docs/format-design.md)**
- **[Adoption benchmark](bench/README.md)**

## License

Apache-2.0. The patent grant is deliberate: a format is only worth having if other people can implement it without asking.
