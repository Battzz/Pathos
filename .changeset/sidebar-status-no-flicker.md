---
"helmor": patch
---

Fix sidebar flicker when switching workspace status:
- Changing status (e.g. backlog → in progress) no longer causes a visible flash. The sidebar now waits for the backend to confirm the change before refreshing, instead of doing an optimistic update that gets immediately overwritten by a cache refetch.
