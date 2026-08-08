# Generating code from .ux

`.ux` says what the interface means. Generation decides how it looks. These
rules keep generated code traceable back to its source.

## Mapping

| `.ux` | React output |
|---|---|
| `screen Name` | a route component in `app/` or `pages/` |
| `at /path` | the route path; no `at` means an unrouted child screen |
| `needs signed-in` | wrap the route in the project's auth guard |
| `intent "…"` | a comment above the component; never rendered |
| `data Name` | a TypeScript `interface` plus its fetch/mutate hooks |
| `list D where c` | a query with the filter, plus all three states rendered |
| `empty` / `loading` / `error` | three real branches — never omit any |
| `action "L" -> S` | a button or link navigating to `S`'s route |
| `action verb` / `action verb(arg)` | a button calling flow `verb`, passing any arguments through |
| `action retry` | a button re-running the query for the `list`/state it's in — no flow to generate, it is built in |
| `form D` | a form component with fields from `data D`. Each field's actual requiredness comes from `data D`'s own declaration; a modifier written on the form field itself (e.g. `title required`) is advisory for the generator, not a second source of truth. |
| `flow name(x)` | a function in `flows/name.ts` |
| `component N` | a shared component in `components/N.tsx` |

## Rules

1. **Render all three list states.** They are in the source because they are
   required. Dropping one silently is the exact failure `.ux` exists to
   prevent.
2. **Mark generated files.** First line: `// generated from ux/<file>.ux — edit
   the .ux, not this file`.
3. **Never invent screens or navigation.** If a target is missing, the fix
   belongs in the `.ux`, not in the generated code.
4. **Styling is yours.** `.ux` says nothing about looks. Follow the project's
   existing design system; if there is none, keep it plain and accessible.
5. **Regenerate, do not patch.** For a UI change, edit the `.ux`, run
   `ux check`, then regenerate the affected files.

## Loop

```
edit .ux  ->  ux check ux/  ->  fix diagnostics  ->  generate  ->  run
```

Every diagnostic includes the fix (rendered as `fix:` in `ux check`'s
output). If `ux check` exits non-zero, do not generate — `ux check` is the
gate; `ux map` is not (it always exits 0, even on a broken project, and only
reports an error count).
