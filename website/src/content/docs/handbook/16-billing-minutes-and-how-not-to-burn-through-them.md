---
title: 'Billing, minutes, and how not to burn through them'
description: 'Section 16 of the GitHub Actions Handbook.'
sidebar:
  order: 16
---
GitHub Actions is free for public repos. Truly, genuinely free, no cap. For private repos, minutes are metered — and it's easy to eat through them without realizing.

### The free tier

| Plan | Free minutes per month | Free storage |
|------|------------------------|--------------|
| Free | 2,000 | 500 MB |
| Pro / Team | 3,000 | 1 GB |
| Enterprise | 50,000 | 50 GB |

Public repos get unlimited minutes. The numbers above are private repos only.

### The cost multipliers

Each runner OS bills at a different rate, and this is where people get caught out:

| Runner | Multiplier |
|--------|------------|
| `ubuntu-latest` | 1× |
| `windows-latest` | 2× |
| `macos-latest` | 10× |
| Larger runners | 2–16× depending on tier |

A 10-minute macOS job eats 100 minutes of your quota. Ubuntu is the default for a reason — use macOS only when you're building or testing something Mac-specific.

### Keep an eye on it

Settings → Billing and plans → Usage this month. Worth checking monthly, especially after adding a scheduled workflow (those run whether you're looking or not).

### Ways to spend less

1. **Cancel redundant runs** — `concurrency: { cancel-in-progress: true }` stops older runs when a new push lands.
2. **Cache dependencies** — saves 1–3 minutes per job. Huge win.
3. **Path filters** — skip workflows that don't care about the files that changed.
4. **Matrix `include`/`exclude`** — test only the combinations you actually care about.
5. **Prefer Ubuntu** — 10× cheaper than macOS, 2× cheaper than Windows.
6. **Set `timeout-minutes`** — stops a runaway loop from eating hours:

   ```yaml
   jobs:
     build:
       runs-on: ubuntu-latest
       timeout-minutes: 15
   ```

7. **Self-hosted runners** — if you have the capacity, runners you host yourself cost zero minutes. You're trading money for maintenance work, so pick your battles.

