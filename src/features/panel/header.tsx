import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, GitBranch, Loader2 } from "lucide-react";
import { memo, useState } from "react";
import { BranchPickerPopover } from "@/components/branch-picker";
import { BranchSwitcherPopover } from "@/components/branch-switcher";
import { Button } from "@/components/ui/button";
import { HyperText } from "@/components/ui/hyper-text";
import {
	type ChangeRequestInfo,
	createWorkspaceBranch,
	deleteWorkspaceLocalBranch,
	deleteWorkspaceRemoteBranch,
	initWorkspaceGit,
	listRemoteBranches,
	listWorkspaceBranches,
	prefetchRemoteRefs,
	switchWorkspaceBranch,
	updateIntendedTargetBranch,
	type WorkspaceDetail,
} from "@/lib/api";
import { extractError } from "@/lib/errors";
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
	const [initializingGit, setInitializingGit] = useState(false);
	const branchesQuery = useQuery({
		queryKey: ["remoteBranches", workspace?.id],
		queryFn: () => listRemoteBranches({ workspaceId: workspace!.id }),
		enabled: false,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
	const remoteBranches = branchesQuery.data ?? [];
	const loadingBranches = branchesQuery.isFetching;

	const workspaceBranchesQuery = useQuery({
		queryKey: ["workspaceBranches", workspace?.id],
		queryFn: () => listWorkspaceBranches(workspace!.id),
		enabled: false,
		staleTime: 30 * 1000,
		gcTime: 5 * 60 * 1000,
	});

	return (
		<header className="relative z-20">
			<div
				aria-label="Workspace header"
				className="flex h-9 items-center justify-between gap-3 px-[18px]"
				data-tauri-drag-region
			>
				<div className="relative z-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12.5px]">
					{headerLeading}
					{workspace && !workspace.isGit && workspace.state !== "archived" ? (
						<Button
							type="button"
							variant="ghost"
							size="xs"
							disabled={initializingGit}
							className="h-6 gap-1 rounded-md px-1.5 font-medium text-foreground hover:bg-accent/60"
							onClick={() => {
								setInitializingGit(true);
								void initWorkspaceGit(workspace.id)
									.then(() => {
										onWorkspaceChanged?.();
										void queryClient.invalidateQueries({
											queryKey: helmorQueryKeys.workspaceDetail(workspace.id),
										});
										void queryClient.invalidateQueries({
											queryKey: helmorQueryKeys.repositoryFolders,
										});
									})
									.catch((error: unknown) => {
										pushToast(
											extractError(error, "Failed to initialize git").message,
											"Initialize git failed",
											"destructive",
										);
									})
									.finally(() => {
										setInitializingGit(false);
									});
							}}
						>
							{initializingGit ? (
								<Loader2
									className="size-3.5 shrink-0 animate-spin text-muted-foreground"
									strokeWidth={1.9}
								/>
							) : (
								<GitBranch
									className="size-3.5 shrink-0 text-muted-foreground"
									strokeWidth={1.9}
								/>
							)}
							<span>
								{initializingGit ? "Initializing…" : "Initialize git"}
							</span>
						</Button>
					) : workspace?.branch && workspace.state !== "archived" ? (
						<BranchSwitcherPopover
							branches={workspaceBranchesQuery.data ?? null}
							loading={workspaceBranchesQuery.isFetching}
							onOpen={() => {
								void workspaceBranchesQuery.refetch();
							}}
							onSelect={(branch) => {
								if (branch === workspace.branch) {
									return;
								}
								const detailKey = helmorQueryKeys.workspaceDetail(workspace.id);
								const previous =
									queryClient.getQueryData<WorkspaceDetail | null>(detailKey);
								if (previous) {
									queryClient.setQueryData<WorkspaceDetail | null>(detailKey, {
										...previous,
										branch,
									});
								}
								void switchWorkspaceBranch(workspace.id, branch)
									.then(() => {
										onWorkspaceChanged?.();
										void queryClient.invalidateQueries({
											queryKey: ["workspaceBranches", workspace.id],
										});
									})
									.catch((error: unknown) => {
										if (previous) {
											queryClient.setQueryData<WorkspaceDetail | null>(
												detailKey,
												previous,
											);
										}
										pushToast(
											extractError(error, "Failed to switch branch").message,
											"Branch switch failed",
											"destructive",
										);
									});
							}}
							onCreate={async (branch) => {
								try {
									await createWorkspaceBranch(workspace.id, branch);
									const detailKey = helmorQueryKeys.workspaceDetail(
										workspace.id,
									);
									const previous =
										queryClient.getQueryData<WorkspaceDetail | null>(detailKey);
									if (previous) {
										queryClient.setQueryData<WorkspaceDetail | null>(
											detailKey,
											{
												...previous,
												branch,
											},
										);
									}
									onWorkspaceChanged?.();
									void queryClient.invalidateQueries({
										queryKey: ["workspaceBranches", workspace.id],
									});
								} catch (error: unknown) {
									pushToast(
										extractError(error, "Failed to create branch").message,
										"Branch creation failed",
										"destructive",
									);
									throw error;
								}
							}}
							onDeleteLocal={async (branch) => {
								try {
									await deleteWorkspaceLocalBranch(workspace.id, branch);
									await workspaceBranchesQuery.refetch();
								} catch (error: unknown) {
									pushToast(
										humanizeBranchError(
											extractError(error, "Failed to delete branch").message,
											branch,
										),
										"Delete branch failed",
										"destructive",
									);
								}
							}}
							onDeleteRemote={async (branch) => {
								try {
									await deleteWorkspaceRemoteBranch(workspace.id, branch);
									await workspaceBranchesQuery.refetch();
								} catch (error: unknown) {
									pushToast(
										humanizeBranchError(
											extractError(error, "Failed to delete remote branch")
												.message,
											branch,
										),
										"Delete remote branch failed",
										"destructive",
									);
								}
							}}
						>
							<button
								type="button"
								className="inline-flex cursor-pointer select-none items-center gap-1 overflow-hidden rounded-md px-1 py-0.5 font-medium text-foreground hover:bg-accent/60"
							>
								<GitBranch
									className={cn(
										"size-3.5 shrink-0",
										getBranchToneClassName(branchTone),
									)}
									strokeWidth={1.9}
								/>
								<HyperText
									key={workspace.id}
									text={workspace.branch}
									className="truncate"
								/>
							</button>
						</BranchSwitcherPopover>
					) : workspace?.branch ? (
						<span className="inline-flex items-center gap-1 overflow-hidden px-1 py-0.5 font-medium text-foreground">
							<GitBranch
								className={cn(
									"size-3.5 shrink-0",
									getBranchToneClassName(branchTone),
								)}
								strokeWidth={1.9}
							/>
							<HyperText
								key={workspace?.id}
								text={workspace.branch}
								className="truncate"
							/>
						</span>
					) : null}
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
													extractError(error, "Failed to switch branch")
														.message,
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

/** Translate the noisier git error strings into human-readable copy. */
function humanizeBranchError(message: string, branch: string): string {
	const worktree = message.match(
		/used by worktree at ['"]?([^'"]+?)['"]?($|\s)/,
	);
	if (worktree) {
		return `'${branch}' is checked out in another worktree (${worktree[1]}). Switch that worktree to a different branch first, or remove it.`;
	}
	if (/not fully merged/i.test(message)) {
		return `'${branch}' has unmerged commits. Merge or rebase before deleting.`;
	}
	if (/remote rejected|protected branch|GH006/i.test(message)) {
		return `Remote rejected the delete (likely a protected branch).`;
	}
	if (/could not read from remote|Could not resolve host/i.test(message)) {
		return `Couldn't reach the remote. Check your connection and try again.`;
	}
	return message;
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
