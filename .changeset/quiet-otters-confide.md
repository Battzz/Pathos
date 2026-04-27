---
"helmor": patch
---

Polish how Helmor sends prompts to the agent on your behalf:
- Stop showing your "general preferences" preamble inside your own chat bubbles. The preamble is still delivered to the agent on the wire, but it no longer appears in the visible message or gets persisted with the user prompt — so reloading a session shows only what you actually typed.
- Substitute the workspace's real git remote name into the Create PR / Commit and push / Resolve conflicts prompts (e.g. `git push -u origin HEAD` instead of `git push -u <remote> HEAD`) so the agent gets a concrete command instead of a placeholder.
