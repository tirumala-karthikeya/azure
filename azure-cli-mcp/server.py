"""
Azure CLI MCP Server.
Exposes `az` CLI as MCP tools so a Foundry agent can execute arbitrary Azure operations.

Authentication:
- The container is authenticated to Azure via Managed Identity (`az login --identity` runs at startup).
- Incoming MCP requests are authenticated by Container Apps Easy Auth (Microsoft Entra).
"""

import asyncio
import os
import shlex
import subprocess
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("AzureCLIMCPServer", host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

DEFAULT_SUBSCRIPTION = os.environ.get("AZURE_SUBSCRIPTION_ID", "")
COMMAND_TIMEOUT_SECONDS = 180

DANGEROUS_PATTERNS = [
    "az account clear",
    "az logout",
    "az login",
    "az role assignment create",
    "az role assignment delete",
    "az ad ",
    "rm -rf",
    ";",
    "&&",
    "||",
    "|",
    ">",
    "<",
    "`",
    "$(",
]


def _is_dangerous(command: str) -> str | None:
    lowered = command.lower().strip()
    for pattern in DANGEROUS_PATTERNS:
        if pattern in lowered:
            return pattern
    return None


@mcp.tool()
async def run_az(command: str, output_format: str = "json") -> str:
    """
    Execute an Azure CLI command and return its output.

    Pass the command WITHOUT the leading `az`. Examples:
      - "group list"
      - "keyvault create --name myvault --resource-group rg-prod --location eastus"
      - "storage account show --name mystorage --resource-group rg-prod"

    The subscription is auto-injected from AZURE_SUBSCRIPTION_ID env var.
    Output is JSON by default; set output_format to "table" or "tsv" if needed.

    Refuses commands containing shell metacharacters or known-dangerous patterns
    (logout, role assignment, ad commands).
    """
    blocked = _is_dangerous(command)
    if blocked:
        return f"REFUSED: command contains blocked pattern '{blocked}'. This MCP server does not allow shell chaining, logout, role assignment, or ad commands."

    parts = shlex.split(command)
    if not parts:
        return "ERROR: empty command"

    if parts[0] == "az":
        parts = parts[1:]

    cmd = ["az"] + parts
    if "--subscription" not in command and DEFAULT_SUBSCRIPTION:
        cmd += ["--subscription", DEFAULT_SUBSCRIPTION]
    if "--output" not in command and "-o" not in command:
        cmd += ["--output", output_format]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=COMMAND_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return f"ERROR: command timed out after {COMMAND_TIMEOUT_SECONDS}s"
    except FileNotFoundError:
        return "ERROR: az CLI not found in container"

    if proc.returncode == 0:
        return stdout.decode("utf-8") or "(empty output, command succeeded)"
    return (
        f"Error (exit code {proc.returncode}):\n"
        f"STDERR:\n{stderr.decode('utf-8')}\n"
        f"STDOUT:\n{stdout.decode('utf-8')}"
    )


@mcp.tool()
async def create_resource_group(name: str, location: str = "eastus") -> str:
    """Create an Azure resource group. Returns the JSON of the created RG."""
    return await run_az(f"group create --name {name} --location {location}")


@mcp.tool()
async def create_keyvault(name: str, resource_group: str, location: str = "eastus") -> str:
    """Create an Azure Key Vault with RBAC authorization enabled."""
    return await run_az(
        f"keyvault create --name {name} --resource-group {resource_group} "
        f"--location {location} --enable-rbac-authorization true"
    )


@mcp.tool()
async def create_storage_account(name: str, resource_group: str, location: str = "eastus", sku: str = "Standard_LRS") -> str:
    """Create an Azure Storage Account."""
    return await run_az(
        f"storage account create --name {name} --resource-group {resource_group} "
        f"--location {location} --sku {sku} --kind StorageV2"
    )


@mcp.tool()
async def whoami() -> str:
    """Show the identity the MCP server is authenticated as."""
    return await run_az("account show")


if __name__ == "__main__":
    mcp.run(transport="sse")
