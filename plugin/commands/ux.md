---
description: Check a .ux project, show its flow map, and generate code from it
---

Work with the `.ux` files in this project.

1. If no `ux/` directory exists, create one and write `app.ux` plus a first
   screen based on what the user described.
2. Try `ux check ux/`. If the shell reports `command not found`, the CLI
   hasn't been linked in this environment — use `npx uxlang check ux/`, or,
   with no network, `node "${CLAUDE_PLUGIN_ROOT}/../bin/ux" check ux/` (this
   plugin ships from that repo, one level above the plugin root). Report every
   diagnostic with its fix (the line labeled `fix:`). If any error remains,
   fix the `.ux` and check again before continuing — `ux check` exits
   non-zero while errors remain; that exit code is the gate.
3. Run `ux map ux/` (same fallback as step 2) and show the user the
   navigation graph. Note that `ux map` always exits 0, even on a broken
   project (it prints an error count instead of failing), so do not treat a
   clean-looking map as proof the project checks clean — rely on step 2 for
   that.
4. If the user asked for code, generate it following the `codegen.md`
   reference bundled with the `ux` skill (`reference/codegen.md`).

Arguments: $ARGUMENTS — an optional project directory (default `ux`).
