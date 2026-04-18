---
"helmor": patch
---

- Fix the "View change log" link never showing in the update-ready toast (and the Settings → App Updates panel). The release page URL is now derived deterministically from the update version instead of relying on a field that `latest.json` never actually contains.
