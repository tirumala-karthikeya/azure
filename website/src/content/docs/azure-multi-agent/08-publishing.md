---
title: Publishing to Teams
description: How to publish the AzureEndToEnd workflow as a Microsoft Teams and M365 Copilot agent, including Azure Bot Service registration.
sidebar:
  order: 9
---

This chapter walks through publishing the workflow to Microsoft Teams and the Microsoft 365 Copilot store so end users in your tenant can chat with it from Teams without opening the Foundry portal.

## Decision: do you need to publish?

**Skip this chapter** if:
- You're still iterating on prompts or workflow structure
- Only the engineering team uses the agent (Foundry **Preview** works fine for internal use)
- You don't have admin rights to register apps in your M365 tenant

**Do this chapter** if:
- You want non-technical users in your org to consume the agent
- You want the agent reachable from Teams chat or M365 Copilot
- You're ready for a real deployment with proper auth, billing, and rollback

## What "publish" actually does

Publishing wires three things together:

1. **The Foundry workflow** — your `AzureEndToEnd` workflow
2. **An Azure Bot Service resource** — Microsoft's runtime that exposes a Bot Framework endpoint
3. **An M365 Copilot agent registration** — the entry in the M365 / Teams app catalog

End users see "AzureEndToEnd" in Teams or M365 Copilot. When they chat with it, Teams calls the Bot Service, which forwards to the Foundry workflow's Activity Protocol endpoint, which runs the agents and replies.

## Prerequisites

