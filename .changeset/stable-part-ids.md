---
"helmor": minor
---

Stable part IDs across the streaming pipeline — thinking blocks no longer auto-collapse at block boundaries:
- Every message part (Text, Reasoning, Image, TodoList, etc.) now carries a stable `id` minted at first sight and preserved through streaming deltas, turn commit, DB persistence, and historical reload. React keys use this id instead of array position, eliminating remounts caused by pipeline reordering (collapse grouping, tool-call folding, message merging).
- Message-level IDs are pre-assigned as DB UUIDs at turn start instead of using temporary `stream-partial:N` identifiers that flip to a different UUID on commit. The entire `sync_persisted_ids` / `sync_result_id` post-hoc reconciliation machinery is removed.
- Collapsed read-only tool groups now default to expanded and stop their loading spinner as soon as the last tool returns a result, instead of spinning until the overall message stream ends.
- Subagent status labels (Subagent started / completed) no longer line-break on narrow viewports.
