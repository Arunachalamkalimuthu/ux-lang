### What this changes, and why

The diff shows the what. Use this space for the why.

### Checklist

- [ ] `npm test` passes
- [ ] A test fails without this change (for a fix, the test that reproduces it)
- [ ] Valid input is covered too — a false positive is worse than a missed detection
- [ ] All three examples still `check` and `lint --strict` clean
- [ ] The website still builds, if `src/` or `www/` changed (`cd www && npm run build`)

### If you added a diagnostic

- [ ] It is in the right layer — `check` for single-file structure, `link` for
      names that may live in another file, `lint` for advice (see CONTRIBUTING.md)
- [ ] The code is the next free one in its range and its meaning is new
- [ ] It carries a `fix:` line someone can act on without thinking
- [ ] It has a row in `plugin/skills/ux/reference/grammar.md`

### If you changed the grammar

- [ ] The `## Grammar` section of `SKILL.md` is still under 800 tokens
- [ ] Benchmark run before and after — parse rate *and* fidelity (`bench/`)
