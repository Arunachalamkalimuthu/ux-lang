# Changelog

Notable changes to ux-lang. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html) — with the usual
pre-1.0 caveat that the grammar may still change in breaking ways.

Diagnostic codes are the exception: once a code is assigned, its meaning never
changes. A rule is retired rather than repurposed.

## [Unreleased]

### Added

- **Five new diagnostics, from an audit of the checker against its own promise.**
  `UX021` an element that takes no indented body was given one; `UX022`
  `app`/`site` was given an indented body; `UX023` a `->` destination that is
  not a usable name; `UX024` an unknown branch inside a `call`; `UX112` a
  `list` with no data name.
  The first four are one missing rule in four places: the parser had no
  response to input it did not consume, so where it recognised a keyword but
  had nowhere to put what followed, it dropped it in silence — and the checker
  cannot report what the parser threw away. A `list` indented one level too far
  lost its required-state errors, its undeclared data type and its dangling
  `tap` together, and `ux check` exited 0. A whole project written under
  `app Demo` parsed to zero declarations and reported "No problems found."
  `tap -> task-detail` did not become a dangling link, it became no link at
  all. A misspelled `ok`/`fail` branch took its `go` with it. The lexer cannot
  catch any of them: each depth step is exactly +1, so `UX003` never fires.

- Published to npm as **`uxlang`**, so installing is `npm install -g uxlang`
  rather than a clone and a link. The hyphenated `ux-lang` was already taken by
  an unrelated package, so the repository, the site and the package differ by
  one character — noted in the README so nobody thinks they found a fork.
  `files` is an allowlist: the tarball carries the CLI, the toolchain, the
  plugin and the examples, and leaves out the website, the benchmark and the
  tests. `prepublishOnly` runs the suite, because npm will not let you reuse a
  version number and a broken publish cannot be taken back.

### Changed

- **Strings understand `\"` and `\\`.** A `.ux` string could not contain a quote
  at all: `intent "He said \"go\" once"` parsed to `He said \` — truncated at
  the escape, with no diagnostic. Those two escapes are now the entire
  vocabulary, and any other `\x` is `UX025` rather than a backslash that
  quietly disappears, which leaves room to give `\n` a meaning later without
  changing what any file means today.
  **This is a breaking change** for a string containing a literal backslash:
  `text "C:\temp"` is now `UX025` and must be written `"C:\\temp"`. Nothing in
  the repository was affected.
  One consequence worth naming: "am I inside a string right now" is asked by
  five separate scans — comment stripping, `UX004`, tab expansion, finding a
  `->` or a ` where `, and reading the value. They now share one
  implementation. Five private copies of that rule would drift, and drift is
  exactly how `UX004` first shipped broken.

### Fixed

- **Component navigation is now part of the flow graph.** `link()` checked a
  component's lists, forms and `use`s but never its `-> Name` links, so a
  dangling link inside a component was never reported and a real one never
  became an edge — a screen whose only way out lived in a shared nav component
  was called a dead end, its destination was called unreachable, and `ux map`
  drew neither. `lint.js` already counted those links, so two layers of the
  same toolchain disagreed. A component reports its own links once, at the line
  they are written on; every screen that `use`s it inherits the edges.
- **`screen Detail(task, mode)` parses.** The signature was read with
  `words(text)[1]`, so a space after the comma registered the screen as
  `Detail(task,` and produced three cascading errors whose fixes were
  unactionable — one suggested renaming the screen to the name it already had.
  `flow` and `component` already read the whole signature.
- **`UX206` covers a `list`'s `row` and `sort by`**, not just a form's fields.
  The same typo was a hard error in a form and silent in the list beside it.
  Only bare names resolve: a dotted path walks a relation, `desc` is a
  direction, and `where` stays free text.
- **`UX203` checks flow targets**, not only screen targets.
- **`UX205` covers `data`**, which took a bare `Set.add` while every other
  declaration kind went through `registerDecl`; duplicates shadowed last-wins,
  and `UX206` then reported a field the author had declared as not existing.
- **`ux fmt` is idempotent.** It tested the indent a line arrived with rather
  than the depth it is emitted at, so `ux fmt && ux fmt --check` could fail on
  a file `ux fmt` had just written.
- **Unknown flags and extra arguments are rejected.** `ux fmt --list-different`
  (Prettier's spelling of `--check`) rewrote every file in place and exited 0;
  `ux check --strict=true` turned the CI gate off silently; `ux check a b`
  checked `a` and never mentioned `b`.
- **`ux fmt` and `ux map` report I/O failures instead of dying.** `fmt` threw
  part-way through its write pass on any unreadable file, leaving a project
  half-formatted and saying nothing; it now reports each file it could not
  handle and continues. Files that are not valid UTF-8 are refused rather than
  rewritten, since `readFile(…, 'utf8')` turns undecodable bytes into U+FFFD
  and writing that back makes a lossy read permanent.
- **Symlinked directories are walked.** `readdir` reports on the link, not its
  destination, so a linked directory took its whole subtree with it and a
  project keeping shared screens behind a link was rejected for screens that do
  exist.
- **Tabs inside string literals are left alone.** `UX001` fired on any tab on
  the line, and `ux fmt` then rewrote a tab inside a string to two spaces,
  changing the value. A tab used for indentation is still `UX001`.
- **A UTF-8 BOM no longer fails `UX002`** with a fix the file already satisfied.
- **`UX305`'s fix line no longer repeats the `add:` prefix** that `report.js`
  supplies.
- **The website's 404 page is no longer a dead end** — it had no nav, no footer
  and no link on it, which is `UX202` on the site of the tool that reports it.

### Changed

- The website is now a Next.js app under `www/`, deployed to GitHub Pages by
  Actions instead of from a committed `docs/` folder. The hand-rolled builder,
  its markdown renderer and the committed output are gone.
  The move was driven by the markdown renderer: 35 lines whose entire job was
  to be invisible, which had produced two visible bugs (links unsupported, a
  preamble sliced by line count). Nine pages and two markdown-sourced documents
  was past the point where writing one by hand paid for itself.
  Two properties were protected rather than traded away. The toolchain still
  has **no dependencies** — `www/` is a separate package, and CI still fails the
  build if one appears at the root. And the playground still runs the real
  toolchain: it now does `import { parse } from '../../src/parser.js'`, a
  genuine import of the genuine file, which is a stronger guarantee than the
  regex-and-concatenate inliner it replaces.
  Nothing built is committed any more, so the site cannot be stale relative to
  its source — that replaces the staleness test entirely.

### Added

- `test/browser-safe.test.js`, which fails if any module in `src/` other than
  `project.js` reaches for a Node builtin. That property is what lets the
  website import the toolchain and run it in a browser, and it was previously
  protected only by nobody having broken it.

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
