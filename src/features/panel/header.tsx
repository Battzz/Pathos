import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowRight,
	Check,
	ChevronDown,
	Copy,
	GitBranch,
	Pencil,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { BranchPickerPopover } from "@/components/branch-picker";
import { Button } from "@/components/ui/button";
import { HyperText } from "@/components/ui/hyper-text";
import { Input } from "@/components/ui/input";
import {
	type ChangeRequestInfo,
	listRemoteBranches,
	prefetchRemoteRefs,
	renameWorkspaceBranch,
	updateIntendedTargetBranch,
	type WorkspaceDetail,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import {
	getWorkspaceBranchTone,
	type WorkspaceBranchTone,
} from "@/lib/workspace-helpers";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

type WorkspacePanelHeaderProps = {
	workspace: WorkspaceDetail | null;
	changeRequest?: ChangeRequestInfo | null;
	headerActions?: React.ReactNode;
	headerLeading?: React.ReactNode;
	onWorkspaceChanged?: () => void;
};

export const WorkspacePanelHeader = memo(function WorkspacePanelHeader({
	workspace,
	changeRequest = null,
	headerActions,
	headerLeading,
	onWorkspaceChanged,
}: WorkspacePanelHeaderProps) {
	const branchTone = getWorkspaceBranchTone({
		workspaceState: workspace?.state,
		status: workspace?.status,
		changeRequest,
	});
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	const branchesQuery = useQuery({
		queryKey: ["remoteBranches", workspace?.id],
		queryFn: () => listRemoteBranches({ workspaceId: workspace!.id }),
		enabled: false,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
	const remoteBranches = branchesQuery.data ?? [];
	const loadingBranches = branchesQuery.isFetching;
	const [editingBranch, setEditingBranch] = useState<string | null>(null);
	const [branchCopied, setBranchCopied] = useState(false);

	const handleStartBranchRename = useCallback(() => {
		if (!workspace?.branch) {
			return;
		}
		setEditingBranch(workspace.branch);
	}, [workspace?.branch]);

	const handleCommitBranchRename = useCallback(async () => {
		if (editingBranch === null || !workspace) {
			return;
		}
		const trimmed = editingBranch.trim();
		if (trimmed && trimmed !== workspace.branch) {
			const detailKey = helmorQueryKeys.workspaceDetail(workspace.id);
			const previous = queryClient.getQueryData<WorkspaceDetail | null>(
				detailKey,
			);
			if (previous) {
				queryClient.setQueryData<WorkspaceDetail | null>(detailKey, {
					...previous,
					branch: trimmed,
				});
			}
			try {
				await renameWorkspaceBranch(workspace.id, trimmed);
				onWorkspaceChanged?.();
			} catch (error: unknown) {
				if (previous) {
					queryClient.setQueryData<WorkspaceDetail | null>(detailKey, previous);
				}
				pushToast(
					error instanceof Error ? error.message : String(error),
					"Branch rename failed",
					"destructive",
				);
			}
		}
		setEditingBranch(null);
	}, [editingBranch, onWorkspaceChanged, pushToast, queryClient, workspace]);

	const handleCancelBranchRename = useCallback(() => {
		setEditingBranch(null);
	}, []);

	return (
		<header className="relative z-20">
			<div
				aria-label="Workspace header"
				className="flex h-9 items-center justify-between gap-3 px-[18px]"
				data-tauri-drag-region
			>
				<div className="relative z-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12.5px]">
					{headerLeading}
					<span className="group/branch relative inline-flex items-center gap-1 overflow-hidden px-1 py-0.5 font-medium text-foreground">
						<GitBranch
							className={cn(
								"size-3.5 shrink-0",
								getBranchToneClassName(branchTone),
							)}
							strokeWidth={1.9}
						/>
						{editingBranch !== null ? (
							<Input
								autoFocus
								value={editingBranch}
								onChange={(event) => setEditingBranch(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void handleCommitBranchRename();
									} else if (event.key === "Escape") {
										handleCancelBranchRename();
									}
								}}
								onBlur={() => void handleCommitBranchRename()}
								onClick={(event) => event.stopPropagation()}
								className="h-5 w-32 truncate rounded-md border-border bg-background px-1.5 py-0 text-[12.5px] font-medium text-foreground"
							/>
						) : (
							<>
								<HyperText
									key={workspace?.id}
									text={workspace?.branch ?? "No branch"}
									className="truncate"
								/>
								{workspace?.branch && workspace.state !== "archived" ? (
									<span className="pointer-events-none invisible absolute inset-y-0 right-0 flex items-center gap-0.5 bg-[linear-gradient(to_right,transparent_0%,var(--background)_35%,var(--background)_100%)] pl-5 pr-1 group-hover/branch:pointer-events-auto group-hover/branch:visible">
										<span
											role="button"
											aria-label="Rename branch"
											onClick={handleStartBranchRename}
											className="flex cursor-pointer items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
										>
											<Pencil className="size-3" strokeWidth={2} />
										</span>
										<span
											role="button"
											aria-label="Copy branch name"
											onClick={() => {
												if (!workspace.branch) {
													return;
												}
												void navigator.clipboard.writeText(workspace.branch);
												setBranchCopied(true);
												setTimeout(() => setBranchCopied(false), 1500);
											}}
											className="flex cursor-pointer items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
										>
											{branchCopied ? (
												<Check
													className="size-3 text-green-400"
													strokeWidth={2}
												/>
											) : (
												<Copy className="size-3" strokeWidth={2} />
											)}
										</span>
									</span>
								) : null}
							</>
						)}
					</span>
					{workspace?.intendedTargetBranch ? (
						<>
							<ArrowRight
								className="relative top-px size-3 shrink-0 self-center text-muted-foreground"
								strokeWidth={1.8}
							/>
							{workspace.state === "archived" ? (
								<span className="px-1 py-0.5 font-medium text-muted-foreground">
									{workspace.remote ?? "origin"}/
									{workspace.intendedTargetBranch}
								</span>
							) : (
								<BranchPicker
									currentBranch={workspace.intendedTargetBranch ?? ""}
									displayRemote={workspace.remote ?? "origin"}
									branches={remoteBranches}
									loading={loadingBranches}
									onOpen={() => {
										void branchesQuery.refetch();
										void prefetchRemoteRefs({ workspaceId: workspace.id })
											.then((result) => {
												if (result.fetched) {
													void branchesQuery.refetch();
												}
											})
											.catch(() => {});
									}}
									onSelect={(branch: string) => {
										if (branch === workspace.intendedTargetBranch) {
											return;
										}
										const detailKey = helmorQueryKeys.workspaceDetail(
											workspace.id,
										);
										const previousDetail =
											queryClient.getQueryData<WorkspaceDetail | null>(
												detailKey,
											);
										if (previousDetail) {
											queryClient.setQueryData<WorkspaceDetail | null>(
												detailKey,
												{
													...previousDetail,
													intendedTargetBranch: branch,
												},
											);
										}

										// Invalidate changes so diff section shows loading.
										if (workspace.rootPath) {
											void queryClient.invalidateQueries({
												queryKey: helmorQueryKeys.workspaceChanges(
													workspace.rootPath,
												),
											});
										}

										void updateIntendedTargetBranch(workspace.id, branch)
											.then(({ reset }) => {
												onWorkspaceChanged?.();
												// Recompute sync status vs. new target now; don't wait for 10s poll.
												void queryClient.invalidateQueries({
													queryKey: helmorQueryKeys.workspaceGitActionStatus(
														workspace.id,
													),
												});
												if (workspace.rootPath) {
													void queryClient.invalidateQueries({
														queryKey: helmorQueryKeys.workspaceChanges(
															workspace.rootPath,
														),
													});
												}
												if (reset) {
													pushToast(
														`Local branch reset to ${workspace.remote ?? "origin"}/${branch}`,
														`Switched to ${branch}`,
														"default",
													);
												} else {
													pushToast(
														"Target branch updated",
														`Switched to ${branch}`,
														"default",
													);
												}
											})
											.catch((error: unknown) => {
												if (previousDetail) {
													queryClient.setQueryData<WorkspaceDetail | null>(
														detailKey,
														previousDetail,
													);
												}
												pushToast(
													error instanceof Error
														? error.message
														: String(error),
													"Branch switch failed",
													"destructive",
												);
											});
									}}
								/>
							)}
						</>
					) : null}
				</div>
				{headerActions ? (
					<div className="relative z-10 flex shrink-0 items-center gap-1 bg-background pl-1">
						{headerActions}
					</div>
				) : null}
			</div>
		</header>
	);
});

function getBranchToneClassName(tone: WorkspaceBranchTone) {
	switch (tone) {
		case "open":
			return "text-[var(--workspace-branch-status-open)]";
		case "merged":
			return "text-[var(--workspace-branch-status-merged)]";
		case "closed":
			return "text-[var(--workspace-branch-status-closed)]";
		case "inactive":
			return "text-[var(--workspace-branch-status-inactive)]";
		default:
			return "text-[var(--workspace-branch-status-working)]";
	}
}

// BranchPicker: thin wrapper around shared BranchPickerPopover with header trigger styling.
function BranchPicker({
	currentBranch,
	displayRemote,
	branches,
	loading,
	onOpen,
	onSelect,
}: {
	currentBranch: string;
	displayRemote: string;
	branches: string[];
	loading: boolean;
	onOpen: () => void;
	onSelect: (branch: string) => void;
}) {
	return (
		<BranchPickerPopover
			currentBranch={currentBranch}
			branches={branches}
			loading={loading}
			onOpen={onOpen}
			onSelect={onSelect}
		>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				className="h-6 min-w-0 max-w-[180px] gap-1 rounded-md px-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
			>
				<span className="truncate">
					{displayRemote}/{currentBranch}
				</span>
				<ChevronDown data-icon="inline-end" strokeWidth={2} />
			</Button>
		</BranchPickerPopover>
	);
}
