# Changelog

## 0.6.2

### Patch Changes

- [#215](https://github.com/dohooo/helmor/pull/215) [`561b4de`](https://github.com/dohooo/helmor/commit/561b4de89b9c6e53a3dcbb92a65129af7929437c) Thanks [@natllian](https://github.com/natllian)! - Upgrade the bundled Codex CLI to 0.124.0 so the Codex model picker picks up newer OpenAI models, including GPT-5.5.

- [#210](https://github.com/dohooo/helmor/pull/210) [`d49f63a`](https://github.com/dohooo/helmor/commit/d49f63aee60a8bce61bba7c1ffc501f22c204ef1) Thanks [@natllian](https://github.com/natllian)! - Fix Claude's AskUserQuestion so the answer you pick in the UI actually reaches the assistant when you submit.

- [#211](https://github.com/dohooo/helmor/pull/211) [`92193b5`](https://github.com/dohooo/helmor/commit/92193b5a475dc03b4711bd879c87a3344fbb8076) Thanks [@natllian](https://github.com/natllian)! - Stop rendering mislabeled "Subagent started / completed" rows next to long-running Bash commands — those came from Claude's per-bash lifecycle notices and duplicated the Bash tool call itself.

- [#214](https://github.com/dohooo/helmor/pull/214) [`cebac7b`](https://github.com/dohooo/helmor/commit/cebac7bc3678241ef55d0d9945a4aa3413ca1cbe) Thanks [@natllian](https://github.com/natllian)! - Fix the composer's context-usage ring so it updates immediately after every turn instead of appearing stuck until the user switched sessions or refocused the window.

- [#216](https://github.com/dohooo/helmor/pull/216) [`06e3cdd`](https://github.com/dohooo/helmor/commit/06e3cddd27994511757a90006f88d0219932ed15) Thanks [@natllian](https://github.com/natllian)! - Remove the unused workspace `.context` scaffold and stop preserving it during archive, restore, and import flows.

- [#217](https://github.com/dohooo/helmor/pull/217) [`3f8d37d`](https://github.com/dohooo/helmor/commit/3f8d37d22f2fea497efca0287d5136a8160df45f) Thanks [@natllian](https://github.com/natllian)! - Keep pinned workspaces in the pinned section and place unarchived workspaces directly into their final newest-first position so the sidebar no longer jumps when the list refreshes.

## 0.6.1

### Patch Changes

- [#203](https://github.com/dohooo/helmor/pull/203) [`4b9cf2e`](https://github.com/dohooo/helmor/commit/4b9cf2e454bcac77f083b25a07e666d72a2eae33) Thanks [@dohooo](https://github.com/dohooo)! - Enable the WebView devtools panel in production builds, so you can right-click → Inspect Element inside Helmor to help diagnose rendering issues like scrollbar glitches.

## 0.6.0

### Minor Changes

- [#190](https://github.com/dohooo/helmor/pull/190) [`ba14555`](https://github.com/dohooo/helmor/commit/ba145557e7e30ae2a2f1b065f21d2dcffb83d36f) Thanks [@dohooo](https://github.com/dohooo)! - Ship a sidebar clone flow and a couple of readability polish fixes:

  - Add "Clone from URL" to the Workspaces add-repository menu so you can paste a Git URL, pick a clone location, and have Helmor clone and import the repository as a new workspace in one step.
  - Fix sidebar workspace titles clipping descenders (g / j / p / q / y) at the bottom edge when the app is zoomed out.
  - Restore vertical rhythm around assistant markdown headings and add a touch of horizontal breathing room to inline code in chat messages.

- [#197](https://github.com/dohooo/helmor/pull/197) [`1f0e5e7`](https://github.com/dohooo/helmor/commit/1f0e5e7380a6588a7f3ba56aefe4649f91b0d085) Thanks [@natllian](https://github.com/natllian)! - Add a context-usage ring next to the composer's send button that shows current token usage with a hover popover; the ring auto-reveals once usage crosses 70% of the model context window, or can be set to always show via a new "Always show context usage" toggle in Settings.

- [#200](https://github.com/dohooo/helmor/pull/200) [`4bb9fd6`](https://github.com/dohooo/helmor/commit/4bb9fd6f10beab55417f092ac49b621eb0e1c062) Thanks [@natllian](https://github.com/natllian)! - Add a per-repository Auto-run toggle for setup scripts so new workspaces can either run setup immediately on creation or stay ready for manual setup from the Setup tab.

### Patch Changes

- [#194](https://github.com/dohooo/helmor/pull/194) [`cfe8f67`](https://github.com/dohooo/helmor/commit/cfe8f672dfb27029431372828f136f6cef2688e6) Thanks [@natllian](https://github.com/natllian)! - Drop unused database tables and columns.

- [#195](https://github.com/dohooo/helmor/pull/195) [`25cfefc`](https://github.com/dohooo/helmor/commit/25cfefc2788c3e9bec98f93d500b6c897fe387c7) Thanks [@natllian](https://github.com/natllian)! - Improve error visibility and file navigation in chat responses:

  - Let local file references in assistant messages open directly in Helmor's in-app editor at the referenced line when the file is inside the current workspace.
  - Preserve specific Claude API errors like unexpected socket disconnects instead of collapsing them into a generic "unknown error" notice.

- [#187](https://github.com/dohooo/helmor/pull/187) [`9e41cd7`](https://github.com/dohooo/helmor/commit/9e41cd7dfbf153a9737000f78c04aee0a920d515) Thanks [@natllian](https://github.com/natllian)! - Keep queued follow-up prompts overlaying the composer instead of shrinking the thread, and show a proper icon for streamed Skill entries.

- [#196](https://github.com/dohooo/helmor/pull/196) [`34ce8a4`](https://github.com/dohooo/helmor/commit/34ce8a4e50b0bd198334ae3bd1dc71aebf15f31e) Thanks [@natllian](https://github.com/natllian)! - Fix Codex sessions so sandbox mode changes apply on later turns and Git worktree metadata directories stay writable for commit and push operations.

- [#193](https://github.com/dohooo/helmor/pull/193) [`6e77a94`](https://github.com/dohooo/helmor/commit/6e77a944507511e87c4ab0912d2ff8fe11d50644) Thanks [@natllian](https://github.com/natllian)! - Refresh the inspector's Actions panel immediately after switching target branch, so the sync-with-remote row shows the new ahead/behind numbers right away instead of lagging up to ten seconds behind.

- [#198](https://github.com/dohooo/helmor/pull/198) [`0ce21bb`](https://github.com/dohooo/helmor/commit/0ce21bbcf38229f1d834dfbe2ebf219771c74c9f) Thanks [@natllian](https://github.com/natllian)! - Fix Cmd+Q on macOS so quitting while a task is running now shows the same confirmation dialog as the window close button instead of exiting immediately.

- [#199](https://github.com/dohooo/helmor/pull/199) [`e5abd9c`](https://github.com/dohooo/helmor/commit/e5abd9c8a0dc56ec67685b2b7dd7f3e81c802733) Thanks [@dohooo](https://github.com/dohooo)! - Stop the workspace sidebar and command palette from showing a stray scrollbar in production builds.

- [#199](https://github.com/dohooo/helmor/pull/199) [`0d0050b`](https://github.com/dohooo/helmor/commit/0d0050b7e8a9f5667e9737cbb198affe3c6e053b) Thanks [@dohooo](https://github.com/dohooo)! - Fix multiple chat viewport scrolling glitches during streaming:

  - Eliminate the near-bottom flicker, the mid-stream auto-scroll stall, and the first-chunk overshoot that could leave the view stranded mid-reply.
  - Keep the streaming logo and timer reliably pinned to the end of the assistant output instead of briefly covering text or snapping back into place a moment later.
  - Stop the viewport from bouncing up and down by about one line once a single reply grows taller than the screen on fast models.

- [#191](https://github.com/dohooo/helmor/pull/191) [`c582325`](https://github.com/dohooo/helmor/commit/c5823254ba1a77ff9733cf6d025ad178b6ba49c9) Thanks [@natllian](https://github.com/natllian)! - Fix stuck sessions caused by SQLite contention and unresponsive sidecars:

  - Eliminate the "database is locked" failures that could interrupt session actions (marking read, pinning, renaming) while an AI turn was actively writing to the DB.
  - Detect a frozen or disconnected sidecar via heartbeat and surface a retry-able error instead of leaving the session stuck in a streaming state.

- [#196](https://github.com/dohooo/helmor/pull/196) [`12f3749`](https://github.com/dohooo/helmor/commit/12f374986ddd2f6459859cb05ddcf895f660085b) Thanks [@natllian](https://github.com/natllian)! - Add a hover-only copy button for user chat bubbles and remove the copy button fade animation so message actions appear immediately.

## 0.5.0

### Minor Changes

- [#173](https://github.com/dohooo/helmor/pull/173) [`dc620cd`](https://github.com/dohooo/helmor/commit/dc620cdd446501cd2a3f18c2251d3a321bae3e03) Thanks [@dohooo](https://github.com/dohooo)! - Ship a fuller Helmor companion CLI and keep the desktop app in sync with terminal-driven changes:
  - Expand the CLI with workspace, session, repo, files, settings, GitHub, models, send, MCP, and shell completion commands so you can manage Helmor workflows from the terminal.
  - Bundle the CLI with the desktop app and install it from Settings as `helmor` in release builds or `helmor-dev` in development builds so it stays version-matched with the app.
  - Reflect CLI-triggered workspace, session, files, settings, GitHub, and queued-send changes in the desktop UI immediately instead of waiting for focus-based refreshes.

## 0.4.2

### Patch Changes

- [#180](https://github.com/dohooo/helmor/pull/180) [`b4882cd`](https://github.com/dohooo/helmor/commit/b4882cd803feaf5c74cb0cd0295e10fafc68386a) Thanks [@natllian](https://github.com/natllian)! - Append custom repository preferences after Helmor's built-in prompts, and tighten the preferences editor so placeholders and prompt previews better match what agents actually receive.

## 0.4.1

### Patch Changes

- [#176](https://github.com/dohooo/helmor/pull/176) [`8536c7b`](https://github.com/dohooo/helmor/commit/8536c7b0f62dfa25266427a3d5e8537ca55485ae) Thanks [@natllian](https://github.com/natllian)! - Keep the model picker populated from the last good startup cache and only overwrite that cache after a successful model refresh, so reopening Helmor no longer flashes an empty "Select model" state before the catalog loads.

- [#177](https://github.com/dohooo/helmor/pull/177) [`b7d2de2`](https://github.com/dohooo/helmor/commit/b7d2de22bbf2c06b822ad9ca36e2096f0fcabca0) Thanks [@natllian](https://github.com/natllian)! - Fix fast Claude thinking blocks that were collapsing themselves and showing a generic "Thinking" label — they now stay expanded and show "Thought for Ns" as soon as reasoning finishes, even when the block completes too quickly for the streaming UI to observe it mid-flight.

- [#174](https://github.com/dohooo/helmor/pull/174) [`48bc8b1`](https://github.com/dohooo/helmor/commit/48bc8b1846e0a2e11ba2bc9a86c19c9f897a2d3e) Thanks [@natllian](https://github.com/natllian)! - Make the workspace unread dot behave the way you'd expect:
  - Clicking a workspace you just marked as unread now actually clears the green dot. Previously the click was silently ignored when the workspace was already the currently selected one.
  - "Mark as unread" only flips the workspace flag itself — it no longer flips a random session's unread state as a side effect, and your manual workspace-level mark is preserved as long as any session in that workspace is still unread.

## 0.4.0

### Minor Changes

- [#163](https://github.com/dohooo/helmor/pull/163) [`623c66b`](https://github.com/dohooo/helmor/commit/623c66b9895cc560f97d7ef33b2ddbeba6215629) Thanks [@natllian](https://github.com/natllian)! - Add a follow-up queue for messages sent while the AI is still responding:
  - New Settings toggle (Follow-up behavior) picks between Queue and Steer — Queue stashes the next message and auto-sends it once the current turn finishes; Steer keeps the existing mid-turn interrupt.
  - Queued messages appear as stacked rows above the composer with Steer-now / remove actions, and survive session and workspace switches.
  - Pull-on-conflict and dirty-worktree resolution prompts now queue onto the active chat automatically instead of blocking with a toast when the AI is busy.

### Patch Changes

- [#172](https://github.com/dohooo/helmor/pull/172) [`7120573`](https://github.com/dohooo/helmor/commit/71205737770359e85922850e181be56ddd9542f8) Thanks [@natllian](https://github.com/natllian)! - Fix approval prompts so Allow and Deny stay clickable while the agent is waiting, and remove the unused optional reason field from that approval UI.

- [#171](https://github.com/dohooo/helmor/pull/171) [`e8969e1`](https://github.com/dohooo/helmor/commit/e8969e19db80c03411fa3f145d902e5125c47622) Thanks [@natllian](https://github.com/natllian)! - Warn before closing a session while its chat is still running, and stop the in-flight response if you choose to close it anyway.

- [#168](https://github.com/dohooo/helmor/pull/168) [`bcf68c2`](https://github.com/dohooo/helmor/commit/bcf68c2204483a272af9288ba07d48f04fcae33f) Thanks [@natllian](https://github.com/natllian)! - Polish the Settings UI for clearer navigation:

  - Reorganize app settings into General, Appearance, Model, and Git sections with matching section titles.
  - Remove the empty top-left gap in the Settings dialog so the sidebar aligns cleanly with the header.
  - Remove the placeholder text from General preferences because that field no longer has a built-in prompt.

- [#170](https://github.com/dohooo/helmor/pull/170) [`c8bcd61`](https://github.com/dohooo/helmor/commit/c8bcd619bf652958ce2b37985a170a0b7d94a17f) Thanks [@natllian](https://github.com/natllian)! - Make Claude's `/add-dir` behavior match Codex more closely by reloading slash commands after linked directories change and consistently using linked-directory context for Claude prompts and command discovery.

- [#167](https://github.com/dohooo/helmor/pull/167) [`2b5bd0a`](https://github.com/dohooo/helmor/commit/2b5bd0a8f903db594e098cb5820fdf2dc0b373f3) Thanks [@natllian](https://github.com/natllian)! - Fix the macOS dock badge and sidebar unread indicators so they accurately track per-session unread state: opening a session marks it read, the workspace stays flagged while any of its sessions is still unread, and sessions waiting on a prompt only clear once the interaction is completed.

- [#169](https://github.com/dohooo/helmor/pull/169) [`4ef8640`](https://github.com/dohooo/helmor/commit/4ef8640873e5b8ee80b60eadf016080aab2899be) Thanks [@natllian](https://github.com/natllian)! - Fix the streaming loading/timer footer so it stays below the live assistant output while long tool groups expand, and add a regression test for the overlap case.

## 0.3.0

### Minor Changes

- [#159](https://github.com/dohooo/helmor/pull/159) [`fd8f6cb`](https://github.com/dohooo/helmor/commit/fd8f6cb696bcccd31f8397353370227a1236a802) Thanks [@natllian](https://github.com/natllian)! - Add repo-level AI prompt preferences with markdown preview so each repository can customize create-PR, fix-errors, conflict-resolution, branch-naming, and first-chat instructions.

### Patch Changes

- [#157](https://github.com/dohooo/helmor/pull/157) [`e46889e`](https://github.com/dohooo/helmor/commit/e46889e8f4849c79cee666311dcdbbd8a1e30319) Thanks [@natllian](https://github.com/natllian)! - Keep the inspector's Setup/Run hover-zoom expanded until the pointer actually leaves the zoomed panel, and stop triggering blur pulses when no zoom animation is happening.

- [#160](https://github.com/dohooo/helmor/pull/160) [`adc9c1a`](https://github.com/dohooo/helmor/commit/adc9c1a99dd02a8d057e2a207d1170fc4973049c) Thanks [@natllian](https://github.com/natllian)! - Fix an intermittent flicker where the Chinese IME candidate popup briefly went blank for a frame before closing when switching from a Chinese IME to English mid-composition.

## 0.2.1

### Patch Changes

- [#152](https://github.com/dohooo/helmor/pull/152) [`405c634`](https://github.com/dohooo/helmor/commit/405c6342f79501e1b577d8cdf1ff32d8779ee5a0) Thanks [@natllian](https://github.com/natllian)! - Fix the sidebar workspace row so the green status dot on the avatar no longer gets clipped when you hover the row.

- [#153](https://github.com/dohooo/helmor/pull/153) [`b05d39f`](https://github.com/dohooo/helmor/commit/b05d39f13e01117e7f5dd1ce726bb6176d46ed8b) Thanks [@natllian](https://github.com/natllian)! - Tighten the scripts terminal hover-zoom so it only engages when there's real output to read:
  - The Setup/Run tab header no longer triggers the zoom, so moving the cursor between tabs or to the collapse chevron keeps the panel at its resting size.
  - The empty placeholder states (no script configured, or script configured but not yet run) no longer trigger the zoom — it now only engages once a script has actually produced terminal output.
  - The Stop/Rerun button in the bottom-right corner only appears once the panel has enlarged, so it's no longer clipped and unclickable at the resting size.

## 0.2.0

### Minor Changes

- [#150](https://github.com/dohooo/helmor/pull/150) [`c1116d9`](https://github.com/dohooo/helmor/commit/c1116d93f34dde536daf6f3621819293260d8f34) Thanks [@natllian](https://github.com/natllian)! - Add `/add-dir` to link extra directories into a workspace so agents can read and edit them alongside the main worktree. Linked directories persist per workspace and appear as chips in a new "context" strip inside the composer, above the input.

  - Picker: selecting `/add-dir` inserts a purple pill into the editor and opens a cmdk popup above the composer. The popup suggests every ready workspace across all repos and a "Browse folder…" escape hatch. Type after the pill to filter, Enter to pick, Backspace once to exit.
  - Context bar: chips show each linked directory's name + branch, hover tooltip reveals the full path. Tab / ←/→ / Home / End navigate; Backspace or Delete removes with a collapse animation; Escape blurs.
  - Claude: paths are merged with the workspace's git worktree metadata directories and sent as `additionalDirectories`.
  - Codex: in plan mode the current cwd plus linked paths become `sandboxPolicy.writableRoots` so edits outside cwd aren't rejected.

- [#148](https://github.com/dohooo/helmor/pull/148) [`1e0d07b`](https://github.com/dohooo/helmor/commit/1e0d07b229d50f563eb6d4b2015348341a3cd50b) Thanks [@natllian](https://github.com/natllian)! - Add a mid-turn Steer button to the composer — type a new instruction while the agent is still streaming and click Steer to inject it into the running turn without stopping; works on both Claude and Codex.

- [#137](https://github.com/dohooo/helmor/pull/137) [`d8ed77b`](https://github.com/dohooo/helmor/commit/d8ed77bd9c4a28b483b6222387136ef970c9b172) Thanks [@dohooo](https://github.com/dohooo)! - The macOS Dock icon now shows a red badge with the total number of sessions that have unread activity across your workspaces, clearing as you open each workspace.

- [#125](https://github.com/dohooo/helmor/pull/125) [`fcad25d`](https://github.com/dohooo/helmor/commit/fcad25d4c43b196eb8797aa86235b0d9d6080ea6) Thanks [@dohooo](https://github.com/dohooo)! - Make the Run and Setup inspector terminals behave like a real interactive terminal:

  - Fix the Stop button so it actually terminates the running script — it was previously a silent no-op that left the process running until it completed on its own.
  - Accept keyboard input in the terminal so Ctrl+C now interrupts the foreground process, and interactive tools can prompt you for input the way they would in a normal shell.
  - Propagate inspector panel resizes to the script's PTY so vim, htop, and other full-screen tools re-layout correctly when you change the panel size.

- [#118](https://github.com/dohooo/helmor/pull/118) [`a25c2a8`](https://github.com/dohooo/helmor/commit/a25c2a8b2c0d1734dfa9d11c9135607f3b1215fb) Thanks [@dohooo](https://github.com/dohooo)! - Add a one-click shortcut to open your running dev server from the Run panel:

  - While the Run script is active, a new "Open" button in the Run tab header auto-detects localhost URLs printed by frameworks like Vite and Next.js, showing `Open:PORT` for a single service or a hover picker when the script exposes multiple at once.

- [#136](https://github.com/dohooo/helmor/pull/136) [`469a53f`](https://github.com/dohooo/helmor/commit/469a53fc61d196019fad51e4c5b683ce014e70c5) Thanks [@natllian](https://github.com/natllian)! - Stable part IDs across the streaming pipeline — thinking blocks no longer auto-collapse at block boundaries:

  - Every message part (Text, Reasoning, Image, TodoList, etc.) now carries a stable `id` minted at first sight and preserved through streaming deltas, turn commit, DB persistence, and historical reload. React keys use this id instead of array position, eliminating remounts caused by pipeline reordering (collapse grouping, tool-call folding, message merging).
  - Message-level IDs are pre-assigned as DB UUIDs at turn start instead of using temporary `stream-partial:N` identifiers that flip to a different UUID on commit. The entire `sync_persisted_ids` / `sync_result_id` post-hoc reconciliation machinery is removed.
  - Collapsed read-only tool groups now default to expanded and stop their loading spinner as soon as the last tool returns a result, instead of spinning until the overall message stream ends.
  - Subagent status labels (Subagent started / completed) no longer line-break on narrow viewports.

- [#126](https://github.com/dohooo/helmor/pull/126) [`967ae3d`](https://github.com/dohooo/helmor/commit/967ae3d21ff25444b45b6e3c5c74c2efc0249cd0) Thanks [@dohooo](https://github.com/dohooo)! - Unify inline tags across the composer and sent messages, and let you preview their contents on hover:
  - Every @-file, image, and pasted-text tag now renders with the same size, padding, and baseline alignment whether you are still typing or looking at a past message.
  - Hovering a file tag opens a popover with the file's contents — syntax-highlighted for code — and shows a clear notice for files that are too large or cannot be read.
  - Image tags in sent messages now open the preview directly in a hover popover, replacing the old click-to-open fullscreen overlay.

### Patch Changes

- [#124](https://github.com/dohooo/helmor/pull/124) [`1aa8bfd`](https://github.com/dohooo/helmor/commit/1aa8bfdf24a3555f53008a40761ed927d3bdf569) Thanks [@dohooo](https://github.com/dohooo)! - Fix a visual alignment issue in the Git Actions header:

  - The colored Actions button now sits flush with the PR number button next to it, fixing a small vertical offset.

- [#111](https://github.com/dohooo/helmor/pull/111) [`ed5f351`](https://github.com/dohooo/helmor/commit/ed5f3516c0d0067ce0da9cd93ecbf2fdfb18a4cf) Thanks [@natllian](https://github.com/natllian)! - Make the file diff viewer follow the app theme:

  - Opening a file from the diff tree now renders the Monaco editor and its surrounding chrome in the app's light or dark theme, instead of always using the dark theme.

- [#144](https://github.com/dohooo/helmor/pull/144) [`cf769f0`](https://github.com/dohooo/helmor/commit/cf769f02c2c5d9af3bf3085ee2b2c2c71ae707bc) Thanks [@natllian](https://github.com/natllian)! - Speed up and stabilize archiving workspaces in batches:

  - Archiving runs in parallel instead of serially, and worktree removal returns immediately by renaming the directory into a sibling trash folder that gets cleaned up in the background — archiving 8 workspaces at once now takes under a second instead of ~90 seconds.
  - The archived list no longer reorders itself while a batch of optimistic archives is settling into server data; items stay in click order until reconciliation is complete.
  - Archived workspace directories no longer get resurrected as empty `node_modules/.bun` stubs when a stale slash-command prewarm fires for a workspace that was just archived.

- [#117](https://github.com/dohooo/helmor/pull/117) [`9098a17`](https://github.com/dohooo/helmor/commit/9098a1781be5c2c59f7c8b836d86d44f8cb8b2c2) Thanks [@dohooo](https://github.com/dohooo)! - Fix the Conductor-to-Helmor workspace migration by rewriting `$CONDUCTOR_*` environment variable references in `helmor.json` to their `$HELMOR_*` equivalents, so Cmd+R no longer fails with `exit 127` on freshly migrated or partially-migrated workspaces.

- [#140](https://github.com/dohooo/helmor/pull/140) [`7a68ca6`](https://github.com/dohooo/helmor/commit/7a68ca68ab7bfbc52f7d70cc705be3aa6828ee78) Thanks [@natllian](https://github.com/natllian)! - Fix the default model setting being silently overwritten on app restart:

  - The startup model-validation hook no longer replaces a user-saved default model when the model catalog is still partially loaded or when the saved model belongs to a provider that hasn't responded yet.

- [#145](https://github.com/dohooo/helmor/pull/145) [`83e57da`](https://github.com/dohooo/helmor/commit/83e57da35211c74321643e30a82b41ce5241b32c) Thanks [@natllian](https://github.com/natllian)! - Fix the slash-command popup to stop showing a "Loading more commands…" banner that could linger indefinitely once commands were already visible.

- [#127](https://github.com/dohooo/helmor/pull/127) [`cdf3e17`](https://github.com/dohooo/helmor/commit/cdf3e170824678f1e23bcf5ac08a0e98334bbc54) Thanks [@dohooo](https://github.com/dohooo)! - Fix the composer's slash-command and @-mention popup:

  - Hug the top edge of the input with an 8px gap instead of being clipped behind the composer's rim.
  - Stay above chat messages and code blocks instead of rendering underneath them.
  - Confirm the highlighted option when you press Enter — no more accidentally sending the message while you were picking a command or file.

- [#147](https://github.com/dohooo/helmor/pull/147) [`1b83649`](https://github.com/dohooo/helmor/commit/1b8364902540f9e7af9262c7e9f9d0670f94bf43) Thanks [@natllian](https://github.com/natllian)! - Keep streamed thinking blocks expanded through completion and show a "Thought for Ns" label once reasoning finishes instead of falling back to a collapsed generic "Thinking" state.

- [#120](https://github.com/dohooo/helmor/pull/120) [`348fbba`](https://github.com/dohooo/helmor/commit/348fbba306c91b351b9f454c5af7b2ef27cc7464) Thanks [@natllian](https://github.com/natllian)! - Restore visible reasoning content for Claude Opus 4.7:

  - Opus 4.7 shipped with a new SDK default that hid thinking text from both streaming and the finalized response, leaving the reasoning block empty and DB rows with no text. Helmor now opts back into summarized thinking so the progress is visible during the turn and the full text is persisted with the message.

- [#110](https://github.com/dohooo/helmor/pull/110) [`44944af`](https://github.com/dohooo/helmor/commit/44944afe4f538cbfac40e0cfbb4821a3d0a8a4db) Thanks [@natllian](https://github.com/natllian)! - Make "Open workspace in …" more useful across the board:

  - Expand supported editors, terminals, and Git GUIs to 30 apps (Cursor, VS Code, Windsurf, Zed, the JetBrains suite, Xcode, Android Studio, Sublime Text, MacVim, Neovide, GNU Emacs, iTerm2, Ghostty, Alacritty, WezTerm, Warp, Hyper, Tower, Sourcetree, GitKraken, and more), detect apps installed in non-standard locations via Spotlight, show real brand logos, and surface the button instantly on launch without waiting for detection.

- [#130](https://github.com/dohooo/helmor/pull/130) [`f9d9ca1`](https://github.com/dohooo/helmor/commit/f9d9ca18e74420599e7611689edebe0df787b205) Thanks [@natllian](https://github.com/natllian)! - Replace date-based log rotation with a bounded single-file ring:

  - Both the Rust host and the sidecar now write to `rust.jsonl` / `sidecar.jsonl` with a `.1` backup that is overwritten on rotation, capping each component's log footprint at ~20 MB instead of accumulating a week of daily files.
  - Removes the background cleanup thread and the `tracing-appender` / `flate2` dependencies; no more gzip pass, no UTC/local date races.

- [#128](https://github.com/dohooo/helmor/pull/128) [`407d0c1`](https://github.com/dohooo/helmor/commit/407d0c1a30d86bc444f1aa1890d63c0b5ecf8245) Thanks [@dohooo](https://github.com/dohooo)! - Show a small status icon next to the Setup and Run tabs in the inspector so you can see each script's state — unconfigured, idle, currently running (animated Helmor logo), succeeded, or failed — without opening the tab.

- [#139](https://github.com/dohooo/helmor/pull/139) [`9e4d5e0`](https://github.com/dohooo/helmor/commit/9e4d5e0b1b886d0375030d449624984394a12b65) Thanks [@natllian](https://github.com/natllian)! - Fix sidebar flicker when switching workspace status:

  - Changing status (e.g. backlog → in progress) no longer causes a visible flash. The sidebar now waits for the backend to confirm the change before refreshing, instead of doing an optimistic update that gets immediately overwritten by a cache refetch.

- [#113](https://github.com/dohooo/helmor/pull/113) [`3e86bce`](https://github.com/dohooo/helmor/commit/3e86bcefb2acb1230fff7dfbd19ad8ea5e5b9952) Thanks [@dohooo](https://github.com/dohooo)! - Show a chat-style unread dot on the top-right of the workspace avatar whenever a workspace has unread activity, not just when a session just finished.

- [#134](https://github.com/dohooo/helmor/pull/134) [`ac2abbb`](https://github.com/dohooo/helmor/commit/ac2abbba8d62d7d4394a7775d07e561127ed4313) Thanks [@dohooo](https://github.com/dohooo)! - Unify the permission-approval, deferred-tool approval, and MCP elicitation panels behind one consistent look:

  - Bash command approvals now render with syntax highlighting instead of a raw JSON dump.
  - Multi-step question and elicitation forms get tabs at the top, dimming unanswered steps and marking required fields with `*`.
  - Headers, buttons, inputs, and option rows across all three panels now share the same shadcn-style layout, spacing, and button set.

- [#114](https://github.com/dohooo/helmor/pull/114) [`cf53c37`](https://github.com/dohooo/helmor/commit/cf53c37189b3e2822b3a9c494f8bffd558d48bb7) Thanks [@natllian](https://github.com/natllian)! - Make the Default model setting the single source of truth:

  - The Settings panel now shows a real default instead of "Select model" on first launch, and new chats always use whatever is configured there.

- [#121](https://github.com/dohooo/helmor/pull/121) [`2ac2bf5`](https://github.com/dohooo/helmor/commit/2ac2bf55fd3d06f1be88f3691dba2f07e6b6645a) Thanks [@dohooo](https://github.com/dohooo)! - Match the loading spinner next to batched tool groups (e.g. "Reading 2 files…") to the muted gray used for individual streaming tool calls, so every in-flight indicator in a chat message shares the same color.

- [#115](https://github.com/dohooo/helmor/pull/115) [`f87bfc5`](https://github.com/dohooo/helmor/commit/f87bfc56c288ec293259396a4e48c4adea7ae4bf) Thanks [@dohooo](https://github.com/dohooo)! - Show workspace titles in full in the sidebar:
  - Workspace rows no longer reserve space for the archive button, so long titles are now visible in full instead of being truncated early.
  - Archive, restore, and delete buttons appear on hover and overlay the right end of the row, with the underlying title fading out behind them.

## 0.1.6

### Patch Changes

- [`13e31d6`](https://github.com/dohooo/helmor/commit/13e31d684c3f8b54b2b828ffb441e3be6c2c36dd) Thanks [@natllian](https://github.com/natllian)! - Fix resuming a Claude conversation sometimes failing with "No conversation found".

## 0.1.5

### Patch Changes

- [`fdfbab4`](https://github.com/dohooo/helmor/commit/fdfbab4d5703d1d349f73067555d4c2205d8c1e1) Thanks [@claude](https://github.com/claude)! - Fix the missing change-log link in the app update flow:
  - The "View change log" button now appears in the update-ready toast and in Settings → App Updates, opening the matching GitHub release page.

## 0.1.4

### Patch Changes

- [`dd53716`](https://github.com/dohooo/helmor/commit/dd537165c122e19721dc28064a60f0771a263662) Thanks [@claude](https://github.com/claude)! - - Fix the caret jumping to the start of the paragraph right after a Chinese IME buffer got stripped of its segmentation spaces — the caret now stays at the end of what you just typed.

## 0.1.3

### Patch Changes

- [#94](https://github.com/dohooo/helmor/pull/94) [`0ec4401`](https://github.com/dohooo/helmor/commit/0ec4401ef86172b73cf8498dc4960f073944bfa0) Thanks [@dohooo](https://github.com/dohooo)! - - Fix Chinese / Japanese / Korean IME pressing Enter to confirm a candidate accidentally sending the message.
  - Fix Chinese IME segmentation spaces leaking into the composer when switching input method mid-composition (e.g. typing `helmor` no longer becomes `he lmor`).

## 0.1.2

### Patch Changes

- [#91](https://github.com/dohooo/helmor/pull/91) [`8567d35`](https://github.com/dohooo/helmor/commit/8567d355d2be84fdeea68436c18be31fcd76ef0c) Thanks [@natllian](https://github.com/natllian)! - - Fix the empty model list in signed/notarized macOS release builds.

## 0.1.1

### Patch Changes

- [#89](https://github.com/dohooo/helmor/pull/89) [`e3fc20f`](https://github.com/dohooo/helmor/commit/e3fc20f4451a65c2d9d067c39b9233367d07bdd1) Thanks [@natllian](https://github.com/natllian)!
  - Fix new workspaces occasionally creating a duplicate session on first open.
  - Stop reshuffling the sidebar optimistically when you change a session's status manually.

All notable changes to Helmor will be documented in this file.

## 0.1.0

Hello Helmor.
