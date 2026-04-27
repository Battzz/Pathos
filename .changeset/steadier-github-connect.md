---
"helmor": patch
---

A couple of small polish fixes:
- Stop the GitHub "Connect" prompt from flickering on flaky networks: the gh / glab status check now tolerates transient blips for up to 10 minutes and no longer mistakes upstream "401 Service Unavailable" / "unauthenticated upstream" responses for a real logout.
- Slightly darken the composer placeholder and the auto/plan-mode pill at rest so they stay legible instead of fading into the background.
