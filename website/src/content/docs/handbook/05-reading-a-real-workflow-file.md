---
title: 'Reading a real workflow file'
description: 'Section 5 of the GitHub Actions Handbook.'
sidebar:
  order: 5
---
The hello world above is too small to be educational. Here's something closer to what you'll see in a real repo, broken down key by key.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

### What every piece does

- **`name`** — the friendly name shown in the Actions tab. Optional, but your future self will thank you.
- **`on`** — the trigger. Here, the workflow runs on any push or PR targeting `main`.
- **`env`** — environment variables, available to every job and step in this file. You can also set them per-job or per-step if you want tighter scope.
- **`jobs`** — the jobs in this workflow. Each key under `jobs:` (like `test`) is a job ID.
- **`runs-on`** — which runner to use. Common choices: `ubuntu-latest`, `macos-latest`, `windows-latest`.
- **`uses`** — calls a pre-built action. `actions/checkout@v4` clones your repo. You'll use this one in nearly every workflow.
- **`with`** — arguments for the action you're calling.
- **`run`** — just runs a shell command directly.

That's all the top-level syntax in a real workflow. Everything else is variations.

