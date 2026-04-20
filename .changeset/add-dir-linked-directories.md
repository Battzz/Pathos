---
"helmor": minor
---

Add `/add-dir` to link extra directories into a workspace so agents can read and edit them alongside the main worktree. Linked directories persist per workspace and appear as chips in a new "context" strip inside the composer, above the input.
- Picker: selecting `/add-dir` inserts a purple pill into the editor and opens a cmdk popup above the composer. The popup suggests every ready workspace across all repos and a "Browse folder…" escape hatch. Type after the pill to filter, Enter to pick, Backspace once to exit.
- Context bar: chips show each linked directory's name + branch, hover tooltip reveals the full path. Tab / ←/→ / Home / End navigate; Backspace or Delete removes with a collapse animation; Escape blurs.
- Claude: paths are merged with the workspace's git worktree metadata directories and sent as `additionalDirectories`.
- Codex: in plan mode the current cwd plus linked paths become `sandboxPolicy.writableRoots` so edits outside cwd aren't rejected.
