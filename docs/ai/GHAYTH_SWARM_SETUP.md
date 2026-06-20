# Ghayth Claude Swarm Setup

This is a local setup for testing Claude Code as a controlled multi-agent swarm for Ghayth.

## Goal

Claude should not ask the project owner for routine decisions. It should use governance settings and the Standard mode by default.

## Components

- `ghayth-orchestrator`: coordinates work.
- `ghayth-planner`: scans and plans batches.
- `ghayth-executor`: executes one approved batch at a time.
- `ghayth-governance-policy`: decides allow/block/split/read_only/require_role_approval from policy settings.

## Local MCP

Do not commit tokens.

If you have a remote MCP/swarm URL, set it locally only:

```bash
export GHAYTH_SWARM_MCP_URL='YOUR_PRIVATE_MCP_URL_WITH_TOKEN'
```

Then this setup script can create a local `.mcp.json`. Keep `.mcp.json` uncommitted.

## Test

From repository root:

```bash
claude
/agents
```

Then run the command content from:

```text
.claude/commands/ghayth-swarm-test.md
```

Expected behavior:

- Read-only audit.
- No code changes.
- No migrations.
- No owner-person approval.
- Decisions routed through governance policy mode Standard.
