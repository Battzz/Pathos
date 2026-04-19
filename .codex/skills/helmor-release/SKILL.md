---
name: helmor-release
description: Prepare Helmor releases by inspecting the current branch, drafting a complete user-facing Changesets entry first (bump + summary + bullets), writing it to `.changeset/`, and then showing the user the result with a short menu of adjustments they can pick from. Use when the user wants to cut a release, write a changeset, decide patch/minor/major, draft GitHub release notes, or summarize branch changes into release-ready language.
---

# Helmor Release

Use this skill to turn a branch's real changes into a clean `.changeset/*.md` entry for Helmor.

## Workflow

1. Inspect the branch before asking the user anything.
2. Run `scripts/collect_release_context.py` to gather:
   - commits since the base branch
   - changed files grouped by area
   - a short suggested summary
3. Draft the full changeset yourself, without asking the user upfront. Decide:
   - the bump (`patch` / `minor` / `major`) using the Versioning Guidance below
   - the prose summary line
   - the bullet list of user-visible changes

   Prefer a conservative bump (`patch` unless there is a clear new user-visible capability). If you genuinely cannot decide the bump from the diff alone, default to `patch` and flag it in the confirmation step.
4. Write the changeset to a single file under `.changeset/` right away. Do not wait for approval before creating the file — the user will adjust from a real draft, not a hypothetical one.
5. Then, and only then, show the user what you created and offer the adjustment menu described in "Confirmation Style".

## Confirmation Style

Do not ask the user anything before the draft is written. Once the changeset file exists, report what you created and offer a short menu of adjustments.

Preferred pattern:

1. State the file path you created.
2. Echo back the chosen bump, the summary line, and the bullets in a compact block.
3. Present a numbered menu of the things the user might want to change. The user picks any subset (e.g. "1 and 3") or says nothing / "looks good" to accept. Never phrase this as an open question like "do you approve?".

Example:

```text
I've written .changeset/brave-otters-smile.md:

  bump:    minor
  summary: Ship a round of release and auto-update improvements:
  bullets:
    - Add in-app update checks that download updates in the background ...
    - Add a signed and notarized macOS release pipeline ...
    - Add release planning automation ...

If you want to adjust anything, tell me which:
  1. Version bump (currently: minor — say "make it patch" / "make it major")
  2. Summary line
  3. The bullet list (add / remove / rewrite specific items)
  4. Add a thanks/credits line

Otherwise we're done — no reply needed.
```

If structured choice tools are unavailable, present the menu in plain text and let the user reply naturally.

## Changeset Rules

Write changesets for users, not for maintainers.

Do:

- explain what changed from the user's point of view
- always open the body with a prose summary line (no leading `- `), then enumerate concrete changes as `- ` sub-items underneath
- keep bullets concrete and outcome-focused
- mention new workflows or capabilities
- include a short thanks line only if the user explicitly wants credits

Do not:

- dump commit messages verbatim
- list internal refactors unless they changed release behavior
- mention implementation-only details like exact file names
- create multiple changesets for one coordinated release task unless the user asks
- start the changeset body with a `- ` bullet, or skip the summary line and go straight to bullets (see format rule below)

## Default Changeset Format

Every changeset body has **two parts**:

1. A prose **summary line** that sets the release theme at a glance, written with no leading `- `.
2. One or more **bullet sub-items** underneath (each starting with `- `) that enumerate concrete user-visible changes.

Both parts are required, even when there is only one underlying change — the summary gives the CHANGELOG reader context; the bullets carry the outcomes.

`@changesets/changelog-github` inlines the first line of the body after `Thanks @user! -` when rendering `CHANGELOG.md` / GitHub Release. If the first line is itself a bullet (`- Fix X`), the output becomes `! - - Fix X` with the first item glued to the attribution. **Never start the body with `- `**, and never submit a changeset whose body is a single sentence with no bullets — always give readers a summary + at least one bullet.

### Single-change example

Summary line describes the area; one bullet captures the specific outcome:

```md
---
"helmor": patch
---

Fix a Chinese IME regression in the composer:
- Pressing Enter to confirm an IME candidate no longer accidentally sends the message.
```

### Multi-change example

First line is a prose summary ending with `:`. Bullets start from the next line:

```md
---
"helmor": minor
---

Ship a round of release and auto-update improvements:
- Add in-app update checks that download updates in the background and prompt once the update is ready to install.
- Add a signed and notarized macOS release pipeline for GitHub Releases.
- Add release planning automation so Helmor can publish user-facing release notes through Changesets.
```

This renders cleanly as:

```md
- [#NN] [`hash`] Thanks @user! - Ship a round of release and auto-update improvements:
  - Add in-app update checks ...
  - Add a signed and notarized macOS release pipeline ...
  - Add release planning automation ...
```

If the user wants credits, append a final bullet such as:

```md
- Thanks @username for helping validate the release flow.
```

## GitHub Release Notes

Helmor already uses `@changesets/changelog-github` in `.changeset/config.json`.

That means:

- merged PRs and GitHub context are handled by Changesets
- GitHub Release body is derived from `CHANGELOG.md`
- this skill should focus on writing a strong user-facing changeset body

Do not invent a separate release-note format unless the user asks for one.

## Versioning Guidance

Recommend:

- `patch` for fixes, polish, and invisible release improvements
- `minor` for new user-visible features or workflows
- `major` only when behavior changes incompatibly

For Helmor's current early lifecycle, prefer `patch` or `minor`. Escalate to `major` only with a concrete breaking change.

## Resources

- Use `scripts/collect_release_context.py` to inspect the current branch before drafting the changeset.
- Use `references/release-format.md` if you need the exact Helmor release flow or writing guidance.
