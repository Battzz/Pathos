---
"helmor": patch
---

Fix the Conductor-to-Helmor workspace migration by rewriting `$CONDUCTOR_*` environment variable references in `helmor.json` to their `$HELMOR_*` equivalents, so Cmd+R no longer fails with `exit 127` on freshly migrated or partially-migrated workspaces.
