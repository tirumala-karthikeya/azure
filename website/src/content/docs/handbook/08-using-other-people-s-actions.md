---
title: 'Using other people''s actions'
description: 'Section 8 of the GitHub Actions Handbook.'
sidebar:
  order: 8
---
The Actions Marketplace is full of pre-built steps. You can browse it at [github.com/marketplace](https://github.com/marketplace?type=actions). These are the LEGO bricks of the GitHub Actions world, and most workflows are mostly made of them.

### How you call one

```yaml
- uses: owner/repo@version
  with:
    input-name: value
```

### The ones you'll actually use

| Action | What it does |
|--------|--------------|
| `actions/checkout@v4` | Clones your repo onto the runner. Almost every workflow needs it. |
| `actions/setup-node@v4` | Installs Node.js. |
| `actions/setup-python@v5` | Installs Python. |
| `actions/setup-java@v4` | Installs Java. |
| `actions/cache@v4` | Caches files between runs (big speedup). |
| `actions/upload-artifact@v4` | Saves files from a run for later. |
| `actions/download-artifact@v4` | Grabs saved files. |

### Pinning versions — and why it matters

When you write `@v4`, you get the latest release in the v4.x line. Convenient, but it means "the code you run tomorrow might not be the code you ran today."

Your options:

- `@v4` — latest in the v4 range. Fine for actions maintained by GitHub itself.
- `@v4.1.2` — an exact version. More stable.
- `@<commit-sha>` — pinned to a specific commit. Most secure — no one can change what you run by pushing a new tag.
- `@main` — whatever is on the action's main branch *right now*. Please don't.

For third-party actions, especially anything that handles secrets, pin to a commit SHA. It's the only way to guarantee the code doesn't change under you.

