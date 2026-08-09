# ux-lang

[![CI](https://github.com/Arunachalamkalimuthu/ux-lang/actions/workflows/ci.yml/badge.svg)](https://github.com/Arunachalamkalimuthu/ux-lang/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-0B6E6B.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-0B6E6B.svg)](package.json)
[![Dependencies](https://img.shields.io/badge/dependencies-none-0B6E6B.svg)](package.json)

**A small declarative language for what a user interface *means*** — screens,
what a person can do on them, and where every action leads. Then a checker that
catches the bugs a compiler normally can't, like a screen nobody can leave.

Not a template language and not a styling language. `.ux` describes structure
and flow, and leaves rendering to whatever generates or drives the app.

**[Website and live playground →](https://arunachalamkalimuthu.github.io/ux-lang/)**

```
app Tasks

data Task
  title  text  required
  done   bool  = false
  due    date?

screen Inbox
  at /
  intent "See what's due and clear it"

  list Task where not done
    sort by due
    row   title, due
    tap   -> Detail(task)
    empty   "All clear."
    loading skeleton 3 rows
    error   "Couldn't load." action retry

  action "New task" -> NewTask
```

Twenty lines, and you know what the app is. So does a model that has never seen
the rest of the codebase.

---

## Contents

- [Why it exists](#why-it-exists)
- [Quick start](#quick-start)
- [What the checker catches](#what-the-checker-catches)
- [Using it with Claude Code](#using-it-with-claude-code)
- [Adopting an existing app](#adopting-an-existing-app)
- [Documentation](#documentation)
- [Project layout](#project-layout)
- [Status and limitations](#status-and-limitations)
- [Contributing](#contributing)
- [License](#license)

## Why it exists

No artifact today holds the shape of a whole app. A prompted-into-existence
React app is forty files of implementation, and nothing states what the app is
*supposed* to be. So regenerations silently drop steps, state contradicts itself
across screens, and flows dead-end.

`.ux` is that missing record — one page a human reads in a minute and a model
reads in full.

It also runs in the other direction. Because navigation is a declaration rather
than a side effect, the whole graph is checkable: a screen with no way out, a
link to a screen nobody wrote, a list that renders blank when the fetch fails.
None of those is a crash, none fails a normal test, and all of them ship.

## Quick start

Requires **Node 20 or newer**. There are no dependencies to install.

```bash
git clone https://github.com/Arunachalamkalimuthu/ux-lang
cd ux-lang

node bin/ux check examples/tasks/ux   # validate a project
node bin/ux lint  examples/tasks/ux   # warnings on valid-but-suspect code
node bin/ux map   examples/tasks/ux   # the navigation graph
npm test                              # the full suite
```

To get a global `ux` command: `npm link` from the repo root, or `npx ux`.

`examples/` has three worked projects of increasing size — `tasks`, `notes`,
`shop`. All three check and lint clean, and CI keeps them that way.

## What the checker catches

`ux check` validates a project against **34 errors** and exits non-zero if any
remain, so a broken flow fails a build like anything else. Every diagnostic
prints a `fix:` line naming the correction:

```
ux/screens/confirm.ux:4  UX202  `Confirm` has no way out — a user who lands here is stuck.
  fix:  add an action that leaves:  action "Back" -> Cart
```

Two layers, split by the question they ask. **`check`** asks whether a file is
well-formed — does this screen have an `intent`, does this list declare all
three of `empty`/`loading`/`error`. **`link`** asks whether the names it
references exist anywhere in the project — dead links, unreachable screens,
argument arity, cross-file collisions.

`ux lint` is the other half: **six warnings** for programs that are valid but
probably not what you meant — an unused `data` type, a `flow` nothing invokes,
an `intent` that only restates the screen's name, a list nobody can act on.
Warnings never fail a build unless you ask for it:

```bash
node bin/ux lint --strict ux/   # for CI: warnings exit 1
```

`ux map` prints the navigation graph and writes it to `<dir>/.build/app.map`:

```
Inbox   -> Detail | NewTask
Detail  -> Inbox
NewTask -> Inbox
```

Small enough to keep in context permanently, which is the point: a model editing
one screen reads this plus the single file it is changing, and still reasons
correctly about the whole app.

## Using it with Claude Code

There is no compiler. The model is the compiler, and the plugin is how it learns
the language — the grammar is 422 tokens, so the whole language ships inside
every prompt.

```
/plugin marketplace add /path/to/ux-lang
/plugin install ux-lang@ux-lang
```

Then describe an app: Claude writes the `.ux`, runs `ux check`, fixes whatever
it reports, and generates code from the result. The plugin drives the CLI from
this repo, so either `npm link` it or let the skill fall back to
`node <path-to-repo>/bin/ux`.

## Adopting an existing app

`/ux-import` reads an app that already exists into a `.ux` file — router first,
so the navigation graph is the skeleton.

Expect the first `ux check` to fail loudly, and read it as an **audit rather
than a transcription report**. On a real codebase most of those diagnostics are
true statements about the app: a dead end in production, a list that renders
blank while fetching, a screen nothing links to. Softening the `.ux` to silence
them throws the finding away.

One caution: a clean `ux check` proves the file is well-formed, not that it is
*true* of your app. Run `node bench/inspect.mjs ux/` to see what actually
parsed — every screen with where it leads, every form with its real field names
— and read that against reality.

Full guide: [`plugin/skills/ux/reference/import.md`](plugin/skills/ux/reference/import.md).

## Documentation

| | |
|---|---|
| [Syntax reference](plugin/skills/ux/reference/grammar.md) | the whole grammar, every rule, every diagnostic code |
| [Format design](docs/format-design.md) | why the language is shaped this way, and what it deliberately does not do |
| [Generating code](plugin/skills/ux/reference/codegen.md) | turning `.ux` into React and other targets |
| [Importing an app](plugin/skills/ux/reference/import.md) | the reverse direction |
| [Adoption benchmark](bench/README.md) | how the language measures whether it is learnable |
| [Website](https://arunachalamkalimuthu.github.io/ux-lang/) | the same reference, plus a live playground |

## Project layout

```
src/          the toolchain — lexer, parser, checker, linker, lint, renderers
bin/ux        the CLI; the only place that prints
examples/     three worked projects, kept clean by CI
plugin/       the Claude Code plugin: skill, grammar, codegen and import guides
bench/        the adoption benchmark and a fidelity inspector
site/         sources for the website; `node site/build.mjs` emits docs/
docs/         the built site, served by GitHub Pages
test/         the suite
```

Only `src/project.js` touches the filesystem. Everything else in `src/` is a
pure function over strings, which is why the website's playground can run the
real toolchain in a browser rather than a copy of it.

## Status and limitations

Built and tested: the parser, both checking layers, the linter, the CLI, three
worked examples, the Claude Code plugin, and an adoption benchmark. The full
suite passes on Node 20 and 22.

Known gaps, stated plainly because discovering them later is worse:

- **The Chrome indexer is not built.** Reading a live page *into* `.ux`, so an
  agent navigates a semantic index instead of the DOM, is specified in the
  format design and not started. It is the larger half of the idea.
- **No search or filter-by-typed-input.** A list's `where` clause cannot
  reference a value the user just typed, so a search screen has no honest
  expression. The benchmark found this; there is no design for it yet.
- **Generated-code drift is not enforced.** Nothing verifies that generated code
  still matches its `.ux`. It is a convention, not a guarantee.
- **The adoption benchmark has never been run.** Twenty prompts and a ≥90%
  target exist in `bench/`; no results do.
- **Design rule R4 is half implemented.** Unknown keywords suggest the word you
  meant, but near-misses are still errors rather than warnings that normalise —
  that half is blocked on a formatter that does not exist yet.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) — the short
version is that every language change is measured against the adoption
benchmark, on both parse rate *and* whether the parsed result means what was
asked.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). To
report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE). The patent grant is deliberate: a format is only worth
having if other people can implement it without asking.
