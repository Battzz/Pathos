---
"helmor": minor
---

Add a one-click shortcut to open your running dev server from the Run panel:
- While the Run script is active, a new "Open" button appears in the Run tab header that auto-detects localhost URLs from framework banners (Vite, Next.js, CRA, plain `http://localhost:PORT` logs, etc.) and shows `Open:PORT` for instant browser launch.
- When the script exposes multiple services at once (e.g. separate API and frontend), hovering the button reveals a picker listing each detected URL so you can pick which one to open.
