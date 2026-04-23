---
"helmor": patch
---

Improve error visibility and file navigation in chat responses:
- Let local file references in assistant messages open directly in Helmor's in-app editor at the referenced line when the file is inside the current workspace.
- Preserve specific Claude API errors like unexpected socket disconnects instead of collapsing them into a generic "unknown error" notice.
