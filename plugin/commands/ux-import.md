---
description: Read an existing app into a .ux file, then audit what that reveals
---

Produce a `.ux` description of the app in this repository, one that tells the
truth about it. Follow `reference/import.md` bundled with the `ux` skill; the
order below is from that file and exists for reasons explained there.

1. **Find the routes first.** Locate whatever declares them — `app/`, `pages/`,
   a router config, a native navigator — and write one `screen` per route with
   its `at` path and nothing else yet. Do not open components at this stage.

2. **Add the arrows.** For each screen, find everything that moves the user
   (`<Link>`, `navigate`, `router.push`, post-submit redirects, tab bars) and
   record it as an `action`, `tap`, `submit` or `tabs` target. Record what the
   code does, not what it ought to do — a button that goes nowhere should end up
   as an action with no target.

3. **Add data shapes** from the API client, schema or TS types — only the fields
   the UI actually reads.

4. **Add lists and forms**, using the real field names the code binds, never
   placeholders.

5. **Write the intents yourself**, one line per screen. This is the only part
   not recoverable from the code. If a screen resists description, say so to the
   user rather than inventing one.

6. **Run `ux check ux/`.** If the shell reports `command not found`, fall back
   to `node <path-to-ux-lang-repo>/bin/ux check ux/`.

   Do not try to reach a clean run by editing the `.ux`. Present the
   diagnostics to the user in two groups:
   - **True of their app** — a real dead end, a list with no loading state, a
     screen nothing links to. These are findings; report them as such and let
     the user decide.
   - **Transcription errors** — the `.ux` says something the app does not. Fix
     these yourself and re-check.

   State plainly which group each diagnostic is in and why.

7. **Verify fidelity, which `ux check` cannot.** Run
   `node <path-to-ux-lang-repo>/bench/inspect.mjs ux/` and read the output
   against the real app: do form field names match the real fields, does every
   screen exist, do the arrows go where the app goes? A clean `ux check` proves
   the file is well-formed, not that it is true. Report any mismatch.

8. **Run `ux map ux/`** and show the user the navigation graph, asking whether
   it matches their understanding of the app. Disagreements are findings.

If the app is large, do one flow end to end rather than everything at once, and
tell the user which flow you took. `UX201` and `UX111` will fire on a partial
import; add the `app` declaration to clear `UX111` and note that `UX201` is
expected until the import is complete.

Arguments: $ARGUMENTS — an optional flow or area to start with (for example
"checkout"). With no argument, pick the flow with the most routes and say why.
