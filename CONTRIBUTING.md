# Contributing

## The one rule

Every change to the language is measured against adoption: can a model that
has never seen `.ux` write it correctly from `SKILL.md` alone? Run the
benchmark in `bench/` before and after a grammar change. A construct that
lowers the score is a bad construct, however elegant it looks.

That benchmark scores two things, not one, and both are mandatory:

1. **Parse rate** — does `node bin/ux check` come back clean on a model's
   first attempt? (`bench/prompts.md` has 20 prompts; ≥90% clean is the
   target.)
2. **Fidelity** — does what parsed actually mean what the prompt asked for?
   `node bench/inspect.mjs <dir>` prints every screen, form, list, and flow
   so you can read the parsed result against the prompt by hand. A clean
   exit code is not evidence of a correct app: a form can bind to the wrong
   field names, or a list to the wrong data type, without tripping a single
   diagnostic. See `bench/README.md` for the full procedure and why fidelity
   is checked separately — a real run of this benchmark caught a `SKILL.md`
   example that taught models to write forms with five fields all
   (wrongly) named `field`, and `ux check` said nothing was wrong.

A grammar change only earns its keep if it holds up on **both** numbers.

## Constraints that are not negotiable

- **Zero dependencies**, runtime and dev. Node 20+ and the built-in test
  runner.
- **The grammar section of `SKILL.md` stays under 800 tokens.** Adding a
  construct means removing one.
- **Every diagnostic carries a `fix`** that can be pasted straight into a
  file.
- **No synonyms.** One way to say each thing.

## Working on it

```bash
npm test                             # everything (124 tests)
node --test test/parser-data.test.js # one file (parser tests are split:
                                      # parser-data / parser-flow / parser-screen)
node bin/ux check examples/tasks/ux
node bin/ux map   examples/notes/ux
node bench/inspect.mjs examples/shop/ux
```

Tests come first. A parser or checker change without a test that failed
beforehand will be sent back.