- The workflow is at a version you want to ship (no in-flight edits)
- You have **Application Administrator** or **Cloud Application Administrator** role in Entra (to register the bot's app ID)
- You have permission to create resources in the `copilot-rg` resource group
- You're authorized to publish to the M365 Copilot store in your tenant (admin-only in most tenants)

## Step 1 — Publish the workflow in Foundry

In the workflow page (`AzureEndToEnd`):

1. Click **Publish** (top-right, next to Save)
2. Wait for the green confirmation
3. The dialog **Workflow application details** opens with three values:

   | Field | Example | Used for |
   | --- | --- | --- |
   | Principal ID of the agent identity | `e83e89b0-2ed4-49f5-9c45-67aada317913` | The MI that the bot will run as |
   | Tenant ID | `6577bae2-a3fd-40d6-a992-949168c7ca0f` | Your Entra tenant |
   | Activity Protocol URL | `https://jirasotiresscrum-resource.services.ai.azure.com/api/projects/jirasotiresscrum/applications/AzureEndToEnd/protocols/activityprotocol?api-version=...` | The endpoint Teams/M365 will POST to |

4. Copy all three — you'll paste them in the next steps.

**Do not** open the Activity Protocol URL in a browser. It returns a 401 because GET-without-auth isn't supported. That URL is for Teams/M365 to POST against with a bearer token; it's not a chat UI.

## Step 2 — Create the Azure Bot resource

In the Azure portal:

1. **Create a resource** → search "Azure Bot" → **Create**
2. Fill the form:

   | Field | Value |
   | --- | --- |
   | Bot handle | `AzureEndToEndBot` |
   | Subscription | Nonprod (`Azure subscription 1`) |
   | Resource group | `copilot-rg` |
   | Pricing tier | F0 (free) for testing, S1 for prod |
   | Type of App | User-Assigned Managed Identity |
   | Creation type | Use existing app registration |
   | App ID | Paste the Principal ID from step 1 (`e83e89b0-...`) |
   | App tenant ID | Paste the Tenant ID from step 1 |
   | App MSI Resource ID | Leave default unless you have a specific MI to use |

3. **Review + create** → **Create**
4. Wait ~1 minute for provisioning

The bot resource is what Teams calls. It does not run the agent — it just forwards messages to the Foundry workflow's Activity Protocol URL.

## Step 3 — Configure the bot's messaging endpoint

After the bot is created:

1. Open the bot resource in the portal
2. **Settings → Configuration**
3. **Messaging endpoint** — paste the Activity Protocol URL from step 1
4. **Save**

This is the wire between Teams and Foundry. Teams POSTs to the bot, the bot forwards to Foundry, Foundry runs the workflow.

## Step 4 — Enable Teams channel

In the bot resource:

1. **Channels** in the sidebar
2. Click **Microsoft Teams** in the list of available channels
3. Accept the terms
4. **Save**

This activates the bot for Teams. It may take ~5 minutes for the channel to become healthy.

## Step 5 — Submit to Teams and M365 Copilot

Back in Foundry, reopen the **Workflow application details** dialog (click **Publish** again if it's closed). At the bottom of the dialog:

1. Click **Publish to Teams and Microsoft 365 Copilot**
2. A new form opens — **Teams and Microsoft 365 Copilot (Preview)**

Fill in:

| Field | Value |
| --- | --- |
| Azure Bot Services | Click the refresh icon, then select `AzureEndToEndBot` |
| Name | `AzureEndToEnd` |
| Version | `1.0.0` |
| Short description | `Azure operations assistant — inventory, DevOps reads, Entra reads, prod-write Jira escalation` |
| Full description | (see template below) |
| Developer name | Your name or team |
| Website | Your org URL or the Jira instance URL |
| Terms of use URL | A real URL — your org's ToS, or a GitHub-hosted markdown file |
| Privacy statement URL | Same as ToS, or a separate privacy doc |

### Full description template

```text
Azure operations assistant for the jiayunyilianapi tenant.

Capabilities:
- Azure resources: inventory, list/get on storage, key vaults, VMs, RGs, AKS, SQL,
  Cosmos. Nonprod writes via confirmation flow. Prod writes escalated to Jira
  (SCRUM project).
- Azure DevOps: read-only access to projects, repos, PRs, pipelines, work items.
  Write requests escalated to Jira.
- Microsoft Entra: read-only access to users, groups, app registrations, devices.
  Write requests escalated to Jira.

Routes user requests automatically and asks for confirmation before any prod or
destructive operation.
```

After filling everything:

3. Click **Prepare workflow** → wait for the green check
4. Click **Submit to Teams and Microsoft 365 Copilot store**

## Step 6 — Tenant admin approval

The submission lands in the M365 admin center for review. A Global Admin or M365 Apps Admin must approve before users can install the agent.

Approval path (admin does this):

1. Open `admin.microsoft.com` → **Integrated apps**
2. **Submitted apps** tab → find `AzureEndToEnd`
3. Review the manifest (especially permissions)
4. Click **Approve**
5. **Deploy** → choose user/group scope:
   - All users in tenant
   - Specific group (e.g., `Cloud Engineering`)
   - Specific users

Tighter scoping is safer for early rollout. Start with one team, watch the logs for a week, then expand.

## Step 7 — Verify in Teams

After approval, users see the agent in Teams under **Apps → Built for your org**. They click **Add** to install.

Test the integration:

1. Open Teams as a user with access
2. Search for `AzureEndToEnd` in the chat search
3. Send `list storage accounts`
4. Confirm you see the labelled Prod/Nonprod table

If you get a generic "the bot isn't available" error, check:

- The bot's Teams channel is enabled (step 4)
- The messaging endpoint is correct (step 3)
- The Foundry workflow is still published (revisit step 1 if you've made changes since)

## Updating after publish

Each change to the workflow or any agent requires re-publishing:

1. Save the change in Foundry → it becomes a new version
2. Click **Publish** on the workflow to make this version the live one
3. The bot endpoint is unchanged, so Teams will pick up the new version on the next message

Re-submitting to the M365 store is only required if you change the published metadata (name, description, version number, URLs). Workflow body changes don't need re-submission.

## Costs

| Resource | Pricing | Notes |
| --- | --- | --- |
| Azure Bot Service | F0 (free) or S1 | F0 is sufficient for testing; S1 is required for SLA |
| Foundry workflow | Per-token model usage | gpt-5.5 prices apply |
| Composio Jira | Free tier 100 calls/day | Upgrade if you saturate |
| Teams channel | Free | Included with M365 |
| M365 Copilot store listing | Free | Subject to admin approval |

The dominant cost will be model tokens. Watch the **Operate** tab in Foundry for token-per-day rollups.

## Rolling back

If a new version misbehaves in production:

1. In the workflow page, click the **Version** dropdown
2. Select the prior working version
3. Click **Restore** → it becomes the new latest
4. Click **Publish** → the bot picks up the older version

No Teams republish needed — the bot endpoint is stable across workflow versions.

## What's next

The agent is now reachable from Teams and M365 Copilot. The final chapter is the test plan and the workflow piping gotchas worth knowing before someone else maintains this.

Continue to [Testing & troubleshooting](/azure-multi-agent/09-testing-troubleshooting/).
