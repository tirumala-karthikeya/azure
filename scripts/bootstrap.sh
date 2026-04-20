#!/usr/bin/env bash
# One-time Azure-side setup for the "create-app-registration" GitHub workflow.
#
# Creates:
#   - A bootstrap app registration + service principal ("gh-actions-app-creator")
#   - Microsoft Graph API permission: Application.ReadWrite.OwnedBy (+ admin consent)
#   - A federated credential so GitHub Actions OIDC can sign in as this SP
#   - (Optional) An Azure Key Vault + role assignment for storing generated secrets
#
# Prereqs:
#   - az CLI installed and signed in (`az login`)
#   - Caller has rights to create app registrations + grant admin consent
#     (Global Admin / Privileged Role Admin / Cloud Application Administrator)
#   - If creating a Key Vault: caller has Contributor + User Access Administrator
#     (or Owner) on the target subscription/resource group
#
# Usage:
#   ./bootstrap.sh \
#       --github-org tirumala-karthikeya \
#       --github-repo azure \
#       --github-environment production \
#       [--bootstrap-app-name gh-actions-app-creator] \
#       [--keyvault-name mykv] \
#       [--keyvault-rg my-rg] \
#       [--keyvault-location eastus]
#
# All Key Vault flags are optional; omit them to skip the KV setup.

set -euo pipefail

# -------- defaults --------
BOOTSTRAP_APP_NAME="gh-actions-app-creator"
GITHUB_ORG=""
GITHUB_REPO=""
GITHUB_ENV="production"
KV_NAME=""
KV_RG=""
KV_LOCATION="eastus"

# -------- arg parsing --------
while [ $# -gt 0 ]; do
  case "$1" in
    --github-org)         GITHUB_ORG="$2"; shift 2 ;;
    --github-repo)        GITHUB_REPO="$2"; shift 2 ;;
    --github-environment) GITHUB_ENV="$2"; shift 2 ;;
    --bootstrap-app-name) BOOTSTRAP_APP_NAME="$2"; shift 2 ;;
    --keyvault-name)      KV_NAME="$2"; shift 2 ;;
    --keyvault-rg)        KV_RG="$2"; shift 2 ;;
    --keyvault-location)  KV_LOCATION="$2"; shift 2 ;;
    -h|--help)            grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$GITHUB_ORG"  ] || { echo "missing --github-org"  >&2; exit 2; }
[ -n "$GITHUB_REPO" ] || { echo "missing --github-repo" >&2; exit 2; }

FEDERATED_SUBJECT="repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:${GITHUB_ENV}"

echo "==> Confirming az login"
TENANT_ID=$(az account show --query tenantId -o tsv 2>/dev/null || true)
if [ -z "$TENANT_ID" ]; then
  echo "Not logged in. Run:  az login --tenant <tenantId> --allow-no-subscriptions" >&2
  exit 1
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv 2>/dev/null || true)
# When no subscription is attached, az returns the tenantId in 'id'. Treat that as "no subscription".
if [ "$SUBSCRIPTION_ID" = "$TENANT_ID" ]; then
  SUBSCRIPTION_ID=""
fi
echo "    tenant:       $TENANT_ID"
echo "    subscription: ${SUBSCRIPTION_ID:-<none — Entra-only login>}"

if [ -n "$KV_NAME" ] && [ -z "$SUBSCRIPTION_ID" ]; then
  echo "Key Vault setup requires an Azure subscription, but none is active." >&2
  echo "Either drop --keyvault-name, or attach a subscription to this account." >&2
  exit 1
fi

# -------- 1. bootstrap app + SP --------
echo "==> Ensuring app registration '$BOOTSTRAP_APP_NAME'"
APP_ID=$(az ad app list --display-name "$BOOTSTRAP_APP_NAME" --query "[0].appId" -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$BOOTSTRAP_APP_NAME" --query appId -o tsv)
  echo "    created: $APP_ID"
else
  echo "    exists:  $APP_ID"
fi

echo "==> Ensuring service principal for app"
SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)
if [ -z "$SP_ID" ]; then
  SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
  echo "    created: $SP_ID"
