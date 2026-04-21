import { describe, expect, it } from "vitest";
import type { WorkspaceGroup } from "./api";
import {
	buildWorkspaceGroupsForDisplay,
	hasWorkspaceLocalActivity,
	shouldDisplayWorkspaceAsInProgress,
} from "./workspace-display-state";

describe("hasWorkspaceLocalActivity", () => {
	it("returns true when uncommitted changes exist", () => {
		expect(
			hasWorkspaceLocalActivity({
				uncommittedCount: 1,
				conflictCount: 0,
				syncTargetBranch: null,
				syncStatus: "unknown",
				behindTargetCount: 0,
				remoteTrackingRef: null,
				aheadOfRemoteCount: 0,
				pushStatus: "unknown",
			}),
		).toBe(true);
	});

	it("returns true when local commits exist without a published PR", () => {
		expect(
			hasWorkspaceLocalActivity({
				uncommittedCount: 0,
				conflictCount: 0,
				syncTargetBranch: null,
				syncStatus: "unknown",
				behindTargetCount: 0,
				remoteTrackingRef: null,
				aheadOfRemoteCount: 1,
				pushStatus: "unknown",
			}),
		).toBe(true);
		expect(
			hasWorkspaceLocalActivity({
				uncommittedCount: 0,
				conflictCount: 0,
				syncTargetBranch: null,
				syncStatus: "unknown",
				behindTargetCount: 0,
				remoteTrackingRef: null,
				aheadOfRemoteCount: 0,
				pushStatus: "unpublished",
			}),
		).toBe(true);
	});
});

describe("shouldDisplayWorkspaceAsInProgress", () => {
	it("returns true for done + merged + local activity", () => {
		expect(
			shouldDisplayWorkspaceAsInProgress({
				manualStatus: "done",
				prInfo: { state: "MERGED", isMerged: true },
				gitActionStatus: {
					uncommittedCount: 1,
					conflictCount: 0,
					syncTargetBranch: null,
					syncStatus: "unknown",
					behindTargetCount: 0,
					remoteTrackingRef: null,
					aheadOfRemoteCount: 0,
					pushStatus: "unknown",
				},
			}),
		).toBe(true);
	});

	it("returns false for review workspaces", () => {
		expect(
			shouldDisplayWorkspaceAsInProgress({
				manualStatus: "review",
				prInfo: { state: "OPEN", isMerged: false },
				gitActionStatus: {
					uncommittedCount: 1,
					conflictCount: 0,
					syncTargetBranch: null,
					syncStatus: "unknown",
					behindTargetCount: 0,
					remoteTrackingRef: null,
					aheadOfRemoteCount: 0,
					pushStatus: "unknown",
				},
			}),
		).toBe(false);
	});
});

describe("buildWorkspaceGroupsForDisplay", () => {
	it("moves the selected row from done to progress for display only", () => {
		const groups: WorkspaceGroup[] = [
			{
				id: "done",
				label: "Done",
				tone: "done",
				rows: [
					{
						id: "w1",
						title: "Workspace 1",
						manualStatus: "done",
						derivedStatus: "done",
					},
				],
			},
			{
				id: "progress",
				label: "In progress",
				tone: "progress",
				rows: [],
			},
		];

		const next = buildWorkspaceGroupsForDisplay({
			groups,
			selectedWorkspaceId: "w1",
			shouldDisplaySelectedWorkspaceAsInProgress: true,
		});

		expect(next.find((group) => group.id === "done")?.rows).toEqual([]);
		expect(
			next.find((group) => group.id === "progress")?.rows[0],
		).toMatchObject({
			id: "w1",
			manualStatus: "in-progress",
		});
	});
});
