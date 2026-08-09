# Changelog

Notable changes to ux-lang. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html) — with the usual
pre-1.0 caveat that the grammar may still change in breaking ways.

Diagnostic codes are the exception: once a code is assigned, its meaning never
changes. A rule is retired rather than repurposed.

## [Unreleased]

### Added

- A diagram on the landing page showing what a dead end actually is: three
  screens, arrows between them, and one with none leaving it. The claim was
  only ever described in prose, and it is the one thing about this project that
  is easier to see than to read. Inline SVG using the site's own colour tokens,
  so it themes with the page and costs no request.
- `ROADMAP.md`, rendered onto the site as a page from the same source. States
  the ordering principle plainly: nothing should happen before the adoption
  benchmark is actually run, because everything after it is a bet on an
  unmeasured premise. Also says what is deliberately not planned, and what
  would change the plan.
- The site's markdown renderer now handles links. Relative targets resolve to
  the repository on GitHub rather than to a page that does not exist — `docs/`
  is served from a subdirectory and the files being linked live at the root.
- `ux fmt` — canonical layout for `.ux` files, with `--check` for CI. It is
  deliberately layout-only: two-space indentation, tabs converted, trailing
  whitespace stripped, blank runs collapsed, one blank line between
  declarations. It does not reorder declarations, align columns, or rewrite
  keywords, because a formatter that changes meaning is worse than none. The
  suite asserts the parse tree is identical before and after, for every example
  in the repo.
- Working on raw lines rather than re-printing the AST is what keeps comments —
  the tree does not carry them, so a round trip would delete every one.

### Fixed

- Markdown pages are sliced to their first `##` heading instead of a hardcoded
  line count, which had left half a sentence of the preamble on the page when
  that preamble grew.
- `UX002`'s suggested fix no longer changes how a file parses. It rounded the
  indent up while the lexer floors it, so at three spaces the line was already
  nested one level and following the advice to use four silently nested it two.
  Found while building `ux fmt`, which has to agree with the lexer exactly.

- `npm test` now runs on Node 20, not only 22. The script quoted its glob,
  which leaves expansion to Node — something Node only learned to do after 20 —
  so on the version the project claims as its floor the suite silently found no
  files. Caught by CI on its first run. The unquoted form lets the shell expand
  it and works on both; `node --test test/` is not an alternative, because Node
  22 resolves the directory as a module path.

## [0.1.0] — 2026-08-09

First public release. The language, the toolchain that checks it, and the plugin
that teaches it.

### Language

- Five declarations — `app`/`site`, `data`, `screen`, `component`, `flow` —
  with indentation as the only block structure and no import statements.
- Required `intent` on every screen, and required `empty`/`loading`/`error` on
  every list. Both are hard errors rather than lint, because building only the
  happy path is the usual failure of generated UI and nothing else forces
  otherwise.

### Toolchain

- `ux check` — 34 errors across two layers. `src/check.js` asks whether a file
  is well-formed; `src/linker.js` asks whether the names it references exist
  anywhere in the project. Exits non-zero while errors remain.
- `ux lint` — six warnings (`UX300`–`UX305`) for programs that are valid but
  probably not what you meant. Never fails a build unless given `--strict`.
- `ux map` — the navigation graph, written to `<dir>/.build/app.map`. Always
  exits 0; a map of a broken project is exactly what you want when hunting a
  dead end.
- Unknown keywords suggest the word you meant (`did you mean \`tap\`?`).
- Every diagnostic carries a `fix:` line naming the correction, so a model can
  self-correct without a human refereeing.
- Lexical errors sort ahead of everything else and print a banner, because
  diagnostics derived from a broken line may be noise until it is fixed.

### Tooling and docs

- Claude Code plugin: a skill whose grammar section fits in 422 tokens, a full
  grammar reference, a codegen guide, and an import guide for adopting an app
  that already exists.
- Three worked examples — `tasks`, `notes`, `shop` — kept clean by CI.
- Adoption benchmark (`bench/`) measuring both parse rate and fidelity, plus
  `bench/inspect.mjs` for reading what actually parsed.
- Website with a playground that runs the real toolchain in the browser, built
  from `src/` at build time rather than a copy.
- CI on Node 20 and 22, which also fails the build if a dependency appears.

### Known gaps

Listed in full in the README. The largest: the Chrome indexer (live page →
`.ux`) is specified and unbuilt, a list's `where` clause cannot reference
user input so search is inexpressible, and the adoption benchmark has never
been run.

[Unreleased]: https://github.com/Arunachalamkalimuthu/ux-lang/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Arunachalamkalimuthu/ux-lang/releases/tag/v0.1.0
