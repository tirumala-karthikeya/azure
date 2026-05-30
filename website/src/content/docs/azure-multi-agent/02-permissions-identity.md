---
title: Azure permissions & managed identity
description: RBAC roles on nonprod and prod subscriptions, plus Graph permissions for Entra reads and DevOps reads.
sidebar:
  order: 3
---

This chapter wires permissions to the Foundry project's managed identity. The agent does everything as this identity — there are no client secrets, no service principal passwords, no user impersonation.

## The identity model

Foundry projects ship with a **system-assigned managed identity** on the project resource. When an agent calls a tool (MCP server, run_az, etc.), that tool's outgoing Azure calls use this identity's token. RBAC on the identity governs everything the agent can read or write.

```text
User → Foundry agent → Tool (MCP server)
                          │
                          ▼
                   Managed identity
                          │
                          ▼
                  Azure RBAC checks
                          │
                          ▼
                Action allowed / denied
```

Find the identity:

```bash
# Get the principal ID for the Foundry project's MI
az resource show \
  --resource-group copilot-rg \
  --name jirasotiresscrum-resource \
  --resource-type "Microsoft.CognitiveServices/accounts" \
  --query "identity.principalId" \
  --output tsv
```

This returns a GUID like `e83e89b0-2ed4-49f5-9c45-67aada317913`. Use it as the `<MI_PRINCIPAL_ID>` placeholder below.

## RBAC scope decisions

The agent must do three things:

1. **List and inventory all Azure resources across both subs** → Reader on both
2. **Write to nonprod resources** (create RGs, storage accounts, key vaults, secrets) → Contributor on nonprod only
3. **Never write to prod** → no Contributor on prod (writes will fail and the agent will escalate to Jira)

This is the default "Option A" (single MI). [Option B](#option-b--split-managed-identities-not-implemented) splits this into two MIs and is queued — see below.

## Nonprod subscription roles

```bash
NONPROD_SUB="64d347f2-7434-4ae2-9b7d-618fbffc37ac"
MI_PRINCIPAL_ID="e83e89b0-2ed4-49f5-9c45-67aada317913"

# Reader at sub scope (covers all resource discovery)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Reader" \
  --scope "/subscriptions/$NONPROD_SUB"

# Contributor at sub scope (creates / updates resources)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Contributor" \
  --scope "/subscriptions/$NONPROD_SUB"

# Key Vault Secrets Officer (read + write secrets and keys inside any vault)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$NONPROD_SUB"

# Storage Blob Data Contributor (read/write blob content via the storage_* tools)
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$NONPROD_SUB"
```

Contributor is broad. If you want tighter control, replace it with the narrower built-in roles you actually need (Storage Account Contributor, AKS Cluster Admin, etc.). The agent's system prompt already refuses RBAC grants and `az ad *` commands at the LLM layer, but RBAC is the durable enforcement.

## Prod subscription roles

```bash
PROD_SUB="a31708fa-027e-453d-9126-c86e7f9e54b4"

# Reader only — no writes
az role assignment create \
  --assignee-object-id "$MI_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Reader" \
  --scope "/subscriptions/$PROD_SUB"
```

Notice there is **no** Contributor on prod. This means any write attempt fails at the RBAC layer regardless of what the agent's prompt says. The agent's prompt is the ergonomic layer (so the LLM doesn't even try); RBAC is the durable layer (so a prompt injection can't escalate).

## Microsoft Entra read permissions

The MicrosoftEntra agent reads users, groups, app registrations, and devices. These live in Microsoft Graph, not in Azure RM, so RBAC roles don't help — you need Graph application permissions.

The MicrosoftMCPEnterprise (Microsoft 365 MCP) server runs with the project MI. Grant Graph read scopes to that MI:

```bash
# Get the Graph service principal in the tenant
GRAPH_SP=$(az ad sp list --display-name "Microsoft Graph" --query "[0].id" -o tsv)

# Grant common read-only Graph scopes
for SCOPE in "User.Read.All" "Group.Read.All" "Directory.Read.All" "Application.Read.All" "Device.Read.All"; do
  SCOPE_ID=$(az ad sp show --id "$GRAPH_SP" --query "appRoles[?value=='$SCOPE'].id | [0]" -o tsv)
  az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$MI_PRINCIPAL_ID/appRoleAssignments" \
    --body "{\"principalId\":\"$MI_PRINCIPAL_ID\",\"resourceId\":\"$GRAPH_SP\",\"appRoleId\":\"$SCOPE_ID\"}"
done
```

These are **application** permissions (not delegated). They take effect for the MI without user consent and apply to every Graph call the MCP server makes.

Grant only `*.Read.All` scopes — never `*.ReadWrite.All`. The agent prompt forbids Entra writes, but Graph permissions are what actually enforce it.

## Azure DevOps read permissions

The Devops agent uses the Azure DevOps MCP server. DevOps has its own permission model (not Azure RBAC, not Graph). Two steps:

1. The MI must be added to your DevOps organization as a user
2. The MI must be granted **Reader** at the project level on each project the agent should see

Do this in the DevOps web UI at `dev.azure.com/admin45`:

1. **Organization settings → Users → Add users**
   - Email: paste the MI's principal ID or the full MI resource ID (DevOps resolves it)
   - Access level: Basic (or Stakeholder if you have a free org)
   - Project: select all projects the agent should access
   - DevOps groups: leave empty
2. For each project: **Project settings → Permissions → Readers group → Add MI**

The Azure DevOps MCP server uses delegated permissions via the MI's token, so anything outside Readers will simply 401.

## Option B — split managed identities (not implemented)

The current setup uses one MI for both subs. The more conservative pattern is two MIs:

| MI | Sub | Roles |
| --- | --- | --- |
| `foundry-mi-nonprod` | Nonprod | Reader + Contributor + KV Officer + Storage Blob Data Contributor |
| `foundry-mi-prod` | Prod | Reader only |

The agent attaches one MI per environment to its MCP servers. A prompt-injection that tricks the agent into trying a prod write still cannot use the nonprod MI's elevated rights on the prod sub.

This is queued behind provisioning the separate non-prod sub. For now the single-MI approach is acceptable because:

- The prod sub has zero Contributor assignments at any scope — RBAC denies writes
- The agent prompt independently refuses prod writes
- All writes go through `run_az` which logs every command for audit

## Verification

Confirm the assignments stuck:

```bash
az role assignment list \
  --assignee "$MI_PRINCIPAL_ID" \
  --all \
  --output table
```

You should see at minimum:
- Reader on both subs
- Contributor on nonprod
- KV Secrets Officer on nonprod
- Storage Blob Data Contributor on nonprod

For Graph:

```bash
az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$MI_PRINCIPAL_ID/appRoleAssignments" \
  --query "value[].appRoleId" -o tsv
```

Should list the five Graph role IDs you assigned.

## What's next

The identity now has read/write where it should and read-only where it shouldn't. The agents still don't know about any of this — they call MCP servers, which inherit the MI's permissions. Next chapter wires the six MCP servers and attaches them to the right agents.

Continue to [MCP tools](/azure-multi-agent/03-mcp-tools/).
