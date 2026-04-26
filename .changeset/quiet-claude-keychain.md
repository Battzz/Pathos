---
"helmor": patch
---

Stop the Claude rate-limit indicator from re-triggering the macOS keychain prompt on every Helmor upgrade, and let Claude CLI handle expired-token refresh so its saved login is no longer invalidated by Anthropic's refresh-token rotation.
