---
"helmor": patch
---

A round of CLI auth and UI polish:
- Pin Settings → Account CLI rows to a fixed height so they stop jumping between Connect / Ready / Error.
- Edge-detect forge `Unauthenticated` in the backend so the 60s poll stops republishing on every tick, and fan it out to the Account CLI cache so it can't go stale.
- Reflect external GitHub sign-in / sign-out in Settings → Account via the shared identity hook.
- Surface CLI command errors (e.g. `gh` not on PATH) immediately during auth instead of waiting out the full poll budget.
- Make the inspector Connect button actually re-authenticate when the remote disagrees with the local CLI snapshot, instead of toasting a misleading "connected".
- Replace the editor close-button tooltip with an inline `Esc` shortcut next to the X.
- Fall back to `logo.svg` / `public/logo.svg` when picking a workspace repo icon.
