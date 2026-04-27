---
"helmor": patch
---

Keep Helmor's startup cache healthy as your workspace history grows:
- The on-disk query cache no longer balloons with workspace diff and file-list snapshots — they reload on focus when you actually need them, instead of getting saved on every state change and pushing the cache toward the browser's storage quota.
- Composer drafts are now cleaned up when their session is deleted, so they don't accumulate over time.
- Storage write failures (quota exceeded, security errors) now log to the console instead of being silently swallowed, making it easier to diagnose persistence issues.
