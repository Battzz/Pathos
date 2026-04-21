import type {
	PullRequestInfo,
	WorkspaceGitActionStatus,
	WorkspaceGroup,
	WorkspaceRow,
} from "./api";

export function hasWorkspaceLocalActivity(
	gitActionStatus?: WorkspaceGitActionStatus | null,
): boolean {
	if (!gitActionStatus) return false;
	return (
		gitActionStatus.uncommittedCount > 0 ||
		gitActionStatus.conflictCount > 0 ||
		gitActionStatus.aheadOfRemoteCount > 0 ||
		gitActionStatus.pushStatus === "unpublished"
	);
}

export function shouldDisplayWorkspaceAsInProgress({
	manualStatus,
	derivedStatus,
	prInfo,
	gitActionStatus,
}: {
	manualStatus?: string | null;
	derivedStatus?: string | null;
	prInfo?: Pick<PullRequestInfo, "state" | "isMerged"> | null;
	gitActionStatus?: WorkspaceGitActionStatus | null;
}): boolean {
	const effectiveStatus = (manualStatus ?? derivedStatus ?? "")
		.trim()
		.toLowerCase();
	if (effectiveStatus !== "done") return false;
	if (!(prInfo?.isMerged || prInfo?.state === "MERGED")) return false;
	return hasWorkspaceLocalActivity(gitActionStatus);
}

export function buildWorkspaceGroupsForDisplay({
	groups,
	selectedWorkspaceId,
	shouldDisplaySelectedWorkspaceAsInProgress,
}: {
	groups: WorkspaceGroup[];
	selectedWorkspaceId: string | null;
	shouldDisplaySelectedWorkspaceAsInProgress: boolean;
}): WorkspaceGroup[] {
	if (!selectedWorkspaceId || !shouldDisplaySelectedWorkspaceAsInProgress) {
		return groups;
	}

	let movedRow: WorkspaceRow | null = null;

	const nextGroups = groups.map((group) => {
		const rowIndex = group.rows.findIndex(
			(row) => row.id === selectedWorkspaceId,
		);
		if (rowIndex === -1) {
			return group;
		}

		movedRow = {
			...group.rows[rowIndex],
			manualStatus: "in-progress",
		};

		return {
			...group,
			rows: [
				...group.rows.slice(0, rowIndex),
				...group.rows.slice(rowIndex + 1),
			],
		};
	});

	if (!movedRow) {
		return groups;
	}

	return nextGroups.map((group) =>
		group.id === "progress"
			? { ...group, rows: [movedRow as WorkspaceRow, ...group.rows] }
			: group,
	);
}
