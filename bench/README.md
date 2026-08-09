# Adoption benchmark

The acceptance test from the design spec (§9): given only `SKILL.md` and the
three examples, how often does a model that has never seen this language
produce `.ux` that is actually right on the first try?

That's two questions, not one, and they get scored separately:

1. **Parse rate** — did `ux check` come back clean?
2. **Fidelity** — does the parsed result mean what the prompt asked for?

## Why fidelity is a separate, mandatory metric

Task 11's reviewer read `SKILL.md` as a naive user and wrote a three-screen
expense tracker. `ux check` said `No problems found.` The app was still
broken: `SKILL.md`'s `form` example showed `field required`, which reads as
a literal keyword next to `data`'s own literal-keyword-laden block, so the
reviewer wrote `field description required`, `field amount required`, and so
on. The parser keeps only the first word of each line as the field name, so
the form bound to five fields all named `field`. Nothing complained, because
at the time nothing validated a form's fields against its data type.

That specific gap is closed now — `UX206` fires if a form names a field its
data type doesn't declare. But the lesson isn't "that one gap is closed," it
is: **a clean exit code is not evidence of a correct app, and never will be
in general.** A form that repeats one of its data type's *real* field names
three times (instead of the three fields the prompt actually asked for)
parses clean, passes `UX206`, and is exactly as wrong as the original bug.
A screen that exists, has an intent, and a way out, but shows the wrong
data, or a list bound to the wrong type's near-namesake — none of that is
a parse error. A benchmark that only counts clean parses will report success
while the language quietly teaches people to write nonsense. So:

**Every passing run must also be fidelity-checked.** A run that parses but
does not mean what was asked is a failure — and the most instructive kind,
because it points at a place `SKILL.md` misleads rather than a place it is
silent.

## Files

- `prompts.md` — 20 one-line app descriptions, checked against `examples/`
  to rule out prompts a model could pass by reshaping a worked example
  rather than by reading the grammar. See its "Replacements" table.
- `inspect.mjs` — loads a `.ux` project with the project's own `src/`
  modules (the same code path `ux check` uses) and prints a structural
  summary: every screen with its intent and where its actions lead, every
  form with its data type and **the actual parsed field names**, every list
  with its data type and row fields, every flow and where it goes. Read-only
  — it doesn't modify the project it inspects.
- `README.md` — this file.

## Known gap: prompts 6 and 9 touch a construct the language doesn't have

Prompts 6 ("search jobs, …") and 9 ("search people, …") both ask for a list
filtered by a value the user just typed on that same screen. The language
has no way to express that — a `list`'s `where` clause cannot reference an
input the user entered; the only thing that parses is a tautology like
`list Job where title is title` next to a flow that does nothing. Nothing
in `ux check` catches that this is meaningless rather than merely unusual.
This is a real, tracked expressiveness gap (`docs/format-design.md`
§10), not something v1 is meant to solve — a query-parameterization
construct is a language design decision, not a benchmark fix, and this
benchmark exists precisely to surface candidates like it before guessing at
a design.

