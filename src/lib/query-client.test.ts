import { describe, expect, it } from "vitest";
import type {
	PullRequestInfo,
	WorkspacePrActionItem,
	WorkspacePrActionStatus,
} from "./api";
import {
	helmorQueryKeys,
	prActionStatusRefetchInterval,
	prRefetchInterval,
} from "./query-client";

describe("helmorQueryKeys.slashCommands", () => {
	it("ignores model id for claude keys", () => {
		expect(
			helmorQueryKeys.slashCommands("claude", "/tmp/workspace", "default"),
		).toEqual(
			helmorQueryKeys.slashCommands("claude", "/tmp/workspace", "opus-1m"),
		);
	});

	it("ignores model id for codex keys", () => {
		expect(
			helmorQueryKeys.slashCommands("codex", "/tmp/workspace", "gpt-5.4"),
		).toEqual(
			helmorQueryKeys.slashCommands("codex", "/tmp/workspace", "gpt-5"),
		);
	});
});

const OPEN_PR: PullRequestInfo = {
	url: "https://github.com/acme/repo/pull/1",
	number: 1,
	state: "OPEN",
	title: "feat: thing",
	isMerged: false,
};

const MERGED_PR: PullRequestInfo = {
	...OPEN_PR,
	state: "MERGED",
	isMerged: true,
};

const CLOSED_PR: PullRequestInfo = {
	...OPEN_PR,
	state: "CLOSED",
	isMerged: false,
};

function action(
	status: WorkspacePrActionItem["status"],
	overrides: Partial<WorkspacePrActionItem> = {},
): WorkspacePrActionItem {
	return {
		id: overrides.id ?? "a1",
		name: overrides.name ?? "CI",
		provider: overrides.provider ?? "github",
		status,
		...overrides,
	};
}

function actionStatus(
	overrides: Partial<WorkspacePrActionStatus> = {},
): WorkspacePrActionStatus {
	return {
		pr: OPEN_PR,
		reviewDecision: null,
		mergeable: "MERGEABLE",
		deployments: [],
		checks: [],
		remoteState: "ok",
		...overrides,
	};
}

describe("prRefetchInterval", () => {
	it("polls every 60s when data is absent", () => {
		expect(prRefetchInterval(undefined)).toBe(60_000);
		expect(prRefetchInterval(null)).toBe(60_000);
	});

	it("polls every 60s for OPEN PRs", () => {
		expect(prRefetchInterval(OPEN_PR)).toBe(60_000);
	});

	it("slows to 5min for MERGED PRs", () => {
		expect(prRefetchInterval(MERGED_PR)).toBe(300_000);
	});

	it("slows to 5min when isMerged flag is set but state lags", () => {
		expect(prRefetchInterval({ ...OPEN_PR, isMerged: true })).toBe(300_000);
	});

	it("slows to 5min for CLOSED PRs", () => {
		expect(prRefetchInterval(CLOSED_PR)).toBe(300_000);
	});
});

describe("prActionStatusRefetchInterval", () => {
	it("polls every 60s when data is absent", () => {
		expect(prActionStatusRefetchInterval(undefined)).toBe(60_000);
	});

	it("keeps 60s probing when remoteState is noPr / unavailable / error", () => {
		for (const remoteState of ["noPr", "unavailable", "error"] as const) {
			expect(prActionStatusRefetchInterval(actionStatus({ remoteState }))).toBe(
				60_000,
			);
		}
	});

	it("stops polling once the PR is MERGED", () => {
		expect(prActionStatusRefetchInterval(actionStatus({ pr: MERGED_PR }))).toBe(
			false,
		);
	});

	it("stops polling once the PR is CLOSED", () => {
		expect(prActionStatusRefetchInterval(actionStatus({ pr: CLOSED_PR }))).toBe(
			false,
		);
	});

	it("stops polling when isMerged flag is set even if state lags", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ pr: { ...OPEN_PR, isMerged: true } }),
			),
		).toBe(false);
	});

	it("polls every 5s while mergeability is UNKNOWN", () => {
		expect(
			prActionStatusRefetchInterval(actionStatus({ mergeable: "UNKNOWN" })),
		).toBe(5_000);
	});

	it("prefers the terminal tier over UNKNOWN mergeable (MERGED wins)", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ pr: MERGED_PR, mergeable: "UNKNOWN" }),
			),
		).toBe(false);
	});

	it("polls every 15s when a check is running", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ checks: [action("running")] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a check is pending", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ checks: [action("pending")] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a deployment is running", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ deployments: [action("running", { id: "d1" })] }),
			),
		).toBe(15_000);
	});

	it("polls every 15s when a deployment is pending", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({ deployments: [action("pending", { id: "d1" })] }),
			),
		).toBe(15_000);
	});

	it("polls every 60s when every check and deployment is settled", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({
					checks: [action("success"), action("failure", { id: "c2" })],
					deployments: [action("success", { id: "d1" })],
				}),
			),
		).toBe(60_000);
	});

	it("prefers UNKNOWN mergeable over running checks (5s beats 15s)", () => {
		expect(
			prActionStatusRefetchInterval(
				actionStatus({
					mergeable: "UNKNOWN",
					checks: [action("running")],
				}),
			),
		).toBe(5_000);
	});
});
