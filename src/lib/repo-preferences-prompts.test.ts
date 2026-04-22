import { describe, expect, it } from "vitest";
import {
	prependGeneralPreferencePrompt,
	resolveRepoPreferencePreview,
	resolveRepoPreferencePrompt,
} from "./repo-preferences-prompts";

describe("repo preference prompts", () => {
	const targetRefPlaceholder = "$" + "{TARGET_REF}";
	const dirtyWorktreePlaceholder = "$" + "{DIRTY_WORKTREE}";

	it("leaves the general preview empty when no override exists", () => {
		expect(resolveRepoPreferencePreview("general", {})).toBe("");
	});

	it("appends the override after the built-in prompt", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "createPr",
				repoPreferences: { createPr: "Ship it exactly this way." },
			}),
		).toBe(
			"Create a pull request for the uncommitted work in this workspace.\n\nDo the following, in order:\n1. Run `git status` and `git diff` to survey what's changed.\n2. Stage everything that should ship with `git add`.\n3. Commit with a concise, Conventional-Commits-style message (`feat:`, `fix:`, `refactor:`, `chore:`, etc.) that summarizes the change in one line.\n4. Push the current branch to its remote. If needed, create the remote tracking branch with `git push -u <remote> HEAD`.\n5. Open a pull request against the repository's default branch using `gh pr create`. Use a clear PR title and a body that explains: what changed, why it changed, and any follow-up / test notes.\n6. Report the PR URL in your final message so I can click it.\n\nDon't stop to ask for confirmation — execute each step automatically. If you hit an unrecoverable error (e.g. merge conflict, pre-push hook failure), report it clearly so I can intervene.\n\nIMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.\n\n### User Preferences\n\nShip it exactly this way.",
		);
	});

	it("renders the dynamic resolve-conflicts fallback", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {},
				targetRef: "origin/main",
				dirtyWorktree: true,
			}),
		).toBe(
			"Commit uncommitted changes, then merge origin/main into this branch. Then push.",
		);
	});

	it("prepends the general prompt to the first user message", () => {
		expect(
			prependGeneralPreferencePrompt("Fix the failing tests.", {
				general: "Always explain the root cause first.",
			}),
		).toBe(
			"IMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.\n\n### User Preferences\n\nAlways explain the root cause first.\n\nUser request:\nFix the failing tests.",
		);
	});

	it("appends resolve-conflicts overrides after the dynamic fallback", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "resolveConflicts",
				repoPreferences: {
					resolveConflicts: `Prefer rebase when possible. Target: ${targetRefPlaceholder}. Dirty: ${dirtyWorktreePlaceholder}.`,
				},
				targetRef: "origin/main",
				dirtyWorktree: true,
			}),
		).toBe(
			"Commit uncommitted changes, then merge origin/main into this branch. Then push.\n\nIMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.\n\n### User Preferences\n\nPrefer rebase when possible. Target: origin/main. Dirty: true.",
		);
	});

	it("leaves the first user message unchanged when general is empty", () => {
		expect(prependGeneralPreferencePrompt("Fix the failing tests.", {})).toBe(
			"Fix the failing tests.",
		);
	});
});
