---
"helmor": minor
---

Add a guided first-run onboarding flow that walks new users from agent login to a workable workspace:
- Animated multi-step intro with previews of the Helmor UI, per-step spotlights, and Back / Next navigation between steps.
- Agent login step that detects active Claude and Codex installations and highlights the provider you're signed into.
- A "Power up Helmor" step that installs the Helmor CLI and Helmor Skills (Beta) from inside the app, with a live `helmor --help` preview — setup failures don't block onboarding, you can resolve them later from inside Helmor.
- Repository import step that lets you clone from a URL or add a local path before reaching the main workspace.
