---
name: False positive
about: ux check or ux lint rejects something that is correct
title: '[false positive] UXnnn on '
labels: ['false positive', 'bug']
---

**These are the highest-severity bugs in this project.** A tool that cries wolf
on valid input gets muted, and then it costs you every real finding too.

### The `.ux` that is wrongly rejected

Smallest version that still reproduces it. Include every file if it spans more
than one — several past false positives only appeared across a file boundary.

```
app Example

...
```

### What was reported

```
$ node bin/ux check ux/
ux/...  UXnnn  ...
  fix:  ...
```

### Why it is wrong

What the program actually does, and why the diagnostic does not apply.

### Environment

- Node version:
- Commit or version:
