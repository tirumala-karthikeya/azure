---
title: 'A quick YAML primer'
description: 'Section 3 of the GitHub Actions Handbook.'
sidebar:
  order: 3
---
Every workflow file is YAML. It's not a hard format, but it has a few rules that, if you break them, will make your workflow mysteriously stop working. Get these right and you'll save yourself a lot of confusion.

### Indentation is structure

Use spaces, never tabs. Pick two spaces per level and stay consistent. The indentation literally defines which thing is nested inside which.

```yaml
jobs:
  build:                     # 2 spaces in
    runs-on: ubuntu-latest   # 4 spaces in
    steps:
      - run: echo hi         # 6 spaces in
```

### Key-value pairs use colon-space

```yaml
name: CI
runs-on: ubuntu-latest
```

That space after the colon is required. `name:CI` won't parse.

### Lists use a leading dash

```yaml
branches:
  - main
  - develop
```

When the list items are themselves maps (like workflow steps), each item starts with `-`:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4
  - name: Test
    run: npm test
```

### Strings: quote when in doubt

Most of the time, plain strings just work:

```yaml
name: My Workflow
```

But quote anything that contains special characters or looks like another type. This bites a lot of beginners:

```yaml
cron: '0 3 * * *'
version: '3.10'     # without quotes YAML reads this as the number 3.1
```

### Multiline strings: `|` or `>`

YAML gives you two ways to write a value that spans several lines, and they behave very differently. Pick the wrong one and your shell script collapses into one giant line that fails in confusing ways.

**`|` (literal block scalar)** — preserves every line break exactly as you wrote it. The result is multi-line. This is what you want for shell scripts:

```yaml
steps:
  - name: Run several commands
    run: |
      echo "line one runs first"
      echo "line two runs second"
      ./scripts/build.sh
```

**`>` (folded block scalar)** — replaces every line break with a single space, producing one long string. Useful for prose-style values where you want to wrap a long sentence in your YAML for readability but the value itself should be one line:

```yaml
steps:
  - name: Set a long description
    run: >
      this entire block
      becomes one
      single line of text
```

**Rule of thumb**: shell commands → `|`. Anything else → you probably don't need it; just write it on one line.

### Comments

Anything after `#` on a line is ignored:

```yaml
runs-on: ubuntu-latest   # GitHub-hosted Ubuntu
```

### The mistakes that will bite you

These are the ones I see beginners hit, over and over. Keep them in mind.

| Mistake | What happens | Fix |
|---------|--------------|-----|
| Mixing tabs and spaces | "mapping values are not allowed here" | Spaces only. Configure your editor. |
| No space after `:` | Parse error | `key: value`, not `key:value`. |
| Inconsistent indentation | Keys silently vanish | Pick two spaces, stick to it. |
| Unquoted version numbers | `3.10` becomes `3.1` | Quote it: `'3.10'`. |
| Missing `-` on list items | Only the last item wins | Every list item needs its own `-`. |

