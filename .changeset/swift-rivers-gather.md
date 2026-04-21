---
"helmor": minor
---

Add a follow-up queue for messages sent while the AI is still responding:
- New Settings toggle (Follow-up behavior) picks between Queue and Steer — Queue stashes the next message and auto-sends it once the current turn finishes; Steer keeps the existing mid-turn interrupt.
- Queued messages appear as stacked rows above the composer with Steer-now / remove actions, and survive session and workspace switches.
- Pull-on-conflict and dirty-worktree resolution prompts now queue onto the active chat automatically instead of blocking with a toast when the AI is busy.
