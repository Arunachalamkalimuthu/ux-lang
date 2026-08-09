# Adopting an existing app

`codegen.md` covers `.ux` → code. This is the other direction: an app already
exists, and it needs a `.ux` file that tells the truth about it.

There is no automated importer. The Chrome indexer (live page → `.ux`) is
specified in the format design and unbuilt, and a static analyser over React
source is harder than it sounds — recovering a navigation graph from router
config, conditional pushes and callbacks threaded three components deep is the
problem the language exists to avoid, not one it can solve on the way in. So
this is a guided read, done in a specific order for specific reasons.

## The order matters

**1. Router first. Components last.**

Start from whatever declares routes — `app/` directory, `pages/`, a
`createBrowserRouter` call, a native navigator. Every route is a `screen`. Give
each one its `at`, and nothing else yet.

Do this before opening a single component. The navigation graph is the only
thing the language is strict about, it is the part a codebase hides worst, and
having the skeleton first stops you inventing screens that don't exist.

**2. Arrows next.**

Walk each screen for anything that moves the user: `<Link>`, `navigate(...)`,
`router.push`, a form's post-submit redirect, a tab bar. Each becomes an
`action`, a `tap`, a `submit`, or a `tabs` target.

Record what the code *does*, not what it should do. A button that navigates
nowhere becomes an `action` with no target — which `UX109` will flag, correctly,
because that button does nothing in the real app too.

**3. Data shapes, from the API layer.**

The types feeding the screens — an API client, a schema, a set of TS
interfaces. Only the fields the UI actually reads. A `data` block is not a
database schema; it is what appears on screen.

**4. Lists and forms.**

For each list, the type, the filter, the fields in a row, and what tapping a row
does. For each form, the type and the field names it binds — the real names, not
placeholders.

**5. Intents last, and write them yourself.**

One line per screen saying why someone comes here. This is the only part that
cannot be read out of the code, because the code never recorded it. If you
cannot write it for a screen, that is a finding.

## The first `ux check` is an audit, not a transcription report

This is the step people misread. A faithful `.ux` of a real app usually
produces a wall of diagnostics, and most of them are true statements about the
app rather than mistakes in the transcription:

```
UX202  `Receipt` has no way out — a user who lands here is stuck.
UX103  This list has no `loading` case.
UX100  `Confirm` has no intent.
UX201  Nothing links to `LegacySettings`.
```

Every one of those is worth knowing. A dead-end screen is in production right
now. A list with no loading case renders blank while fetching. A screen nothing
links to is dead code you are still maintaining.

So triage rather than silencing:

- **True of the app** → fix the app, or record it and move on. Do not soften the
  `.ux` to make the diagnostic disappear; that throws away the finding.
- **Not true of the app** → the transcription is wrong. Fix the `.ux`.

Resist the urge to reach a clean `ux check` on the first pass. A clean check on
a first import usually means the `.ux` describes an app you wish you had.

## Validity is not fidelity

A model reading a codebase will confidently produce a `.ux` that parses clean
and does not match the app. This is the failure mode the adoption benchmark
exists for, and it is invisible to `ux check`, which only knows whether the file
is well-formed.

Verify what actually parsed:

```
node <path-to-ux-lang-repo>/bench/inspect.mjs ux/
```

It prints every screen with where it leads, every form with its **actual parsed
field names**, every list with its data type, and every flow with its steps.
Read that against the real app. Specifically check:

- Do the form field names match the real form's fields, or are they placeholders?
- Does every screen in the app appear, and does anything appear that does not exist?
- Do the arrows go where the app actually goes?

Then `ux map ux/` and compare the graph to what you believe the app does.
A disagreement is a finding in one direction or the other.

## Scope: do not import the whole app at once

Take one flow end to end — signup, or checkout, or whatever is currently
painful. Get that faithful, verified, and useful. A partial `.ux` that is true
is worth more than a complete one that is approximately right, and the first
flow teaches you how the app's conventions map onto the language.

`UX201` (nothing links to this screen) and `UX111` (no `app` root) will fire
while a project is partial. That is expected. Add the `app` declaration early to
clear `UX111`; treat `UX201` as noise until the import is complete, then as a
real finding.

## What you get at the end

A file that states what the app is supposed to do, which the codebase never
recorded, plus a list of things that are wrong with it that no test was ever
going to catch. From there the normal loop applies: change the `.ux`, re-check,
regenerate the parts you want generated.
