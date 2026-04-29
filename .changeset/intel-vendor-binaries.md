---
"helmor": patch
---

Fix the Intel macOS build shipping arm64 vendor binaries — `gh auth login`, `glab`, `codex`, and `bun` now match the bundle architecture instead of failing with "bad CPU type in executable".
