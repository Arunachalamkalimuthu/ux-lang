---
name: Silent pass
about: Something wrong that ux check accepts
title: '[silent pass] '
labels: ['bug']
---

Something the toolchain should have caught and didn't. Harder to notice than a
false positive and just as damaging — a clean exit code is supposed to mean
something.

### The `.ux` that wrongly passes

```
app Example

...
```

### What should have been reported, and why

Which rule you expected, or — if no rule covers this yet — what the rule ought
to be and which layer it belongs in (`check` for single-file structure, `link`
for names, `lint` for advice; see CONTRIBUTING.md).

### How you noticed

Especially useful if the parsed result differed from what you meant. If you ran
`node bench/inspect.mjs ux/`, paste the relevant part.

### Environment

- Node version:
- Commit or version:
