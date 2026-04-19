---
"helmor": patch
---

Replace date-based log rotation with a bounded single-file ring:
- Both the Rust host and the sidecar now write to `rust.jsonl` / `sidecar.jsonl` with a `.1` backup that is overwritten on rotation, capping each component's log footprint at ~20 MB instead of accumulating a week of daily files.
- Removes the background cleanup thread and the `tracing-appender` / `flate2` dependencies; no more gzip pass, no UTC/local date races.
