#!/bin/sh
set -e

echo "[startup] Logging Azure CLI in via Managed Identity..."
az login --identity --output none

echo "[startup] Setting default subscription: $AZURE_SUBSCRIPTION_ID"
if [ -n "$AZURE_SUBSCRIPTION_ID" ]; then
  az account set --subscription "$AZURE_SUBSCRIPTION_ID"
fi

echo "[startup] az identity check:"
az account show --output table || echo "[startup] WARNING: az account show failed"

echo "[startup] Starting MCP server on port $PORT..."
exec python server.py
