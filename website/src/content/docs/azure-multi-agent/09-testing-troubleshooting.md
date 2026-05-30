---
title: Testing & troubleshooting
description: A test plan covering happy paths and edge cases, plus the workflow piping issues that bit us during development.
sidebar:
  order: 10
---

This chapter is the test plan and the troubleshooting cheat sheet. It covers what to verify before declaring a deploy good, and the failure modes that took longest to diagnose during development.

## Smoke test plan

Run these in the workflow's **Preview** chat after every meaningful change. Each row tests a different routing path or policy.

### Routing tests

| Input | Expected route | Expected behaviour |
| --- | --- | --- |
| `list storage accounts` | AZURE | Labelled Prod / Nonprod tables |
| `show me repos` | DEVOPS | Project + repo list |
| `list users` | ENTRA | User table with object IDs |
| `hi` | GREETING (or fallback) | Welcome text or menu |
| `file me a jira ticket about X` | UNKNOWN | Fallback / clarification |
| (empty message) | GREETING | Welcome text |

### Env classification tests

| Input | Expected behaviour |
| --- | --- |
| `list storage in prod` | Only queries prod sub |
| `list storage in nonprod` | Only queries nonprod sub |
| `list all storage accounts` | Queries both, labels results |
| `find storage account foo` | Asks "which env?" |
| `create storage account bar in nonprod` | Restates `az` plan, waits for "yes" |
| `create storage account bar in prod` | Asks to file Jira, does not attempt write |

### Empty-result tests

Pick a resource type and resource name you know don't exist. For example, if `nonprod` has no AKS clusters:

| Input | Expected behaviour |
| --- | --- |
| `list aks clusters in nonprod` (broad list, 0 results) | `No AKS in nonprod.` STOP. |
| `find aks cluster named foo in nonprod` (targeted, 0 results) | Ask "Create it? (yes/no)" |
| `find aks cluster named foo in prod` (targeted, 0 results) | Ask "File Jira? (yes/no)" |

### Forbidden-write tests

| Input | Expected behaviour |
| --- | --- |
| `create a user in entra` | MicrosoftEntra asks "File Jira? (yes/no)" |
| `merge PR 42 in repo X` | Devops asks "File Jira? (yes/no)" |
| `delete the foo storage in prod` | AzureRetrieve asks "File Jira? (yes/no)" |

After answering "yes" to any of the above, verify the Story actually appears in `https://yilianapijiayun.atlassian.net/projects/SCRUM`.

### Multi-turn follow-up tests

| Turn 1 | Turn 2 | Expected on turn 2 |
| --- | --- | --- |
| `list storage in nonprod` | `now show key vaults` | Returns key vaults in the same sub, no re-prompting for env |
| `find user X` | `is there a user Y too?` | MicrosoftEntra returns Y without re-explaining context |

Multi-turn continuity relies on `System.ConversationId` being wired through every agent node (see [chapter 06](/azure-multi-agent/06-workflow/)).

## Workflow piping issues we hit

These are real failure modes from the build, in roughly the order they appeared.

### 1. AzureRetrieve returns nothing

**Symptom:** the workflow completes, but the AzureRetrieve span in Traces is empty. User sees nothing in chat.

**Root cause (typical):** AzureRetrieve's Input message points at `Local.SubInfo` (sub list only), not `Local.AzureInput` (combined sub list + user request).

**Fix:** confirm the Set variable node between SubDiscovery and AzureRetrieve correctly builds:

```powerfx
"Available subs: " & Last(Local.SubInfo).Text & " . User request: " & Local.OriginalRequest
```

Then point AzureRetrieve's Input message at `Local.AzureInput`.

### 2. `Last` Power FX error in Set variable

**Symptom:** Workflow fails with `Error 26-34: Invalid argument type` or `Error 70-74: The function 'Last' has some invalid arguments`.

**Root cause:** Power FX type confusion.

- `Local.SubInfo` is a **table of messages** (`Conversation`). You need `Last(Local.SubInfo).Text` to get the string.
- `Local.OriginalRequest` is already a **string**. Don't wrap it in `Last()` — that errors with "Expecting a Table value instead".

**Fix:** the correct expression is mixed:

```powerfx
"Available subs: " & Last(Local.SubInfo).Text & " . User request: " & Local.OriginalRequest
```

### 3. SubDiscovery's output leaks to the chat

**Symptom:** User sees the raw subscription list (`1. Azure subscription 1 (env=nonprod)...`) in chat before the actual answer.

**Root cause:** the **Automatically include agent response as part of the workflow (external) conversation** toggle is ON for SubDiscovery.

**Fix:** open the SubDiscovery node → set that toggle to **OFF**. This is the correct setting for any intermediate node whose output is consumed by a downstream node, not by the user.

Reference table for which nodes should have this toggle ON:

| Node | Include in conversation |
| --- | --- |
| ParentAgent | OFF (token is internal) |
| SubDiscovery | OFF (sub list is intermediate) |
| AzureRetrieve | **ON** (terminal answer) |
| Devops | **ON** (terminal answer) |
| MicrosoftEntra | **ON** (terminal answer) |

### 4. SubDiscovery refuses with "I'm sorry, I cannot assist with that"

**Symptom:** SubDiscovery returns a refusal instead of the subscription list.

**Root cause:** the agent's input is `Local.OriginalRequest` (e.g., "list storages") and the LLM interprets that as a task it can't fulfil because its tool list only has `subscription_list`.

