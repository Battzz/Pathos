# Changelog

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
