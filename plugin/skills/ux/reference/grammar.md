# .ux grammar reference

This file is loaded only when `SKILL.md`'s grammar section omits a detail
you need. It has no size budget. The sections below are drawn from the
format's design spec, corrected against the current implementation in
`src/` — where the two disagreed, this file follows the code.

## 4. Lexical rules

- Indentation is significant. Two spaces per level. Tabs are an error.
- `#` begins a comment to end of line.
- Strings are double-quoted. No interpolation in v1.
- Declarations are `PascalCase` (`Task`, `Inbox`). Fields and flows are `camelCase`.
- No semicolons, braces, or import statements.
- One declaration per file is conventional but not enforced. (Note:
  duplicate-name checking across files — `UX205` — applies to `screen`,
  `flow`, and `component` names. `data` names are not checked for cross-file
  duplicates.)

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
action star                       # bare verb: calls flow `star`, no args
action star(topic)                # bare verb, with args — still no label, no `->`

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

**`retry` is a built-in action verb.** `action retry` (usually inside a list's `error` state) needs no `flow retry` declaration — the runtime handles it. It also creates no navigation edge in the flow graph, so it does not, on its own, satisfy the "every screen needs a way out" rule (`UX202`). A screen whose only actions are `retry` inside its list states is still a dead end and will be reported as one.

### 5.4 Required states

Every `list` **must** declare `empty`, `loading`, and `error`. Omission is a hard error (`UX102` / `UX103` / `UX104`), not a lint warning. (The design spec's original ambition extended this to `form` when it prefills data; as implemented, only `list` is checked — `form` has no state requirement in v1.)

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

Statements: `set` · `call` · `go` · `toast` · `confirm` · `error`

`undo` is not its own statement — it is a trailing modifier on `toast`, written `toast "…" undo 5s`.

A `call`'s `ok`/`fail` branch needs `->` and exactly one step (`UX019` if the arrow is missing). That step cannot itself contain nested branches (`UX018`) — if the effect is that complex, give it its own `flow` and call that instead.

Flows are not general-purpose code. They are a bounded list of effects. Anything more complex belongs in the generated application, not here — see Non-goals.

### 5.6 `component`

Identical body grammar to `screen`, minus `at`/`needs`/`intent` (both `screen` and `component` take a parameter list).

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

### The checker (per file)

Runs on each file independently, before any cross-file linking:

- Malformed indentation, unknown keywords, malformed fields — the lexer and parser diagnostics (`UX001`–`UX019`).
- A screen with no `intent`, or no body content (`UX100`, `UX101`).
- A `list` missing `empty`, `loading`, or `error` (`UX102`–`UX104`).
- The same name declared twice **within one file** (`UX107`).

### The linker (whole project)

Reads every file and checks what no single file can know:

- **Dead links** — `-> Checkout` with no `screen Checkout`, or a `flow`'s own `go` to a screen that doesn't exist (`UX200`)
- **Unreachable screens** — defined, nothing arrows in (`UX201`)
- **Dead ends** — a screen with no way out; `retry` doesn't count (`UX202`)
- **Argument-count mismatches** — `Detail(task, extra)` where `screen Detail(task)` takes one argument (`UX203`). This checks arity only — it does not check that the argument's *type* matches what the target screen expects.
- **Unknown components** — `use Thing(...)` with no `component Thing` (`UX204`)
- **Cross-file name collisions** — the same `screen`, `flow`, or `component` name declared in two different files (`UX205`)
- **Unresolvable field, list, and form types** — a `data` field whose type is neither a primitive nor another declared `data` (`UX105`); a `list` or `form` naming a `data` type that was never declared (`UX106`)
- **Unresolvable form fields** — a `form`'s field that its resolved `data` type does not declare (`UX206`) — the fix names the real fields, and suggests a specific one when the field looks like a typo of it

Half of these are UX defects rather than code defects. A dead-end screen is not a crash; it is a user stuck, and normally nothing catches it until someone gets stuck.

### `app.map`

```
Login    -> Inbox | ResetPassword
Inbox    -> Detail | NewTask
Detail   -> Inbox
NewTask  -> Inbox
```

Small enough to stay in context permanently. A model edits one screen while reasoning correctly about the whole app, without loading the whole app. `ux map` writes this to `<dir>/.build/app.map` and always exits 0 — even against a broken project it prints the graph, followed by an `N error(s) — run \`ux check\` for details` line if there are any. It is a diagnostic aid, not the gate: use `ux check` to decide whether a project is clean.

## Diagnostic codes

| Code | Meaning |
|---|---|
| UX001 | a tab character was used for indentation |
| UX002 | an indent is not a multiple of two spaces |
| UX003 | a line is indented more than one level deeper than the line above it |
| UX010 | unknown top-level keyword (must be one of `app`, `site`, `data`, `screen`, `component`, `flow`) |
| UX011 | a field name is declared twice in one `data` block |
| UX012 | a field has no type (including a bare `required` with nothing before the type) |
| UX013 | an unknown screen element, or an unknown entry inside a `list` block |
| UX014 | `intent` is not a quoted one-line string |
| UX015 | `else` with no matching `if` directly above it at the same indent |
| UX016 | an unknown flow step (must be one of `set`, `call`, `go`, `toast`, `confirm`, `error`) |
| UX017 | `set` has no `=` value, or uses `==` where a single `=` was meant |
| UX018 | a step inside a `call`'s `ok`/`fail` branch has its own nested branches |
| UX019 | an `ok`/`fail` branch is missing `->` and a step |
| UX100 | a screen has no `intent` |
| UX101 | a screen has no body content |
| UX102 | a `list` has no `empty` case |
| UX103 | a `list` has no `loading` case |
| UX104 | a `list` has no `error` case |
| UX105 | a `data` field's type is neither a primitive, an inline enum, nor a declared `data` name (linker, project-wide) |
| UX106 | a `list` or `form` names a `data` type that was never declared anywhere in the project (linker, project-wide) |
| UX107 | the same name is declared twice within one file |
| UX200 | a navigation target (`-> Name`, from a screen or from a flow's `go`) does not exist |
| UX201 | a screen is unreachable — nothing links to it |
| UX202 | a screen has no way out (a self-loop or `action retry` alone does not count) |
| UX203 | a navigation target expects a different number of arguments than were passed |
| UX204 | `use` names a component that was never declared |
| UX205 | the same `screen`, `flow`, or `component` name is declared in two different files |
| UX206 | a `form` lists a field its resolved `data` type does not declare (linker, project-wide) |
