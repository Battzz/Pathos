---
"helmor": patch
---

Make the inspector's PR header feel instant on workspace switch:
- Render the PR badge from the persisted snapshot the moment a workspace opens, before the live forge query returns — no more shimmer flash on cold start.
- Stop the shimmer from flashing on background PR refreshes; it now only appears on the very first fetch for a workspace.
- Hover the PR badge to see the PR title in a tooltip.
- The sidebar workspace name now reflects the live PR title once a PR has been opened.
