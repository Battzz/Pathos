---
"helmor": patch
---

Restore visible reasoning content for Claude Opus 4.7:
- Opus 4.7 shipped with a new SDK default that hid thinking text from both streaming and the finalized response, leaving the reasoning block empty and DB rows with no text. Helmor now opts back into summarized thinking so the progress is visible during the turn and the full text is persisted with the message.
