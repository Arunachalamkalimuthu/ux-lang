# Roadmap

Where this is going, in the order it should get there — and what would change
the plan.

Dates are deliberately absent. This is a small project and inventing a schedule
would be the least honest thing on the page.

## How decisions get made

Three rules decide what lands, and they resolve most arguments before they
start.

**Adoption beats elegance.** No model has been trained on `.ux`. Everything
depends on it being learnable in-context from a page that fits in a prompt, so a
construct that reads beautifully and lowers the benchmark score is a bad
construct. The grammar has a hard 800-token budget; a new feature pays for
itself by removing something.

**Evidence before design.** The language already has one documented gap found by
writing prompts rather than by theorising — a list's `where` clause cannot
reference user input, so search is inexpressible. That is the intended way for a
gap to surface. Nothing gets designed for a problem that has not shown up in a
real attempt to use the language.

**No silent failure.** A diagnostic that misleads is worse than a missing one, a
`fix:` line that changes meaning is worse than no fix, and a clean exit code
that hides a broken app is the worst of all. Three separate bugs in the first
version were of exactly this shape. Anything that risks a fourth gets held back.

## Now — validate the premise

**Run the adoption benchmark.**

The whole project rests on one claim: a model given only `SKILL.md` writes valid
`.ux` on its first try, at least 90% of the time. Twenty prompts, a target, and
a fidelity inspector all exist in [`bench/`](bench/README.md). **No results do.**

Everything below this line is a bet on an unmeasured premise, which is why
nothing else should happen first.

The run has to score both numbers, because passing one and failing the other has
already happened during development: a reader given only the skill file produced
an app that passed `ux check` and was still broken, since the grammar's form
example read as a keyword and the form bound five fields all named `field`.
A clean exit code is not evidence of a correct app.

**What a bad result means.** If parse rate comes back at 60%, the answer is to
change the language, not to blame the model — that is the stated interpretation
and it needs to survive contact with an actual bad number. The diagnostic codes
that cluster across failures are the design defects; they name what to fix.

## Next — close the loop

Ordered by how much each one is holding back.

**Design rule R4, second half.** Near-miss keywords currently produce an error
that names the word you meant. R4 wanted them to *parse* as the canonical form
and warn. `ux fmt` now exists, which removes the blocker — accepting an alias is
only safe when something can rewrite it — so what remains is deciding which
aliases to accept. That list should come from the benchmark's failures rather
than from guessing, which is why it sits behind the run above.

**Drift protection.** Nothing verifies that generated code still matches its
`.ux`. It is a convention (`// generated from ...`, regenerate rather than
patch) with nothing enforcing it, and the moment someone hand-edits generated
output the source of truth is a lie. The likely shape is a checksum in the
generated header and a `ux verify` that compares — but it needs a design, since
a false "your code is stale" would be its own silent-failure bug.

**Search and filter-by-input.** The known language gap. A `list`'s `where`
clause cannot reference a value the user just typed, so a search screen has no
honest expression — only a tautology like `where title is title` that nothing
catches. Needs a real construct, and the benchmark run should say how often it
actually bites before one gets designed.

**Editor support.** Syntax highlighting and inline diagnostics. The diagnostics
already carry file, line, code and fix, so a language server is mostly plumbing.
Lower value than it looks while the language is still moving.

## Later — the other direction

**The Chrome indexer.** Reading a live page *into* `.ux`: walk the accessibility
tree, emit screens, affordances and a `bind` block of locators, and let an agent
navigate a semantic index instead of the DOM. A few hundred tokens per page
instead of tens of thousands, and stable across the redeploys that break every
selector.

This is the larger half of the original idea and the reason the format has an
extraction profile it does not yet use. It needs its own spec and plan. It is
deliberately last because it depends on the authoring half being solid: an
indexer that emits `.ux` nobody trusts is worth nothing.

**More generation targets.** Today `codegen.md` describes React. The format
carries nothing web-specific, so SwiftUI or Compose are a guide away rather than
a compiler away. Worth doing when someone actually wants one.

## Not planned

Saying no is part of a roadmap.

- **A styling or layout language.** `.ux` describes what an interface means, not
  what it looks like. Every request to add visual detail is a request to make it
  a worse version of the thing it is deliberately not.
- **General-purpose logic in `flow`.** Flows are a bounded list of effects. A
  nested branch is already rejected with a diagnostic pointing at a separate
  flow. Loops, conditionals and expressions belong in the generated
  application.
- **A runtime protocol for agents driving a live app.** Specified as possible,
  deliberately deferred; `app.map` is shaped so it could be added without a
  format change. It should wait for the indexer.
- **Dependencies.** CI fails the build if `package.json` grows one.

## Versions

The format is pre-1.0 and the grammar may still change in breaking ways.
Diagnostic codes are the exception: once assigned, a code's meaning never
changes — a rule is retired rather than repurposed.

| | |
|---|---|
| **0.1** | shipped — the language, checker, linker, lint, formatter, CLI, plugin, examples |
| **0.2** | benchmark run and published, and whatever the language has to change as a result |
| **0.3** | R4 acceptance and drift protection — the round trip becomes trustworthy |
| **0.4** | the Chrome indexer, and the format proven in both directions |
| **1.0** | when the grammar has been stable across two releases and the benchmark holds above target |

## What would change all of this

- **The benchmark comes back badly.** Then 0.2 is not "run it and move on", it
  is a redesign, and everything below slips behind that.
- **Someone tries to adopt a real app and cannot.** The import path is guidance,
  not a tool, and has never been used on a large codebase. If it breaks down,
  tooling for it jumps ahead of the indexer.
- **The required-states rule proves unlivable.** Forcing `empty`/`loading`/
  `error` on every list is the most opinionated call in the language. It is
  defensible now because it costs three lines and prevents the most common
  failure of generated UI — but if real use shows people fighting it rather than
  benefiting, that is worth knowing and worth reversing.

Disagreement is useful here. Open an issue rather than a pull request for
anything on this page.
