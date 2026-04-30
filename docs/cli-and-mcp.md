# Pathos CLI & MCP Server

Pathos ships a companion CLI inside the desktop app bundle. Release builds
install `pathos`; debug builds install `pathos-dev`. The terminal entrypoint
always points at the currently installed desktop app so CLI and desktop
versions stay aligned.

## Install

### Settings UI

Open the desktop app → Settings → Experimental → **Command Line Tool** → Install.
This installs a symlink to the app bundle's `pathos-cli`:

- Release build: `/usr/local/bin/pathos`
- Debug build: `/usr/local/bin/pathos-dev`

### Development

```bash
bun run dev:cli:build
./src-tauri/target/debug/pathos-cli cli-status
bun run dev:cli:install
pathos-dev cli-status
```

The debug build reads `~/pathos-dev/` — same database as `bun run dev`.

## CLI Usage

```bash
pathos data info
pathos .
pathos repo list
pathos repo add /path/to/repo
pathos workspace list
pathos workspace show pathos/earth            # human-readable ref
pathos workspace new --repo pathos
pathos session list --workspace pathos/earth
pathos session new --workspace pathos/earth
pathos send --workspace pathos/earth "Refactor the auth module"
```

Debug builds use the same commands under `pathos-dev`.

`pathos .` opens Pathos on the current folder, registers that folder as a
project if it is not already known, and starts a new project chat.

`--json` on any command outputs machine-readable JSON. `--data-dir <path>` overrides the data directory.

### Workspace References

Most commands accept either a UUID or a `repo-name/directory-name` shorthand:

```bash
pathos workspace show 5508edf1-bc73-4c6e-9c3d-21de3eeb25be   # UUID
pathos workspace show ai-shipany-template/draco                 # shorthand
```

## MCP Server

Run `pathos mcp` (or `pathos-dev mcp` in debug) to start a stdio MCP server implementing JSON-RPC 2.0.

### Exposed Tools

| Tool | Description |
|------|-------------|
| `pathos_data_info` | Data directory and build mode |
| `pathos_repo_list` | List repositories |
| `pathos_repo_add` | Register a local Git repo |
| `pathos_workspace_list` | List workspaces by status |
| `pathos_workspace_show` | Workspace details |
| `pathos_workspace_create` | Create workspace |
| `pathos_session_list` | List sessions |
| `pathos_session_create` | Create session |
| `pathos_send` | Send prompt to AI agent |

### Register with Claude Code

```bash
claude mcp add pathos -- /usr/local/bin/pathos mcp
```

Verify: `claude mcp list`

### Register with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pathos": {
      "command": "/usr/local/bin/pathos",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Desktop.

### Register with Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pathos": {
      "command": "/usr/local/bin/pathos",
      "args": ["mcp"]
    }
  }
}
```

### Dev Mode

Use the debug entrypoint instead:

```bash
claude mcp add pathos-dev -- /usr/local/bin/pathos-dev mcp
```

## Testing the MCP Server

### MCP Inspector (Web UI)

```bash
npx @modelcontextprotocol/inspector -- ./src-tauri/target/debug/pathos-cli mcp
```

Opens a browser UI to browse tools, invoke them, and inspect protocol traffic.

### Terminal Inspector

```bash
npx @wong2/mcp-cli -- ./src-tauri/target/debug/pathos-cli mcp
```

### Manual (pipe JSON-RPC)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| ./src-tauri/target/debug/pathos-cli mcp
```
