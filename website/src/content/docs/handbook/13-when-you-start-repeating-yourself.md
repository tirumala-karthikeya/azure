---
title: 'When you start repeating yourself'
description: 'Section 13 of the GitHub Actions Handbook.'
sidebar:
  order: 13
---
At some point you'll notice the same five steps showing up at the top of every workflow. That's your signal to extract. GitHub Actions offers two tools for this, and they solve different problems.

### 13.1 Reusable workflows — reuse a whole job

One workflow file calls another. The callee declares `workflow_call:` as its trigger.

Callee — `.github/workflows/reusable-test.yml`:

```yaml
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string
    secrets:
      NPM_TOKEN:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: npm test
```

Caller — anywhere else:

```yaml
jobs:
  unit:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Use this when the unit you want to reuse is a **whole job** — like a shared test harness.

### 13.2 Composite actions — reuse a cluster of steps

A composite action packs several steps into one reusable step. Lives at `.github/actions/<name>/action.yml`.

```yaml
name: 'Setup Node with cache'
description: 'Checkout, install Node with npm cache, and run npm ci'
inputs:
  node-version:
    required: true
    default: '20'
runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
    - run: npm ci
      shell: bash
```

Usage:

```yaml
steps:
  - uses: ./.github/actions/setup-node-cached
    with:
      node-version: '20'
```

Use this when the thing you're reusing is a **setup pattern** — the first few steps of every job.

### Which one do I want?

| You want to reuse | Use |
|-------------------|-----|
| A whole job (or several) | Reusable workflow |
| A setup pattern of 2–5 steps | Composite action |
| Something across repos | Publish as a standalone repo action |
| Logic that needs its own runner | Reusable workflow (it owns `runs-on`) |

