---
"helmor": patch
---

Polish the Settings → Account CLI integration rows:
- Pin every state (Connect / Ready / Error) to the same height so the row no longer jumps when the CLI status loads.
- Refresh the row's cached status when the main UI detects the CLI auth has dropped, so Account no longer shows a stale "ready" after auth has failed elsewhere.
- Surface CLI command errors (e.g. `gh` not on PATH) immediately during the auth flow instead of waiting out the full poll budget.
- When the inspector's Connect button is shown because the remote disagrees with the local CLI snapshot, the terminal hand-off is no longer skipped — clicking Connect actually re-authenticates instead of toasting a misleading "connected".
