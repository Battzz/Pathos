import { describe, expect, it } from "vitest";
import { buildCommitButtonPrompt } from "./commit-button-prompts";

describe("buildCommitButtonPrompt", () => {
	it("appends create-pr preferences after the built-in prompt", () => {
		expect(
			buildCommitButtonPrompt("create-pr", {
				createPr: "Always include rollout notes.",
			}),
		).toContain("### User Preferences\n\nAlways include rollout notes.");
	});

	it("appends fix-errors preferences after the built-in prompt", () => {
		expect(
			buildCommitButtonPrompt("fix", {
				fixErrors: "Run targeted tests before broad suites.",
			}),
		).toContain(
			"### User Preferences\n\nRun targeted tests before broad suites.",
		);
	});
});
