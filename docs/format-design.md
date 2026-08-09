# The `.ux` Format — Design

**Date:** 2026-08-08
**Status:** Approved design, pre-implementation
**Scope:** Spec 1 of 3 — the format itself. Downstream specs (authoring plugin, Chrome indexer) depend on this one and are out of scope here.

---

## 1. What this is

`.ux` is a small declarative language for describing the structure and flow of a user interface — screens, what is on them, what a user can do, and where each action leads.

It is not a template language and not a styling language. It describes *what the interface means*, not what it looks like.

The format has two producers and two consumers:

| | Producer | Consumer |
|---|---|---|
| **Authoring** | AI (or human) writes `.ux` | code generator emits a real app |
| **Extraction** | indexer reads a live page | agent navigates using the index |

One grammar serves both. That is the central bet of this design.

## 2. Why it exists

**For authoring:** no artifact today holds the shape of a whole app. A prompted-into-existence React app is 40 files of implementation; nothing states what the app is *supposed* to be. So regenerations silently drop steps, state contradicts itself across screens, and flows dead-end. `.ux` is that missing record — one page a human reads in 60 seconds and a model reads in full.

**For extraction:** an agent driving a browser pays tens of thousands of tokens per page for DOM that is overwhelmingly class hashes and wrapper divs. The semantic content of a page is a few hundred tokens. An index also survives redeploys that break every selector, and it lets an agent *plan a route* instead of discovering a site one click at a time.

## 3. Governing constraint: adoption

No model has been trained on this language. It must be learnable in-context, at inference time, from a spec small enough to ship in a prompt. Every design rule below descends from that.

**R1 — Ride existing priors.** Every construct resembles something already in pretraining: indentation blocks (Python/YAML), `where … sort by` (SQL), `name type required` (schema DSLs). No invented punctuation — no sigils, no custom operators.

**R2 — One page, hard budget.** The complete grammar fits in ~800 tokens. A new feature that breaks the budget removes an old one. As a plugin skill, this size is a tax paid on every request, so the limit is real rather than aspirational.

**R3 — One way to say each thing.** No synonyms. `tap` is tap; there is no `onTap`, `onClick`, or `onPress`. Most LLM UI errors are the model choosing a valid-but-different spelling of a concept it already understands.

**R4 — Guessable beats memorized.** A model writing `onTap` is a language bug, not a model bug. Near-misses parse with a warning and normalize on format, so the model learns the idiom in one round trip.

**R5 — No imports.** Names resolve globally across a project. Hallucinated import paths are the largest single class of broken LLM output; deleting the concept deletes the class. The linker resolves.

**R6 — Errors teach the fix.** Every diagnostic names the correction, so a model self-corrects with no human in the loop.

## 4. Lexical rules

- Indentation is significant. Two spaces per level. Tabs are an error.
- `#` begins a comment to end of line.
- Strings are double-quoted. No interpolation in v1.
- Declarations are `PascalCase` (`Task`, `Inbox`). Fields and flows are `camelCase`.
- No semicolons, braces, or import statements.
- One declaration per file is conventional but not enforced.

## 5. Top-level declarations

Five, and that is the whole language.

```
app <Name>          # authoring root
site <domain>       # extraction root
data <Name>         # a shape that appears on screen
screen <Name>       # a place the user can be
component <Name>    # a reusable fragment
flow <name>(args)   # what happens when a user acts
```

`app` and `site` are mutually exclusive — a project is one or the other.

### 5.1 `data`

```
data Task
  title   text  required
  done    bool  = false
  due     date?
  owner   User
  tags    [text]
  status  one of draft | active | archived = draft
```

Types: `text` `number` `int` `bool` `date` `time` `datetime` `money` `email` `url` `phone` `image` `file` `id` `secret`

Modifiers: `?` optional · `required` · `= <default>` · `[T]` list of T · a `PascalCase` name is a reference to another `data`.

`one of a | b | c` declares an inline enum.

### 5.2 `screen`

```
screen Inbox
  at /inbox                # route; optional for authoring, a pattern for extraction
  needs signed-in          # guard; optional
  intent "See what's due and clear it"   # REQUIRED, one line

  <body>
```

`intent` is required on every screen. It is the single line that tells a model — or a person — why the screen exists. It costs one line and it is what makes an index worth reading.

### 5.3 Screen body elements

