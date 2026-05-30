---
title: 'Jobs and steps — the shape of everything'
description: 'Section 7 of the GitHub Actions Handbook.'
sidebar:
  order: 7
---
Two rules will take you most of the way:

**Jobs run in parallel by default.** If a workflow has `lint` and `test`, both run at the same time on separate runners. You don't have to do anything — parallelism is the default.

A quick aside since these two names show up everywhere:

- **Lint** is a static analysis step. It reads your code without running it and flags style problems, unused variables, unsafe patterns, missing types, and other things a careful human reviewer would catch. Common linters: ESLint (JavaScript / TypeScript), Pylint or Ruff (Python), golangci-lint (Go), `dotnet format` (C#), RuboCop (Ruby).
- **Test** is your test suite — unit tests, integration tests, end-to-end tests. It actually runs your code and verifies it behaves the way it's supposed to. Common runners: Jest, Pytest, Go's built-in `go test`, `dotnet test`, JUnit.

Lint catches "this looks wrong." Test catches "this *is* wrong." You usually want both, in parallel, on every PR.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

**Use `needs:` to run jobs in sequence.**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "building"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "deploying"
```

`deploy` now waits for `build` to succeed. If `build` fails, `deploy` doesn't run.

That's the whole model. Everything complicated in workflows comes from combining these two rules.

### Sharing data between steps

Sometimes one step generates a value that the next step needs. Steps can write to a special file called `$GITHUB_OUTPUT`:

```yaml
steps:
  - name: Generate version
    id: version
    run: echo "tag=v1.2.3" >> $GITHUB_OUTPUT

  - name: Use version
    run: echo "Tag is ${{ steps.version.outputs.tag }}"
```

Note the `id:` on the first step — that's how the second step references it.

### Sharing data between jobs

Jobs run on different runners, so they can't just read each other's files. Instead, upload an artifact in one job and download it in another:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "result" > output.txt
      - uses: actions/upload-artifact@v4
        with:
          name: my-output
          path: output.txt

  use-it:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: my-output
      - run: cat output.txt
```

Artifacts stick around for 90 days by default. The four times you'll actually reach for them:

| Use case | Why artifacts fit |
|----------|-------------------|
| Build job → deploy job | Deploy needs the binary, but they run on different machines. Upload from build, download in deploy. |
| Test job → coverage report | You want the report viewable for 90 days without keeping the runner alive. |
| Failed run debugging | Upload everything in `RUNNER_TEMP` on failure so you can download it after the run dies. |
| Passing data forward without a database | E.g., a build manifest, generated SQL migration files, screenshot diffs. |

You can also download artifacts from the Actions tab UI — handy when you want to grab a CI-built binary onto your laptop without rebuilding locally.

