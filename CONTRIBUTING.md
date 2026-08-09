# Contributing to ux-lang

Thanks for considering it. This project is small, opinionated, and early —
which means a good issue is worth as much as a good pull request.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## The one rule

**Every language change is measured against adoption.** No model has been
trained on `.ux`, so it has to be learnable in-context from a spec small enough
to ship inside a prompt. A construct that reads beautifully and lowers the
adoption score is a bad construct.

The benchmark in [`bench/`](bench/README.md) scores two things, and both are
mandatory:

1. **Parse rate** — does `ux check` come back clean on a model's first attempt,
   across the prompts in `bench/prompts.md`? The target is ≥90%.
2. **Fidelity** — does what parsed actually mean what the prompt asked for?
   `node bench/inspect.mjs <dir>` prints every screen, form, list and flow so
   you can read the parsed result against the prompt.

The second exists because of a real failure: a reviewer given only `SKILL.md`
wrote an app that passed `ux check` and was still broken — the grammar showed a
form as `field required`, they read `field` as a keyword, and the form bound to
five fields all named `field`. **A clean exit code is not evidence of a correct
app.** Run both numbers before and after a grammar change.

## Constraints that are not negotiable

- **Zero dependencies in the toolchain**, runtime *and* dev. The website under
  `www/` is a separate package and may have them; Node 20+ and the built-in test
  runner. CI fails the build if `package.json` grows a dependency, because the
  README promises a clean clone runs with no install.
- **The grammar section of `SKILL.md` stays under 800 tokens.** Adding a
  construct means removing one. This is the reason the language is adoptable at
  all: the whole grammar ships in every prompt.
- **Every diagnostic carries a `fix:`** that names the correction. A diagnostic
  without one is a bug.
- **No synonyms.** One way to say each thing.
- **Diagnostic codes are stable.** Once assigned, a code's meaning never
  changes. Retire one rather than repurpose it.

## Where a rule belongs

The project settled this the hard way, after three separate false-positive bugs
came from getting it wrong:

| Layer | Question it answers |
|---|---|
| `src/check.js` | Is this file well-formed? *(single file only)* |
| `src/linker.js` | Does a referenced name exist? *(whole project)* |
| `src/lint.js` | Is this valid but probably not what you meant? *(warnings)* |

If a rule needs to know about a name declared in another file, it belongs in the
linker — no exceptions. `UX105` and `UX106` originally lived in the checker and
rejected the documented project layout for exactly this reason.

Code ranges: `UX0xx` lexical, `UX1xx` single-file, `UX2xx` cross-file,
`UX3xx` warnings.

## Adding a diagnostic

1. Pick the layer above and the next free code in its range.
2. Write the failing test first. Include the **negative** case — that valid
   input does *not* trigger it. A false positive is worse than a missed
   detection, because it teaches people to ignore the tool.
3. Write a `fix:` line someone can act on without thinking.
4. Add a row to the table in `plugin/skills/ux/reference/grammar.md`.
   `test/diagnostic-docs.test.js` fails if you skip this, in both directions.
5. Run `npm test`, and confirm all three examples still check *and* lint clean.

## Working on it

```bash
npm test                                # everything
node --test test/parser-data.test.js    # one file (parser tests are split:
                                        # parser-data / parser-flow / parser-screen)
node bin/ux check examples/tasks/ux
node bin/ux lint  examples/tasks/ux
node bin/ux fmt --check examples/tasks/ux
cd www && npm install && npm run dev    # the website, at localhost:3000
```

Tests come first. A parser change without a test that failed beforehand will be
sent back.

Nothing built is committed: the website is rebuilt from source on every deploy,
so it cannot go stale. But it *imports* the toolchain out of `src/`, so a change
there can break the site — CI builds it on every pull request for that reason.

One rule protects that import: only `src/project.js` may touch the filesystem.
Everything else has to stay a pure function over strings, or the playground can
no longer run the real checker. `test/browser-safe.test.js` enforces it.

## Reporting a bug

Open an issue. The templates ask for a minimal `.ux` file, what you expected,
and what happened. A few lines that reproduce it are worth more than a
description.

**Two kinds are especially valuable:**

- **A false positive** — the checker rejects something correct. There is a
  dedicated template. These are the highest-severity bugs in the project.
- **A silent pass** — something wrong that `ux check` accepts. Harder to notice
  and just as bad.

## Pull requests

- Branch from `master`, keep the change focused, and explain *why* in the
  description — the what is visible in the diff.
- Every commit should leave the suite green.
- CI runs the suite on Node 20 and 22, checks and lints the examples with
  `--strict`, and verifies the site build is reproducible.
- Write commit messages that say what changed and why it needed to. Several
  comments in this codebase exist because a bug was subtle enough to be worth
  explaining to whoever hits it next; commit messages carry the same duty.

## Proposing a language change

Grammar changes are the highest-stakes contributions, so they get an extra step.
Open an issue first with:

- what the construct is and what it lets someone express that they cannot today;
- what it costs against the 800-token budget, and what you would remove to pay
  for it;
- benchmark numbers before and after, both parse rate and fidelity.

Known gaps that would be genuinely welcome: the Chrome indexer (live page →
`.ux`), `ux fmt` (which unblocks the accepting half of design rule R4), and a
design for search / filter-by-typed-input. All three are described in the
[format design](docs/format-design.md).