Keep both prompts in the corpus — surfacing the gap is the point — but when
scoring a run against them: if a model writes a tautological `where` (or
otherwise can't express "filtered by what I just typed"), that is scored as
a **language** failure, not a model failure, the same as any other run.
Don't silently drop these two prompts from the parse-rate denominator, and
don't count a tautological pass as evidence the language handles search —
it doesn't, and `inspect.mjs`'s `LISTS` section will show you the `where:`
clause verbatim so a self-referential filter is easy to spot on sight.

## Procedure

For each of the 20 prompts in `prompts.md`, in a fresh session with no other
context:

1. Provide `plugin/skills/ux/SKILL.md` and the three `examples/` projects.
   Nothing else — no `reference/grammar.md`, no `src/`.
2. Give the prompt, and ask only for `.ux` files — no code, no explanation.
3. Write the output to a scratch directory, e.g. `bench/runs/<n>/ux/`.
4. Run `node bin/ux check bench/runs/<n>/ux`.
   - **Clean:** record `parse: pass`, and go to step 5.
   - **Not clean:** record `parse: fail` and every diagnostic code
     produced. Do not proceed to a fidelity check — a run that doesn't
     parse can't mean anything yet.
5. Run `node bench/inspect.mjs bench/runs/<n>/ux` and read the summary
   against the original prompt. Ask, in order:
   - Do the screens the prompt implies exist? (A "cancel a booking" prompt
     needs a screen or action that gets there — check the `leads to` and
     `NAVIGATION GRAPH` sections.)
   - Does every `form`'s `FIELDS:` line match what the prompt asked the
     user to enter — the real intended names, not a repeated placeholder?
     This is the specific line that would have caught Task 11's bug; if a
     form's `FIELDS:` list looks suspicious (same name twice, a generic
     word like `field`/`value`/`input`), `inspect.mjs` prints a `WARNING:`
     for it, but read the list yourself too — a repeated *real* field name
     passes `UX206` and prints no warning unless it's an exact duplicate.
   - Does every `list`'s data type and `row:` match what the prompt said
     should be browsable, not a plausible-looking neighbor?
   - Does the flow described by the prompt (the thing that can succeed or
     fail) have a distinct `ok`/`fail` split, not a generic error swallowing
     a meaningful failure?
   - Record `fidelity: pass` or `fidelity: fail`, with a one-line note on
     what was wrong if it failed.
6. A run only counts as an overall pass if **both** `parse` and `fidelity`
   are `pass`.

## Targets

- **≥90% of 20 prompts parse clean on the first try.** This is the spec's
  §9 number.
- **Every passing run is fidelity-checked**, no exceptions. A parse-clean
  run that hasn't been read against its prompt through `inspect.mjs` is not
  yet a recorded pass.
- Report both numbers. `18/20 parse, 15/18 of those are faithful` is the
  real result; `18/20 parse` alone is the number Task 11 already proved
  insufficient.

## Reading the result

A failure is a **language** problem before it is a model problem — for
both metrics.

**For parse failures**, count the diagnostic codes across all 20 runs and
treat the most frequent as a design defect:

- A code that fires repeatedly means the construct is not guessable. Rename
  it to whatever the model reached for instead, or accept both spellings.
- `UX013` or `UX016` clustering on one keyword means that keyword has no
  prior in pretraining — change the keyword.
- `UX102`–`UX104` clustering means the required states are not visible
  enough in `SKILL.md` — move them earlier or make them louder.

**For fidelity failures**, the equivalent move is to find what in
`SKILL.md` produced the wrong shape, the same way `field required` did:

- If several runs independently reuse a metavariable (`field`, `value`,
  `name`) as if it were a literal keyword, that word is placed somewhere
  in `SKILL.md` that reads as literal — usually right next to a block where
  the same word *is* a real keyword. Fix it the way Task 11 fixed `form`'s
  example: replace the metavariable with a concrete, obviously-invented
  name.
- If several runs bind a `list` or `form` to a plausible but wrong data
  type, the grammar's example probably shows the data type's name too close
  to the screen's own name or the prompt's noun, inviting a guess instead
  of a read.
- If several runs collapse a meaningful `ok`/`fail` split into a generic
  error, `SKILL.md`'s `call` example is being copied verbatim rather than
  adapted — its `ok`/`fail` messages may need to look less like defaults
  and more like a template that obviously wants a real message
  substituted in.

Record each run's score (both numbers) in this file so they're tracked over
time, the same way the brief asked for the parse rate alone.

## Run log

| Date | Parse rate | Fidelity rate (of parse-clean runs) | Notes |
|---|---|---|---|
| — | — | — | No runs recorded yet. This benchmark requires a fresh model session per prompt, run manually; see Procedure above. |
