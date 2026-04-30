---
name: pathos-cli
description: Use the Pathos CLI to remote-control Pathos from the terminal. Use when the user asks to inspect Pathos data/settings, manage repositories/workspaces/sessions/files, open a folder with `pathos .`, send prompts to agents, list models, use GitHub integration, inspect scripts, run Pathos as an MCP server, generate shell completions, quit a running app, check/install/update the Pathos CLI beta, install/update Pathos skills through the beta app flow, or needs the Pathos command reference.
---

# Pathos CLI

Use this skill to guide simple terminal-first Pathos workflows. Keep the answer practical: prefer one or two concrete commands over a long CLI tutorial.

## First Checks

1. Check whether the CLI is installed and which data mode it targets:

```bash
pathos cli-status
```

2. Check the active data directory and database:

```bash
pathos data
```

Use `--json` when the output will be parsed by scripts or another tool.

## CLI Install And Update

Treat Pathos CLI install/update as beta.

- Prefer the Pathos desktop onboarding/settings flow for installing or repairing the managed CLI entrypoint.
- Use `pathos cli-status` to verify whether the PATH entry points at the current app-managed CLI.
- Do not invent a stable standalone install/update command unless it exists in `pathos --help` or a subcommand help page.
- If the user is blocked, ask them to run `pathos cli-status` and share the output, or inspect the app's CLI install panel if working inside the Pathos repo.

## Pathos Skills Install And Update

Treat Pathos skills install/update as a beta app-managed flow.

- Prefer the Pathos desktop onboarding/settings flow for installing or updating bundled Pathos skills.
- Do not invent a `pathos skills` command; the top-level CLI help does not currently expose one.
- If the user asks to update a bundled Pathos skill inside the repo, edit the skill files directly and validate them with the skill validation tooling.
- Keep user-facing skill content concise and English-first unless the user explicitly asks for another language.

## Common Tasks

### Manage Repositories And Workspaces

Use these command groups for local-first project setup and workspace orchestration:

```bash
pathos repo --help
pathos workspace --help
```

When creating workspaces, prefer explicit repo names and concise purpose labels:

```bash
pathos workspace new --repo pathos
```

Use the folder shorthand to register the current folder if needed, open Pathos,
and create a new project chat:

```bash
pathos .
```

### Inspect Sessions And Files

Use sessions for conversation history and files for editor-surface operations:

```bash
pathos session --help
pathos files --help
```

### Send A Prompt To An Agent

Use `send` when the user wants to dispatch work from the terminal:

```bash
pathos send --help
```

Favor JSON output for automation:

```bash
pathos --json send --help
```

### Integrations And Local Tooling

Use the relevant command group:

```bash
pathos github --help
pathos scripts --help
pathos models --help
```

### MCP Server

Run Pathos as an MCP server over stdio:

```bash
pathos mcp
```

Use this when another agent/runtime needs to call Pathos through Model Context Protocol.

## Command Reference

Read `references/pathos-help.md` when you need the full top-level `pathos --help` command list.

For exact flags on a command group, run the group's help instead of guessing:

```bash
pathos <command> --help
```
