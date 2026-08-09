# Security Policy

## Supported versions

The project is pre-1.0. Only `master` is supported — fixes land there, and there
are no maintained release branches.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/Arunachalamkalimuthu/ux-lang/security/advisories/new).
That channel is private between you and the maintainers, and needs no email
address from either side.

If that is unavailable to you, contact the maintainers at
**[ CONTACT EMAIL — fill in before relying on this ]**.

Expect an acknowledgement within a week. Because this is a small project, please
allow reasonable time for a fix before disclosing publicly.

## What is in scope

Realistically, the attack surface here is narrow — the toolchain is a
zero-dependency CLI that reads text files and writes text files, and the website
is static with no server behind it. Things that would genuinely matter:

- **Path traversal or arbitrary writes.** `ux map` writes `<dir>/.build/app.map`.
  Anything that lets a crafted project write outside that path is a real bug.
- **Denial of service on untrusted input.** The lexer, parser, linker and the
  Levenshtein matcher in `src/similar.js` all run over input a user may not have
  written. Input that makes them hang or exhaust memory counts.
- **Script injection through the website's playground.** It renders diagnostics
  into the DOM. Diagnostic text derives from user input, so a payload that
  escapes escaping and executes is in scope.
- **Anything that causes the toolchain to execute code from a `.ux` file.** It
  must never do this. `.ux` is data.

## What is not in scope

- **`ux check` missing a defect in your app.** The checker is deliberately
  incomplete, and its known gaps are listed in the README and the
  [format design](docs/format-design.md). That is a correctness issue — open a
  normal issue.
- **Generated code.** What a model produces from a `.ux` file is not this
  project's output, and nothing here reviews it for security.
- **Dependencies.** There are none, and CI fails the build if that changes.
