---
"helmor": patch
---

Tighten the scripts terminal hover-zoom so it only engages when there's real output to read:
- The Setup/Run tab header no longer triggers the zoom, so moving the cursor between tabs or to the collapse chevron keeps the panel at its resting size.
- The empty placeholder states (no script configured, or script configured but not yet run) no longer trigger the zoom — it now only engages once a script has actually produced terminal output.
- The Stop/Rerun button in the bottom-right corner only appears once the panel has enlarged, so it's no longer clipped and unclickable at the resting size.