```
heading "Inbox"
text    "You're all caught up."
show    user.name

group "Overdue"           # a titled section
  …

tabs Code | Issues | Actions
  -> Issues(owner, repo)

if <condition>            # conditional UI
  …
else
  …

action "New task" -> NewTask     # button, link, or nav — one concept
action star                       # bare verb: calls flow `star`

form Task
  title  required
  due
  submit "Create" -> create(task)

list Task where owner is me and not done
  sort by due
  row   title, due
  tap   -> Detail(task)
  empty   "All clear."  action "New task" -> NewTask
  loading skeleton 3 rows
  error   "Couldn't load tasks."  action retry
```

**`action` is deliberately one concept.** Buttons, links, and nav items differ only in rendering, and rendering is not this language's concern. Collapsing them removes a choice the model would otherwise get wrong.

### 5.4 Required states

Any element that loads data (`list`, and `form` when it prefills) **must** declare `empty`, `loading`, and `error`. Omission is a hard error, not a lint warning.

This is the one place the language is deliberately strict. Building only the happy path is the most common failure of AI-generated UI, and it happens because nothing ever forces otherwise. A language can force it.

### 5.5 `flow`

```
flow complete(task)
  set  task.done = true
  call api.complete(task)
    ok   -> toast "Done" undo 5s
    fail -> error "Couldn't complete it."
  go Inbox
```

Statements: `set` · `call` · `go` · `toast` · `confirm` · `error` · `undo`

Flows are not general-purpose code. They are a bounded list of effects. Anything more complex belongs in the generated application, not here — see Non-goals.

### 5.6 `component`

Identical body grammar to `screen`, minus `at`/`needs`/`intent`, plus a parameter list.

A component earns a file only when **three or more** screens use it. Extracting every fragment recreates the 40-files-nobody-can-hold problem this format exists to escape.

## 6. Profiles

Core grammar is shared. Each direction adds one optional section.

**Core (both):** `data`, `screen`, `component`, `flow`, body elements, required states.

**Authoring profile** adds generation detail: field validation, defaults, `needs` guards.

**Extraction profile** adds one `bind` block per screen, which authoring never writes and code generation never reads:

```
screen Repo
  at /:owner/:repo
  intent "Browse a repository"

  tabs Code | Issues | PullRequests
    -> Issues(owner, repo)

  list File
    row title, message, age
    tap -> FileView(path)
    empty "This repository is empty."
    loading skeleton 5 rows
    error "Couldn't load files."

  bind
    fingerprint a3f9c1
    confidence  0.92
    tabs        "nav[aria-label='Repository'] a"
    list File   "table[aria-labelledby=folders] tr"
```

`fingerprint` is a structural hash used for a cheap staleness check — mismatch re-extracts that one screen. `confidence` records how sure the extractor was, so an agent can decide whether to trust the index or verify against the page.

Extraction reads the **accessibility tree**, not raw DOM. Browsers already compute roles, labels, and landmarks; that layer is an order of magnitude smaller than DOM and is the abstraction we want. We are collapsing an existing semantic model, not inventing one.

## 7. Project layout and linking

```
ux/
  app.ux                  entry, auth, global state
  data/task.ux
  screens/inbox.ux
  screens/detail.ux
  components/task-row.ux
  .build/app.map          generated
```

One file per screen. Names resolve globally; there are no imports.

### The linker

Reads every file and checks what no single file can know:

- **Dead links** — `-> Checkout` with no `screen Checkout`
- **Unreachable screens** — defined, nothing arrows in
- **Dead ends** — a screen with no way out
- **Cross-screen type mismatch** — `Detail(task)` where `Detail` expects a `User`
- **Data shown but never fetched** — *not implemented in v1; see §10.* A
  `list`'s `where` clause and a `show` expression are free text today, so
  this is aspirational, not current behavior.
- **Missing required states**

Half of these are UX defects rather than code defects. A dead-end screen is not a crash; it is a user stuck, and normally nothing catches it until someone gets stuck.

### `app.map`

```
Login    -> Inbox | ResetPassword
Inbox    -> Detail | NewTask
Detail   -> Inbox
NewTask  -> Inbox
```

Small enough to stay in context permanently. A model edits one screen while reasoning correctly about the whole app, without loading the whole app. This is what makes the format scale past a hundred screens — and it is the same artifact an operating agent needs, arriving for free.

## 8. Non-goals (v1)