else
  echo "    exists:  $SP_ID"
fi

# -------- 2. Microsoft Graph permission --------
# Graph API app id + id of the "Application.ReadWrite.OwnedBy" app role
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
OWNEDBY_ROLE_ID="18a4783c-866b-4cc7-a460-3d5e5662c884"

echo "==> Ensuring Microsoft Graph permission (Application.ReadWrite.OwnedBy)"
az ad app permission add \
  --id "$APP_ID" \
  --api "$GRAPH_APP_ID" \
  --api-permissions "${OWNEDBY_ROLE_ID}=Role" \
  --only-show-errors 2>/dev/null || true

echo "==> Granting admin consent (requires tenant admin)"
if ! az ad app permission admin-consent --id "$APP_ID" 2>/dev/null; then
  echo "    WARNING: could not grant admin consent automatically."
  echo "    Ask a tenant admin to open the Portal and click 'Grant admin consent'"
  echo "    on app registration '$BOOTSTRAP_APP_NAME' → API permissions."
fi

# -------- 3. federated credential --------
echo "==> Ensuring federated credential for GitHub OIDC"
FEDERATED_NAME="github-${GITHUB_REPO}-${GITHUB_ENV}"
EXISTING_FC=$(az ad app federated-credential list --id "$APP_ID" \
  --query "[?name=='$FEDERATED_NAME'].id" -o tsv)
FC_PARAMS=$(cat <<EOF
{
  "name": "$FEDERATED_NAME",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$FEDERATED_SUBJECT",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)
if [ -z "$EXISTING_FC" ]; then
  az ad app federated-credential create --id "$APP_ID" --parameters "$FC_PARAMS" >/dev/null
  echo "    created: $FEDERATED_NAME → $FEDERATED_SUBJECT"
else
  echo "    exists:  $FEDERATED_NAME"
fi

# -------- 4. (optional) Key Vault --------
if [ -n "$KV_NAME" ]; then
  [ -n "$KV_RG" ] || { echo "missing --keyvault-rg (required with --keyvault-name)" >&2; exit 2; }

  echo "==> Ensuring resource group '$KV_RG'"
  az group create --name "$KV_RG" --location "$KV_LOCATION" --only-show-errors >/dev/null

  echo "==> Ensuring Key Vault '$KV_NAME'"
  if ! az keyvault show --name "$KV_NAME" --only-show-errors >/dev/null 2>&1; then
    az keyvault create \
      --name "$KV_NAME" \
      --resource-group "$KV_RG" \
      --location "$KV_LOCATION" \
      --enable-rbac-authorization true \
      --only-show-errors >/dev/null
    echo "    created: $KV_NAME"
  else
    echo "    exists:  $KV_NAME"
  fi

  echo "==> Granting bootstrap SP 'Key Vault Secrets Officer' on the vault"
  KV_SCOPE=$(az keyvault show --name "$KV_NAME" --query id -o tsv)
  az role assignment create \
    --assignee-object-id "$SP_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets Officer" \
    --scope "$KV_SCOPE" \
    --only-show-errors >/dev/null 2>&1 || echo "    (role assignment may already exist)"
fi

# -------- 5. output --------
echo ""
echo "============================================================"
echo " Done. Add the following to GitHub repo secrets:"
echo "   Settings → Secrets and variables → Actions"
echo "============================================================"
echo "AZURE_CLIENT_ID        = $APP_ID"
echo "AZURE_TENANT_ID        = $TENANT_ID"
[ -n "$SUBSCRIPTION_ID" ] && echo "AZURE_SUBSCRIPTION_ID  = $SUBSCRIPTION_ID"
[ -n "$KV_NAME" ]         && echo "KEYVAULT_NAME          = $KV_NAME"
echo ""
echo "Also create a GitHub Environment named '$GITHUB_ENV' in:"
echo "   Settings → Environments → New environment"
echo "(Optional: add required reviewers for approval gating.)"
echo "============================================================"
