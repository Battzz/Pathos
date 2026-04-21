import { describe, expect, it } from "vitest";
import {
	prependGeneralPreferencePrompt,
	resolveRepoPreferencePreview,
	resolveRepoPreferencePrompt,
} from "./repo-preferences-prompts";

describe("repo preference prompts", () => {
	it("leaves the general preview empty when no override exists", () => {
		expect(resolveRepoPreferencePreview("general", {})).toBe("");
	});

	it("uses the override instead of the built-in prompt", () => {
		expect(
			resolveRepoPreferencePrompt({
				key: "createPr",
				repoPreferences: { createPr: "Ship it exactly this way." },
			}),
		).toBe("Ship it exactly this way.");
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
			"Always explain the root cause first.\n\nUser request:\nFix the failing tests.",
		);
	});

	it("leaves the first user message unchanged when general is empty", () => {
		expect(prependGeneralPreferencePrompt("Fix the failing tests.", {})).toBe(
			"Fix the failing tests.",
		);
	});
});
