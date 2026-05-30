#!/bin/bash
# Deploy the Azure CLI MCP Server to Azure Container Apps.
# Uses ACR build (cloud-side) to avoid the buggy `containerapp up` command.

set -e

SUBSCRIPTION_ID="64d347f2-7434-4ae2-9b7d-618fbffc37ac"
RESOURCE_GROUP="copilot-rg"
LOCATION="eastus"
APP_NAME="azure-cli-mcp"
ENV_NAME="azure-cli-mcp-env"
ACR_NAME="azureclimcp$(printf '%05d' $((RANDOM % 100000)))"
IMAGE_NAME="azure-cli-mcp:latest"

echo "==> Setting subscription"
az account set --subscription "$SUBSCRIPTION_ID"

echo "==> Ensuring Container Apps Environment exists: $ENV_NAME"
az containerapp env show --name "$ENV_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1 || \
  az containerapp env create \
    --name "$ENV_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION"

echo "==> Looking for existing ACR in resource group $RESOURCE_GROUP..."
EXISTING_ACR=$(az acr list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || true)

if [ -n "$EXISTING_ACR" ]; then
  echo "==> Reusing existing ACR: $EXISTING_ACR"
  ACR_NAME="$EXISTING_ACR"
else
  echo "==> Creating new ACR: $ACR_NAME"
  az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true
fi

echo "==> Building image with ACR (cloud build, no Docker daemon required)"
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME" \
  .

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

echo "==> Creating Container App: $APP_NAME"
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "==> Container App exists, updating image"
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$ACR_LOGIN_SERVER/$IMAGE_NAME"
else
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENV_NAME" \
    --image "$ACR_LOGIN_SERVER/$IMAGE_NAME" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_USERNAME" \
    --registry-password "$ACR_PASSWORD" \
    --target-port 8080 \
    --ingress external \
    --system-assigned \
    --env-vars "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID" "PORT=8080" \
    --min-replicas 1 \
    --max-replicas 1
fi

echo "==> Ensuring system-assigned managed identity is enabled"
az containerapp identity assign \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --system-assigned

PRINCIPAL_ID=$(az containerapp identity show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query principalId -o tsv)

echo "==> Principal ID: $PRINCIPAL_ID"

echo "==> Granting Contributor + Key Vault Secrets Officer at subscription scope"
az role assignment create --assignee "$PRINCIPAL_ID" --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" 2>&1 | tail -2 || true
az role assignment create --assignee "$PRINCIPAL_ID" --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" 2>&1 | tail -2 || true

FQDN=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn \
  -o tsv)

echo ""
echo "===================================================="
echo "DEPLOYMENT COMPLETE"
echo "===================================================="
echo ""
echo "Container App URL: https://$FQDN"
echo "MCP SSE endpoint:  https://$FQDN/sse"
echo ""
echo "Next steps:"
echo "1. Wait ~30s for the container to start, then test:"
echo "     curl https://$FQDN/sse"
echo ""
echo "2. (Recommended) Enable Microsoft Entra Easy Auth:"
echo "     Portal -> Container Apps -> $APP_NAME -> Authentication"
echo "     -> Add identity provider -> Microsoft"
echo ""
echo "3. In Foundry, add a new MCP tool:"
echo "     Name: AzureCLIServer"
echo "     Endpoint: https://$FQDN/sse"
echo "     Authentication: Microsoft Entra (after step 2)"
echo "                  or: Unauthenticated (testing only)"
echo ""