- **No styling or layout language.** Structure and meaning only. Visual decisions belong to the generator.
- **No animation, gesture, or canvas vocabulary.** Platform modifiers may add `swipe` and similar later; the core stays platform-neutral.
- **Not a general-purpose language.** No loops, no arbitrary expressions, no user-defined functions. `flow` is a bounded effect list.
- **No runtime agent protocol.** The live protocol for driving a running app is deliberately deferred. `app.map` is designed so it can be added without a format change.
- **No i18n.** Strings are literals in v1.

## 9. Acceptance test

The format's quality is measurable, which is unusual for a language and is the point.

**Adoption:** given the one-page spec plus three worked examples and nothing else, a model produces first-try clean-parsing `.ux` for **≥90%** of 20 held-out app descriptions it has never seen. A low number means the language is wrong, not the model.

**Compression:** extracted `.ux` for a page is **≤2%** of that page's DOM token count.

**Stability:** an index built against a site still validates by fingerprint after a routine redeploy of that site.

## 10. Known limitations

- **R4 (near-misses parse with a warning) is only half implemented.** The
  design called for an `onTap`-style near-miss to parse with a warning and
  normalize on format, so a model would learn the idiom from its own output in
  one round trip rather than from a rejected attempt. Half of that now exists:
  an unknown keyword that is obviously a typo of a real one is still an error,
  but the error names the word you meant — `` `onTap` is not a screen element.
  fix: did you mean `tap`? `` — which delivers R4's actual goal, self-correction
  in a single round trip, for the case that matters.
  What is still missing is the *accepting* half: `onTap` does not parse as
  `tap`. That is deliberate rather than unfinished. Accepting an alias is only
  safe if something rewrites it to the canonical spelling, and `ux fmt` does
  not exist — so an accepted alias would survive in the file indefinitely and
  the language would fragment into synonyms, which is exactly what R3 ("one way
  to say each thing") exists to prevent. The accepting half is therefore
  blocked on `ux fmt`, not on the near-miss logic, which is built and shared by
  the parser and linker in `src/similar.js`.
  The `WARNING` severity, dead since the first commit, is now what `ux lint`
  emits (`UX300`-`UX305`), so the permanently-zero warning count is gone too.
- **A `list`'s `where` clause and a `show` expression are free text,
  validated by nothing.** `list Show where popular` and `show
  nowPlaying.title` both check clean with `popular` and `nowPlaying`
  declared nowhere in the project — nothing resolves either expression
  against real fields or real data. §7 lists "data shown but never fetched"
  among the things the linker catches; it does not catch this. That bullet
  in §7 describes the linker's original ambition, not its current behavior;
  treat it as unimplemented in v1, not as a promise the current toolchain
  keeps.
- **Drift.** Authoring only works while `.ux` stays ahead of the code. A hand-edit to generated output that is not reflected back makes the source of truth a lie. v1 handles this by convention — generated files are marked, hand-edits are flagged — not by enforcement. This is a genuine weakness of v1 and is accepted knowingly.
- **Extraction is lossy by design.** Highly custom interfaces (canvas, drag-and-drop, games) collapse poorly into this vocabulary. The extractor should record low `confidence` and let the agent fall back to reading the page rather than emit a confident wrong index.
- **One grammar for two directions** risks serving neither perfectly. The profile split contains the risk; if it proves insufficient after the downstream specs are built, splitting the format is the escape hatch.
- **No search or filter-by-user-input.** A `list`'s `where` clause can reference a screen's own fields and simple comparisons, but has no way to reference a value the user just typed on that screen — there is no bound-variable or parameter syntax connecting a `form`-less text input to a `where` clause. A "search jobs" or "search people" screen cannot be expressed except as a tautology (`list Job where title is title`) paired with a flow that does nothing, and nothing in the checker or linker catches that this is meaningless rather than merely unusual. Found via the adoption benchmark (`bench/`, Task 12), which is the intended way for a gap like this to surface: a real construct, not a wording problem, and not worth guessing a design for from a single prompt. The workaround for now is a separate screen per filtered view (as `notes`' `AllNotes`/`Pinned` split does for a fixed condition) — that only works when the filter values are enumerable in advance, which "search" by definition is not. A future version should address this directly.

## 11. Downstream

- **Spec 2 — Authoring plugin.** Claude Code plugin: skill, grammar reference, examples, `ux check`, `/ux` command, codegen guidance.
- **Spec 3 — Chrome indexer.** Accessibility-tree extraction, per-origin index, fingerprint validation, agent navigation over the index.

Both are blocked on this format being fixed.