**Fix:** the SubDiscovery prompt must include "IGNORE the input message" as an explicit rule. See [chapter 05](/azure-multi-agent/05-agents/) for the hardened version. Without this, the LLM treats the input as instructions.

### 5. Multi-turn loop hangs on SubDiscovery

**Symptom:** SubDiscovery emits the sub list and the workflow waits indefinitely. User types something else, and SubDiscovery emits the sub list again, looping forever.

**Root cause:** Allow multi-turn conversation is ON for SubDiscovery, with a loop condition that never matches.

**Fix:** SubDiscovery is stateless — it should run once per workflow execution. Turn the toggle OFF.

| Node | Allow multi-turn |
| --- | --- |
| ParentAgent | OFF |
| SubDiscovery | OFF |
| AzureRetrieve | OFF (use ConversationId for cross-turn memory) |
| Devops | OFF |
| MicrosoftEntra | OFF |

In this build, multi-turn is OFF everywhere. Cross-user-turn history is carried by `System.ConversationId`, not by the in-turn multi-turn loop.

### 6. Workflow menu re-appears on every user turn

**Symptom:** Every user message triggers the welcome menu before getting to the actual agent.

**Root cause:** the workflow starts with an **Ask a question** node that unconditionally shows a menu.

**Fix options:**

- **Move the menu into the Else branch of the If/Else** so it only fires when ParentAgent classifies as UNKNOWN. This is the recommended pattern.
- Or remove the menu entirely and rely on ParentAgent's classification.

The current architecture in this build has no `Ask a question` node at the top — ParentAgent classifies the raw user message, and the menu only appears in the fallback Else branch.

### 7. Composio Jira creates ticket but agent doesn't reply with the key

**Symptom:** Story shows up in Jira, but the agent's reply is empty or truncated.

**Root cause:** the agent's `max_tokens` is too low, or the Composio response format changed.

**Fix:** in the agent's model settings, raise `max_completion_tokens` to at least 2000. Verify `JIRA_CREATE_ISSUE` returns the `result.key` field by testing in the agent Playground first.

### 8. Workflow Activity Protocol URL returns 401 in browser

**Symptom:** Opening the URL from the "Workflow application details" dialog returns:

```json
{"error":{"code":"401","message":"Access denied due to invalid subscription key or wrong API endpoint."}}
```

**Root cause:** the URL is a Bot Framework Activity Protocol endpoint, not a web page. It requires a POST with a bearer token.

**Fix:** this is expected behaviour. Use the URL via the Teams/M365 Copilot integration (see [chapter 08](/azure-multi-agent/08-publishing/)), or use Foundry's **Preview** for testing.

## Reading workflow traces

Every workflow run produces a trace. Open via **Traces** tab on the workflow page.

For each span (one per node), Foundry shows:

| Field | Useful for |
| --- | --- |
| Input | What the node received from upstream — verify variable interpolation |
| Output | What it sent downstream — verify format |
| Tool calls | Which MCP tools the agent invoked + their params + response |
| Duration | Slow nodes (>10s usually mean a tool timeout) |
| Errors | Verbatim error messages |

The first thing to check in a misbehaving workflow is the **Input** of the failing node. ~80% of issues are upstream variable wiring, not the agent prompt itself.

## Reading agent traces

Inside an agent (not workflow) trace:

1. The **conversation thread** shows the system prompt + user message + assistant response
2. The **tool call panel** shows each MCP invocation, params, response
3. The **token usage** shows input/output token counts (useful for cost debugging)

If an agent's response is wrong, decide whether:

- It got bad input (workflow issue — fix upstream)
- It called the wrong tool (prompt issue — sharpen tool selection rules)
- It got good tool output but formatted badly (prompt issue — sharpen output style)

## Monitoring in production

Foundry has no built-in alerting (yet). Practical approach:

- Pin the **Operate** tab dashboards for the project — watch error rate, latency, token usage daily for the first two weeks
- Set up a daily Composio audit: count tickets filed per agent per day; sudden spikes mean someone is hitting the agent with prod requests or there's a regression in tool selection
- Pipe Foundry logs to Application Insights via the diagnostic settings on the Foundry resource (if you have it); set up alerts on `error rate > 5%` or `p95 latency > 30s`

## When in doubt

Three things to try, in this order:

1. **Re-run the failing input in the agent's Playground** — bypasses the workflow entirely. If it works there, the issue is workflow wiring.
2. **Open the Trace and read the failing node's Input field** — almost always reveals upstream variable issues.
3. **Check the agent's system prompt didn't drift** — Foundry's versioning means an unsaved edit can revert; confirm the prompt matches the source-of-truth in [chapter 05](/azure-multi-agent/05-agents/).

## What's not yet covered

These are known gaps in this build that we haven't documented (and in some cases haven't implemented):

- **Guardrails configuration** — Foundry has a Guardrails section in the project that's currently empty. Adding content filters and PII detection is a future hardening step.
- **Evaluation datasets** — see [chapter 10](/azure-multi-agent/10-evaluations/) for the regression suite we built.
- **Cost budgets / alerts** — no automated alerting on token spend.
- **Per-environment managed identity split** (Option B) — queued.
- **Workflow YAML version control in git** — there is no automatic export; copy from the YAML tab periodically.

The build is production-acceptable for an internal user base of a few dozen. For a public-facing or critical-path deployment, the gaps above are the next priorities.

## What's next

You have a tested deploy and a troubleshooting playbook. The remaining piece is automated regression — running the same set of inputs against each new agent version and grading the output before publishing. That's what the final chapter covers.

Continue to [Evaluations](/azure-multi-agent/10-evaluations/).
