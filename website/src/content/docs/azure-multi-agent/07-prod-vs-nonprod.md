---
title: Prod vs non-prod handling
description: How subscriptions are classified as prod or nonprod, and how the agent picks between filing a Jira ticket and creating a resource directly.
sidebar:
  order: 8
---

This chapter explains the policy decisions the agent makes when it encounters a write request or a missing resource. The behaviour differs by environment, and getting the rules right is what makes this build safe to point at a real prod subscription.

## The two-axis decision

Every action the agent might take falls into one of four cells:

| | env=nonprod | env=prod |
| --- | --- | --- |
| **Write requested** | Confirm + execute via `run_az` | Refuse + ask to file Jira |
| **Read returns 0 (lookup)** | Ask "create it?" → write path | Ask "file Jira?" → escalation |
| **Read returns 0 (broad list)** | "no results" + STOP | "no results" + STOP |
| **Read returns N>0** | Format and return | Format and return |

This table lives in the AzureRetrieve prompt and is the canonical source of behaviour.

## Env classification

The SubDiscovery agent classifies env from the subscription **name** using these rules (case-insensitive):

```text
contains "prod" AND NOT contains "nonprod" / "non-prod"  → env="prod"
contains "nonprod" / "non-prod" / "sandbox" / "dev" / "test"  → env="nonprod"
otherwise → env="nonprod" (safe default)
```

If the sub name is `"Subscription Prod"` → env=prod.
If the sub name is `"Azure subscription 1"` → env=nonprod (default).
If the sub name is `"Production Workloads"` → env=prod.
If the sub name is `"Pre-Production"` → env=nonprod (contains "prod" but also "pre-prod" — actually classified prod under current rules — see [edge cases](#edge-cases) below).

The classification result is stamped into the output:

```text
1. Azure subscription 1 (env=nonprod) [id=64d347f2-7434-4ae2-9b7d-618fbffc37ac]
2. Subscription Prod (env=prod) [id=a31708fa-027e-453d-9126-c86e7f9e54b4]
```

AzureRetrieve then parses these tuples back when reading `Local.AzureInput`.

## How the agent picks env for a request

AzureRetrieve looks at the **user request text** for env hints:

```text
contains "prod" (and not "nonprod")  → env=prod
contains "nonprod" / "non-prod" / "sandbox" / "dev" / "test"  → env=nonprod
```

If no hint:

| User request type | Action |
| --- | --- |
| Broad list / inventory ("list all storage accounts") | Query BOTH subs, label results by env |
| Targeted lookup ("find storage account X") | Ask "Which env — prod or nonprod?" |
| Write request ("create storage X") | Ask "Which env — prod or nonprod?" |

Once the env is decided for a turn, the agent caches it and never re-asks.

### Example: `list storage accounts`

- No env hint
- Broad list intent
- Both subs queried via `storage_account_list`
- Output:

  ```text
  Prod (sub=Subscription Prod):
    - no results
  Nonprod (sub=Azure subscription 1):
    - jstoryfn777931617 (eastus, StorageV2, Standard_LRS)
    - logicapp588521594661 (eastus2, Storage, Standard_LRS)
  ```

### Example: `find storage account named foo`

- No env hint, targeted lookup
- Agent asks: "Which env — prod or nonprod?"
- User: `prod`
- Agent queries prod, finds nothing
- Agent asks: "No storage account found in prod. File Jira to request creation? (yes/no)"
- User: `yes`
- Agent calls `composio-jira` → Story created in SCRUM

### Example: `create a storage account in nonprod called foo`

- Env hint = nonprod
- Write request
- Agent restates plan:

  ```text
  I will run:
    az storage account create \
      --name foo \
      --resource-group <ask user> \
      --location eastus \
      --sku Standard_LRS \
      --kind StorageV2 \
      --subscription 64d347f2-7434-4ae2-9b7d-618fbffc37ac

  Confirm yes/no?
  ```

- User: `yes`
- Agent runs `run_az`, reports the resource ID

## Why "ask before Jira" not "always Jira"

Earlier versions silently filed Jira on every prod write. Two problems:

1. Users would request a prod read and get a ticket because the agent misclassified the intent
2. Triage queue filled with duplicate tickets for similar requests

The current flow forces a user confirmation. The user sees what the agent is about to do and can say "no" if they typed something wrong. The escalation rate dropped ~80% after adding this step.

## Edge cases

| Case | Current behaviour | Notes |
| --- | --- | --- |
| Sub named "Pre-Production" | Classified prod (contains "prod", doesn't contain "nonprod") | Rename to "Pre-Prod" or "Staging" to avoid prod-write escalation. |
| User says "list prod storage" with only one nonprod sub | Default to the only sub, ignore "prod" hint | The agent uses the available subs from the workflow input. If prod isn't in the list, "prod" hint can't match. |
| Empty broad list in nonprod | Returns "no results", does NOT offer create | Broad listing zero is normal — could be a new sub or wrong filter. Offering create would be noisy. |
| Empty targeted lookup in prod | Asks to file Jira | Asymmetric with nonprod because the user can't create in prod anyway. |
| User says "create user in entra" | MicrosoftEntra agent files Jira | Entra is read-only regardless of env. |
| User says "delete the foo storage account in nonprod" | Agent restates the `az storage account delete` plan, requires explicit "yes" | Destructive ops are allowed on nonprod but require explicit confirmation per the run_az guards. |

## Audit trail

Every action that mutates state leaves a trail:

| Action | Where it's logged |
| --- | --- |
| `run_az` invocation | Foundry workflow Traces → AzureRetrieve node → tool call payload |
| Jira ticket creation | Composio dashboard + Jira itself |
| Confirmation Q/A | Foundry workflow Traces → AzureRetrieve message thread |

For compliance review, the Composio dashboard is the easiest place to see every ticket the agent filed — filter by integration `Jira` and search the Story descriptions for `Source: AzureRetrieve|Devops|MicrosoftEntra`.

## What's next

The agent enforces the right policies per env. Next chapter walks through publishing the workflow as a Teams / M365 Copilot agent so users in your org can chat with it without opening the Foundry portal.

Continue to [Publishing to Teams](/azure-multi-agent/08-publishing/).
