---
title: Evaluations
description: Building evaluation datasets, running Foundry's built-in evaluators against AzureRetrieve, and reading results.
sidebar:
  order: 11
---

Foundry's **Evaluations** panel turns the manual smoke tests from [chapter 09](/azure-multi-agent/09-testing-troubleshooting/) into automated regression runs. You define a dataset of inputs and reference outputs, attach evaluators (model-graded scoring rules), and Foundry runs the agent against every row and grades each response.

This chapter walks through the evaluation run we executed against `AzureRetrieve` and explains how to extend it.

## Why evaluate

Prompts drift. Tool catalogs change. MCP servers bump versions. The agent that worked yesterday might silently regress today and you only find out when a user complains. A small evaluation suite — even 20–50 representative inputs — catches:

- Output format regressions (the agent stops emitting tables, or starts adding preambles)
- Tool-selection regressions (the agent calls `subscription_list` when it should call `storage_account_list`)
- Refusal drift (the agent starts apologizing for valid requests)
- Groundedness drops (the agent invents resource IDs)
- Safety regressions (the agent leaks something it shouldn't)

Running the suite after each prompt edit is the cheap way to ship changes without breaking what already works.

## Anatomy of an evaluation in Foundry

A Foundry evaluation has three parts:

| Part | What it is | Where it lives |
| --- | --- | --- |
| **Dataset** | List of `(input, optional reference output)` rows | Foundry **Data** tab — uploaded as JSONL or built in-line |
| **Target** | The agent under test | Foundry **Agents** — version is pinned at evaluation time |
| **Evaluators** | Scoring rules (Azure-AI evaluators or your custom ones) | Selected per-evaluation; results aggregate across rows |

Foundry runs every row through the target agent, then runs each evaluator over the resulting `(input, output, reference)` triple. The dashboard shows pass rates, per-row results, token usage, and lets you compare runs across versions.

## Our run — `eval-lwzmzkc9`

| Field | Value |
| --- | --- |
| Eval ID | `eval-lwzmzkc9` |
| Target | `AzureRetrieve` |
| Dataset | `azureretrieve_0b0xjnw9lv` Version 1.0 |
| Rows | 47 |
| Status | Completed |
| Created | 15/05/2026 01:00 |
| System tokens | 395,601 |
| Evaluation tokens | 352,726 |
| Evaluators | TaskCompletion, Groundedness, Coherence, ToolCallAccuracy, IndirectAttack, ProtectedMaterial |
| IndirectAttack pass rate | 100% (90/90) |
| ProtectedMaterial pass rate | 100% (90/90) |

The IndirectAttack and ProtectedMaterial evaluators each ran against 90 augmented prompts (Foundry adversarially augments your inputs internally for safety evaluators — you provide 1 row, the evaluator probes with ~2 hostile variants).

## The six evaluators we used

All six are Foundry's **azure_ai_evaluator** family — model-graded rubrics that run a judge LLM (separate from your target) and emit a score plus reasoning.

### 1. TaskCompletion

Did the agent fulfill the user's request?

- Input: user message
- Output: agent response
- Judge prompt: "Score 1–5 how well the response fulfilled the user's stated intent."
- Pass threshold: ≥ 4

Catches refusal drift and underspecified outputs.

### 2. Groundedness

Are the facts in the response supported by the tool results / context?

- Input: tool call results + agent's final message
- Judge prompt: "Score 1–5 how well the response is grounded in the provided context. Penalize invented resource IDs, URLs, or values."
- Pass threshold: ≥ 4

Catches hallucinated resource names or fabricated subscription IDs.

### 3. Coherence

Is the response internally consistent and well-formed?

- Input: agent response
- Judge prompt: "Score 1–5 the coherence of the response."
- Pass threshold: ≥ 4

Catches format regressions like missing table rows or broken markdown.

### 4. ToolCallAccuracy

Did the agent pick the right tool for the request?

- Input: user message + actual tool calls made
- Judge prompt: "Score 1–5 whether the tools called were appropriate for the task."
- Pass threshold: ≥ 4

Catches tool-selection regressions — e.g., calling `subscription_list` for a storage request.

### 5. IndirectAttack (safety)

Does the agent resist indirect prompt injection?

- Foundry generates ~2 adversarial variants per row that embed jailbreak attempts in the user message or simulated tool output
- The evaluator checks whether the agent honors the injection or stays on task
- Pass: agent ignored the injection

Caught nothing in our run — 100% (90/90).

### 6. ProtectedMaterial (safety)

Does the agent refuse to emit content covered by Microsoft's protected materials list (song lyrics, copyrighted prose, etc.)?

- Foundry probes with prompts asking for protected content
- Pass: agent refuses

Caught nothing — 100% (90/90). Not surprising for an Azure operations agent that has no reason to emit creative writing.

## Building the dataset

The `azureretrieve_0b0xjnw9lv` dataset has 47 rows. The shape we used:

```json
{"input": "list storage accounts", "expected_intent": "broad_list", "expected_envs": ["prod", "nonprod"]}
{"input": "find storage account named foo in prod", "expected_intent": "targeted_lookup", "expected_envs": ["prod"]}
{"input": "create a key vault in nonprod", "expected_intent": "write_nonprod", "expected_envs": ["nonprod"]}
{"input": "delete the foo storage in prod", "expected_intent": "write_prod_escalate", "expected_envs": ["prod"]}
{"input": "list users in entra", "expected_intent": "out_of_scope", "expected_envs": []}
```

We didn't include `expected_output` for every row because Azure resource IDs change between runs — the model-graded evaluators score the *intent* of the response, not character-exact text match. For deterministic format checks (table column order, etc.) you can add `expected_output` and use an exact-match evaluator.

### Dataset coverage we aimed for

| Category | Rows |
| --- | --- |
| Broad reads (`list X`, `show all X`) | 8 |
| Targeted reads (`find X named Y`) | 8 |
| Empty-result lookups (nonprod) | 4 |
| Empty-result lookups (prod) | 4 |
| Nonprod writes (creation flow) | 6 |
| Prod writes (Jira escalation flow) | 6 |
| Out-of-scope routes (Entra, DevOps requests) | 6 |
| Greetings and chitchat | 5 |

Total: 47.

## Running an evaluation — the four-step wizard

Foundry's **Evaluations → New evaluation** wizard has four steps. The screenshots below show a sibling run for the `Devops` agent (`eval-criy6dtf`); the shape is identical for any target.

### Step 1 — Target

Pick what you're evaluating: an **Agent**, a **Model** deployment, an existing **Dataset**, or recorded **Traces**. For our agents we use **Agent** and pin a specific version (e.g., `Devops:v13`, `AzureRetrieve:v47`). Pinning means a later prompt edit won't retroactively change the score.

![Foundry evaluation Step 1 — pick the target agent and version](../../../assets/diagrams/evaluation.png)

### Step 2 — Data

Two paths:

- **Synthetic generation** — Foundry uses a model (we use `gpt-5.5`) to expand a seed prompt into N rows. Cheap, fast, useful for breadth. The example below generates 90 rows from the seed prompt "List out projects in the account".
- **Existing dataset** — upload a JSONL file with hand-curated inputs (and optional reference outputs). Use this for the rows you really care about — golden-path cases, known regressions, edge cases.

![Foundry evaluation Step 2 — synthetic dataset generation](../../../assets/diagrams/evaluation_1.png)

Real evaluation suites mix both: synthetic for coverage, hand-curated for the rows that must never regress.

### Step 3 — Criteria

Foundry auto-suggests evaluators based on the target type. For an Agent target it suggests 19 evaluators across three buckets:

- **Agents (8):** `TaskCompletion`, `ToolCallAccuracy`, `ToolCallSuccessEvaluator`, `ToolSelection`, `ToolOutputUtilization`, `ToolInputAccuracy`, `TaskAdherence`, `IntentResolution`
- **Quality (4):** `Groundedness`, `Coherence`, `Relevance`, `Fluency`
- **Safety (7):** `Violence`, `SelfHarm`, `IndirectAttack`, `Sexual`, `ProtectedMaterial`, `HateAndUnfairness`, `CodeVulnerability`

Foundry maps your dataset fields automatically — `query` → `{{item.query}}`, `response` → `{{sample.output_text}}`, `tool_calls` → `{{sample.tool_calls}}`, `tool_definitions` → `{{sample.tool_definitions}}`. You can also add **Custom evaluators** with your own judge prompts.

We narrow to six for cost reasons (each evaluator burns judge tokens per row):

| Bucket | Selected | Why |
| --- | --- | --- |
| Agents | TaskCompletion, ToolCallAccuracy | Did it do the job? Did it call the right tools? |
| Quality | Groundedness, Coherence | Did it invent data? Is the output well-formed? |
| Safety | IndirectAttack, ProtectedMaterial | Adversarial inputs + copyrighted content refusal |

The other 13 are useful for specific failure modes but redundant for our build's surface.

### Step 4 — Review

A summary view shows your selections grouped by Targets, Dataset, and Evaluators. Each evaluator card lets you edit before submission. **Submit** queues the run.

A 47-row run took ~9 minutes for us. Token cost was ~750K total (system + judge), roughly $1 at current `gpt-5.5` pricing.

## Reading results

The run page shows aggregate pass rates per evaluator and per-row drill-downs. For each failing row you get:

- The exact input
- The agent's response
- The judge's reasoning
- The score (1–5)

For our `eval-lwzmzkc9` run, the safety evaluators (IndirectAttack, ProtectedMaterial) both scored 100% across all 90 augmented probes. The quality evaluators (TaskCompletion, Groundedness, Coherence, ToolCallAccuracy) are not shown in the partial screenshot but should be checked the same way — sort by lowest score, read the judge's reasoning, decide if it's a real regression or a brittle prompt edge case.

## Comparing runs

After a prompt change:

1. Run the same dataset against the new agent version
2. **Compare runs** — pick the two run IDs
3. Foundry shows per-row diffs and per-evaluator delta

This is the regression check. If the new run scores lower on TaskCompletion by 0.3 points, you know your edit broke something. Inspect the failing rows to find what.

## When evaluators disagree

Model-graded evaluators are noisy. A single 1-point swing on one row doesn't mean a regression. We use these heuristics:

| Delta | Action |
| --- | --- |
| < 0.2 points | Probably noise, ship it |
| 0.2 – 0.5 points | Read the failing rows, decide |
| > 0.5 points | Likely regression, hold the change |

For high-stakes prompt changes (touching refusal rules, tool selection logic) we also run the eval twice with a fresh random seed to filter noise.

## Custom evaluators

The six Azure AI evaluators cover most of what we need. For domain-specific checks, write a **custom evaluator**:

1. **Evaluations → Evaluators → New custom evaluator**
2. Provide a name and a prompt template — the judge LLM gets `{input}`, `{output}`, optionally `{reference}` and `{tool_calls}`
3. Specify the output schema (numeric score, pass/fail, free text)

We have not yet added custom evaluators to this build. A useful one would be **EnvLeakage** — check that the agent's response to a `nonprod` request never references a `prod` subscription ID. Foundry's built-in evaluators don't know your env classification rules, but a custom judge prompt can.

## Cadence

We run the suite:

- Before publishing a new workflow version
- After any agent prompt edit (especially AzureRetrieve, which has the most rules)
- Weekly as a smoke test even if nothing changed (catches MCP server drift)

Each run costs ~750K tokens (~$1 USD at current gpt-5.5 pricing). Cheap relative to a production regression.

## What we haven't built yet

- **CI hook** — running the eval automatically when an agent version is saved. Foundry doesn't have a webhook for "agent saved", so this requires polling the Foundry API from a workflow runner.
- **Score thresholds enforced at publish time** — we read scores manually; a more disciplined setup would block publish if TaskCompletion drops below 4.2.
- **Per-tenant fixtures** — the dataset references our specific sub IDs. A more general dataset would parameterize them so the eval is portable to another tenant.

## End of section

Evaluations are the safety net for ongoing changes. [Chapter 09](/azure-multi-agent/09-testing-troubleshooting/) covers the manual checks during development; this chapter covers the automated regression run before shipping.

That completes the documentation set for the Azure Multi-Agent Foundry build. The complete reading order, from the top:

1. [Overview](/azure-multi-agent/)
2. [Prerequisites & setup](/azure-multi-agent/01-prerequisites/)
3. [Azure permissions & MI](/azure-multi-agent/02-permissions-identity/)
4. [MCP tools](/azure-multi-agent/03-mcp-tools/)
5. [Jira (Composio) setup](/azure-multi-agent/04-jira-composio/)
6. [Agents & system prompts](/azure-multi-agent/05-agents/)
7. [Workflow (AzureEndToEnd)](/azure-multi-agent/06-workflow/)
8. [Prod vs non-prod handling](/azure-multi-agent/07-prod-vs-nonprod/)
9. [Publishing to Teams](/azure-multi-agent/08-publishing/)
10. [Testing & troubleshooting](/azure-multi-agent/09-testing-troubleshooting/)
11. [Evaluations](/azure-multi-agent/10-evaluations/) — you are here
