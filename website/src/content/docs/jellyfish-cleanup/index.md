---
title: Jellyfish deployments cleanup
description: PR-previews, merge-deletes. A small Python tool plus a GitHub Actions workflow that bulk-deletes Jellyfish DevOps deployments inside a date range.
sidebar:
  order: 1
---

A small, two-file Python tool plus a GitHub Actions workflow that bulk-deletes [Jellyfish DevOps](https://jellyfish.co/) deployments inside a date range. Opening a PR previews what would be deleted; merging to `main` executes the delete.

## What it does

The Jellyfish webhook API stores a deployment record for every release event ingested. Over time these accumulate — failed pushes, replays from CI, duplicates from re-ingestion — and skew DORA metrics. This tool gives you a controlled way to bulk-delete them by date range, with a PR-driven preview step so nothing is deleted without a human eyeballing the list first.

Flow:

```text
1. Edit START_DATE / END_DATE / DRY_RUN in the workflow file
2. Open a PR with the change
   ↓
3. CI job runs `list` against the Jellyfish API
   ↓
4. Workflow comments on the PR with the matching deployments + count
   ↓
5. Reviewer eyeballs the preview comment
   ↓
6. PR merges to main
   ↓
7. CD job re-runs `list`, then `delete` (or `--dry-run` if DRY_RUN=true)
   ↓
8. GitHub job summary shows the final count
```

The script can also run standalone from your laptop for one-off cleanups.

## Folder layout

```text
jellyfish-cleanup/
├── .github/
│   └── workflows/
│       └── cleanup-deployments.yml
├── jellyfish_cleanup.py
└── requirements.txt
```

The `.github/workflows/` directory **must live at the repository root** if you want GitHub Actions to pick it up — keeping it under `jellyfish-cleanup/` works only if this folder is itself the repo root, or if you symlink / move the workflow up one level. If you nest the tool inside a larger repo, move `cleanup-deployments.yml` to the repo's top-level `.github/workflows/` and keep the rest under `jellyfish-cleanup/`.

## Prerequisites

| Item | Why |
|---|---|
| Jellyfish API token | Set as `JELLYFISH_API_TOKEN` locally and as a GitHub Actions secret in the repo. |
| Python 3.11+ | `from __future__ import annotations` plus modern type hints. |
| `requests>=2.31.0` | HTTP client; pinned in `requirements.txt`. |
| Repo write access | To open the PR that previews the cleanup. |
| `pull-requests: write` permission on the CI job | So the bot can comment the preview on the PR. |

The Jellyfish token must have permission for the `webhooks.jellyfish.co/deployment` endpoint (read + delete). Generate it from the Jellyfish admin UI under **Settings → Integrations → API tokens**.

## `requirements.txt`

```text
requests>=2.31.0
```

That's the entire dependency surface. Pinned to 2.31 because earlier versions had a known cert-verification regression on macOS.

## `jellyfish_cleanup.py`

Two subcommands: `list` (GET deployments in a date range, write to JSON) and `delete` (read the JSON, DELETE each one).

```python
#!/usr/bin/env python3
"""Jellyfish DevOps API cleanup tool.

Two subcommands:
  list   - GET deployments within [start_date, end_date], write to JSON file.
  delete - read the JSON file and DELETE each deployment.

Auth: requires env var JELLYFISH_API_TOKEN.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date
from typing import Any

import requests

BASE_URL = "https://webhooks.jellyfish.co"
DEPLOYMENT_PATH = "/deployment"
REQUEST_TIMEOUT = 30
DELETE_SLEEP_SECONDS = 0.1


def _token() -> str:
    token = os.environ.get("JELLYFISH_API_TOKEN")
    if not token:
        sys.exit("ERROR: JELLYFISH_API_TOKEN env var is not set.")
    return token


def _headers(dry_run: bool = False) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-jf-api-token": _token(),
    }
    if dry_run:
        headers["X-jf-api-dry-run"] = "true"
    return headers


def _parse_iso_date(value: str) -> str:
    """Validate YYYY-MM-DD format and return it unchanged."""
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid date '{value}', expected YYYY-MM-DD") from exc
    return value


def _decode_deployment(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Decode the wire format: {'data': '<json string>', 'timestamp': '...'}."""
    raw = entry.get("data")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print(f"WARN: skipping entry with non-JSON data field: {raw[:80]}...")
        return None


def list_deployments(start_date: str, end_date: str, output_path: str, limit: int | None) -> int:
    params: dict[str, Any] = {"start_date": start_date, "end_date": end_date}
    if limit:
        params["limit"] = limit

    print(f"Querying {BASE_URL}{DEPLOYMENT_PATH} with params={params}")
    resp = requests.get(
        f"{BASE_URL}{DEPLOYMENT_PATH}",
        headers=_headers(),
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    payload = resp.json()
    raw_entries = payload.get("deployments", [])
    deployments = []
    for entry in raw_entries:
        decoded = _decode_deployment(entry)
        if decoded and decoded.get("reference_id"):
            deployments.append(decoded)

    output = {
        "start_date": start_date,
        "end_date": end_date,
        "count": len(deployments),
        "deployments": deployments,
    }
    with open(output_path, "w") as fh:
        json.dump(output, fh, indent=2)

    print(f"Found {len(deployments)} deployment(s). Wrote {output_path}.")
    if deployments:
        print("Sample:")
        for d in deployments[:5]:
            print(f"  - {d.get('reference_id')}  deployed_at={d.get('deployed_at')}  repo={d.get('repo_name')}")
        if len(deployments) > 5:
            print(f"  ... and {len(deployments) - 5} more")
    return 0


def delete_deployments(input_path: str, dry_run: bool) -> int:
    with open(input_path) as fh:
        payload = json.load(fh)

    deployments = payload.get("deployments", [])
    if not deployments:
        print("Nothing to delete.")
        return 0

    headers = _headers(dry_run=dry_run)
    mode = "DRY RUN" if dry_run else "LIVE"
    print(f"[{mode}] Deleting {len(deployments)} deployment(s) from {payload.get('start_date')} to {payload.get('end_date')}")

    succeeded = 0
    already_gone = 0
    failed: list[tuple[str, str]] = []

    for deployment in deployments:
        ref_id = deployment["reference_id"]
        url = f"{BASE_URL}{DEPLOYMENT_PATH}/{ref_id}"
        try:
            resp = requests.delete(url, headers=headers, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            print(f"  FAIL  {ref_id}: network error {exc}")
            failed.append((ref_id, str(exc)))
            continue

        if resp.status_code in (200, 204):
            print(f"  OK    {ref_id}")
            succeeded += 1
        elif resp.status_code == 404:
            print(f"  SKIP  {ref_id}: not found (already deleted?)")
            already_gone += 1
        else:
            print(f"  FAIL  {ref_id}: HTTP {resp.status_code} {resp.text[:200]}")
            failed.append((ref_id, f"HTTP {resp.status_code}"))

        time.sleep(DELETE_SLEEP_SECONDS)

    print(f"\nSummary: {succeeded} deleted, {already_gone} already gone, {len(failed)} failed.")
    if failed:
        print("Failures:")
        for ref_id, reason in failed:
            print(f"  - {ref_id}: {reason}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Jellyfish DevOps API cleanup tool")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="Fetch deployments in a date range")
    p_list.add_argument("--start-date", required=True, type=_parse_iso_date, help="YYYY-MM-DD")
    p_list.add_argument("--end-date", required=True, type=_parse_iso_date, help="YYYY-MM-DD")
    p_list.add_argument("--output", default="deployments.json", help="Output JSON path")
    p_list.add_argument("--limit", type=int, default=None, help="Max results to return")

    p_del = sub.add_parser("delete", help="Delete deployments listed in a JSON file")
    p_del.add_argument("--input", default="deployments.json", help="Input JSON path from `list`")
    p_del.add_argument("--dry-run", action="store_true", help="Use X-jf-api-dry-run header")

    args = parser.parse_args()

    if args.command == "list":
        return list_deployments(args.start_date, args.end_date, args.output, args.limit)
    if args.command == "delete":
        return delete_deployments(args.input, args.dry_run)
    return 2


if __name__ == "__main__":
    sys.exit(main())
```

### Design choices

- **Two subcommands, not one** — list-then-delete forces you to inspect the JSON before destroying anything. The intermediate file is what gets uploaded as a workflow artifact for audit.
- **Wire format decoding** — Jellyfish returns each deployment as `{"data": "<json string>", "timestamp": "..."}` rather than a plain object. `_decode_deployment` unwraps the inner JSON and skips malformed rows with a warning rather than crashing the run.
- **`X-jf-api-dry-run` header on delete** — the Jellyfish API itself supports a dry-run mode. Passing `--dry-run` flips the header and the server short-circuits the delete. This is more trustworthy than client-side "would have deleted" logging.
- **Rate-limit sleep** — `time.sleep(0.1)` between deletes keeps you under Jellyfish's per-token rate limits. Tune `DELETE_SLEEP_SECONDS` up if you start seeing 429s on large batches.
- **Skip on 404** — running `delete` twice should not fail. 404 means the row is already gone and counts as `already_gone`, not a failure.

### Standalone CLI usage

```bash
export JELLYFISH_API_TOKEN=<your-token>

# 1. Preview — writes deployments.json
python jellyfish_cleanup.py list \
  --start-date 2026-01-01 \
  --end-date   2026-04-30 \
  --output     deployments.json

# 2. Inspect
cat deployments.json | jq '.count, .deployments[].reference_id'

# 3. Dry-run delete (uses Jellyfish's server-side dry-run header)
python jellyfish_cleanup.py delete --input deployments.json --dry-run

# 4. Real delete
python jellyfish_cleanup.py delete --input deployments.json
```

## `.github/workflows/cleanup-deployments.yml`

The workflow has two jobs:

- **`list` (CI)** — fires on PRs that touch the script or the workflow file. Runs the `list` subcommand, builds a markdown preview, comments it on the PR, uploads the JSON as an artifact.
- **`delete` (CD)** — fires on push to `main` when **the workflow file itself** changed (where the date range lives). Re-fetches the deployment list at merge time and deletes.

```yaml
name: Cleanup Jellyfish Deployments

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'jellyfish-cleanup/jellyfish_cleanup.py'
      - '.github/workflows/cleanup-deployments.yml'
  push:
    branches: [main]
    # CD triggers only on workflow file changes (where dates live).
    # Script-only changes will not fire a delete on merge.
    paths:
      - '.github/workflows/cleanup-deployments.yml'

# Cleanup parameters. Edit these values to define a cleanup; opening a PR
# previews the matching deployments, merging to main executes the delete.
env:
  START_DATE: "2026-01-01"
  END_DATE: "2026-04-30"
  # Set to "true" to use the X-jf-api-dry-run header (no real deletes).
  DRY_RUN: "false"
  # Optional cap on the number of deployments returned by the list query.
  LIMIT: ""

jobs:
  list:
    name: CI - List deployments
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        working-directory: jellyfish-cleanup
        run: pip install -r requirements.txt

      - name: List deployments
        working-directory: jellyfish-cleanup
        env:
          JELLYFISH_API_TOKEN: ${{ secrets.JELLYFISH_API_TOKEN }}
        run: |
          ARGS="--start-date ${{ env.START_DATE }} --end-date ${{ env.END_DATE }} --output deployments.json"
          if [ -n "${{ env.LIMIT }}" ]; then
            ARGS="$ARGS --limit ${{ env.LIMIT }}"
          fi
          python jellyfish_cleanup.py list $ARGS

      - name: Build PR comment
        id: comment
        working-directory: jellyfish-cleanup
        run: |
          python - <<'PY' >> "$GITHUB_OUTPUT"
          import json, os
          with open("deployments.json") as f:
              data = json.load(f)
          deps = data.get("deployments", [])
          dry = os.environ["DRY_RUN"]
          body = []
          body.append("### Jellyfish cleanup preview")
          body.append("")
          body.append(f"- Range: `{data['start_date']}` to `{data['end_date']}`")
          body.append(f"- Dry run on merge: `{dry}`")
          body.append(f"- Matching deployments: **{len(deps)}**")
          body.append("")
          if deps:
              body.append("Sample (first 10):")
              body.append("")
              body.append("| reference_id | deployed_at | repo |")
              body.append("|---|---|---|")
              for d in deps[:10]:
                  body.append(f"| `{d.get('reference_id','')}` | {d.get('deployed_at','')} | {d.get('repo_name','')} |")
              if len(deps) > 10:
                  body.append("")
                  body.append(f"...and {len(deps) - 10} more (see `deployments-to-delete` artifact).")
          body.append("")
          body.append("**Merging this PR will delete the listed deployments.**")
          payload = "\n".join(body)
          print("comment<<EOF")
          print(payload)
          print("EOF")
          PY

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const marker = "<!-- jellyfish-cleanup-preview -->";
            const body = `${marker}\n${`${{ steps.comment.outputs.comment }}`}`;
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body && c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

      - name: Upload deployments artifact
        uses: actions/upload-artifact@v4
        with:
          name: deployments-to-delete
          path: jellyfish-cleanup/deployments.json
          retention-days: 14

  delete:
    name: CD - Delete deployments
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        working-directory: jellyfish-cleanup
        run: pip install -r requirements.txt

      - name: List deployments (re-fetch at merge time)
        working-directory: jellyfish-cleanup
        env:
          JELLYFISH_API_TOKEN: ${{ secrets.JELLYFISH_API_TOKEN }}
        run: |
          ARGS="--start-date ${{ env.START_DATE }} --end-date ${{ env.END_DATE }} --output deployments.json"
          if [ -n "${{ env.LIMIT }}" ]; then
            ARGS="$ARGS --limit ${{ env.LIMIT }}"
          fi
          python jellyfish_cleanup.py list $ARGS

      - name: Delete deployments
        working-directory: jellyfish-cleanup
        env:
          JELLYFISH_API_TOKEN: ${{ secrets.JELLYFISH_API_TOKEN }}
        run: |
          ARGS="--input deployments.json"
          if [ "${{ env.DRY_RUN }}" = "true" ]; then
            ARGS="$ARGS --dry-run"
          fi
          python jellyfish_cleanup.py delete $ARGS

      - name: Summarize result
        working-directory: jellyfish-cleanup
        run: |
          COUNT=$(python -c "import json; print(json.load(open('deployments.json'))['count'])")
          {
            echo "### Cleanup executed"
            echo ""
            echo "- Range: \`${{ env.START_DATE }}\` to \`${{ env.END_DATE }}\`"
            echo "- Processed: **$COUNT** deployment(s)"
            echo "- Dry run: \`${{ env.DRY_RUN }}\`"
          } >> $GITHUB_STEP_SUMMARY
```

### How the two jobs differ

| | `list` (CI) | `delete` (CD) |
|---|---|---|
| Triggers on | `pull_request` events touching the script or workflow | `push` to `main` touching the **workflow file only** |
| What it runs | `list` subcommand + PR comment | `list` again, then `delete` |
| Side effects | None — read-only API call + PR comment | Real DELETEs against Jellyfish |
| Why re-list on CD | Repos receive new deployments between PR open and merge. Re-fetching at merge time guarantees you're acting on current data, not a stale preview. |
| Token usage | Read-only | Read + delete |

### Why CD only triggers on workflow-file changes

The intention is: dates live in `env:` of the workflow file. A pure script-only change shouldn't trigger a delete — that would be surprising. So `push.paths` is scoped to `.github/workflows/cleanup-deployments.yml` only. If you want to also re-run after script edits land on main, add the script path back into the `push.paths` list.

## Repo setup

One-time setup before the first cleanup:

1. **Add the token as a repo secret**
   - GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `JELLYFISH_API_TOKEN`
   - Value: your Jellyfish API token
2. **Grant the workflow `pull-requests: write`**
   - Already in the YAML under `jobs.list.permissions`. No extra repo setting needed unless your org has restricted the default `GITHUB_TOKEN` permissions — in that case go to **Settings → Actions → General → Workflow permissions** and allow read+write OR rely on the explicit `permissions:` block (which is what we do).
3. **Pin the default branch as `main`**
   - The CD trigger expects `main`. If your default branch is something else, edit `push.branches` in the workflow.
4. **Smoke test**
   - Edit the workflow: set `DRY_RUN: "true"` and a narrow date range (e.g. one week with known deployments).
   - Open a PR → confirm the preview comment lands.
   - Merge → confirm the CD job runs but **no real deletes** happen (check the job log for `[DRY RUN]`).
   - Flip `DRY_RUN: "false"` for production cleanups.

## Operating it

| Task | What to do |
|---|---|
| Clean a new date range | Edit `START_DATE` / `END_DATE` in `.github/workflows/cleanup-deployments.yml` → open PR → review preview → merge |
| Preview only, never delete | Set `DRY_RUN: "true"` before opening the PR — the CD job will still run but won't delete anything |
| Cap the batch size | Set `LIMIT: "100"` to only return the first 100 matches |
| One-off cleanup from laptop | `export JELLYFISH_API_TOKEN=...; python jellyfish_cleanup.py list ...; python jellyfish_cleanup.py delete ...` |
| Audit what was deleted | The `deployments-to-delete` artifact on the PR run holds the JSON list (14-day retention) |
| Cleanup misfired | Recover the artifact JSON; Jellyfish does not support undelete, so the rows are gone — re-ingest from your CI's deployment-tracking source if available |

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| CI job: `ERROR: JELLYFISH_API_TOKEN env var is not set.` | Secret missing or named wrong | Set repo secret `JELLYFISH_API_TOKEN` exactly |
| CI job: `403 Forbidden` from Jellyfish | Token lacks DevOps API scope or expired | Regenerate token in Jellyfish admin; permission must cover `/deployment` |
| CI job: PR comment never appears | Workflow lacks `pull-requests: write` | Already set in the YAML; if your org disabled the permission at the repo level, lift the restriction under Settings → Actions |
| CD job: HTTP 429 on delete | Hit Jellyfish's rate limit | Raise `DELETE_SLEEP_SECONDS` in the script from 0.1 to 0.5 or more |
| `WARN: skipping entry with non-JSON data field` | Jellyfish stored a malformed event | Safe to ignore — the script skips it; review the deployments.json artifact if the count is unexpectedly low |
| CD job ran but `count: 0` | Date range is empty, or `LIMIT` is too small | Confirm the dates and clear `LIMIT` |
| Delete partially succeeded | Network blip mid-batch | Re-run the workflow — already-deleted IDs return 404 and are counted as `already_gone`, not as failures |

## Security notes

- The token is the entire blast radius — anyone with this token can delete every deployment in your Jellyfish tenant. Store it only as a GitHub Actions secret. Do not bake it into the script or commit it to `.env`.
- The CI `list` job runs against PR branches from forks if you ever enable that. If your org accepts forked PRs, gate the CI job with `if: github.event.pull_request.head.repo.full_name == github.repository` so external forks don't get the token mounted.
- The `deployments-to-delete` artifact contains deployment metadata (commit SHAs, repo names, deployer email) that you may consider sensitive. Adjust `retention-days` accordingly.
- The workflow only triggers on changes to its own file or the script, so a malicious actor can't trigger a runaway cleanup by editing unrelated files.
