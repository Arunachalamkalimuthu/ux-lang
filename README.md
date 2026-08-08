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

It also makes the language testable in a way languages usually aren't — given the spec and three examples, what fraction of a model's first attempts parse clean? A low number means the language is wrong, not the model.

## Status

Early. The format design is specified; implementations are not built yet.

- **[Format design](docs/superpowers/specs/2026-08-08-ux-format-design.md)** — the grammar, profiles, linker, and acceptance tests
- **Authoring plugin** — not yet specified
- **Chrome indexer** — not yet specified

## License

Apache-2.0. The patent grant is deliberate: a format is only worth having if other people can implement it without asking.
