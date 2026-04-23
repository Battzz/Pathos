import { memo } from "react";
import { openWorkspaceInFinder } from "@/lib/api";
import { useWorkspacesSidebarController } from "./hooks/use-controller";
import { WorkspacesSidebar } from "./index";

type WorkspaceToastVariant = "default" | "destructive";

type WorkspacesSidebarContainerProps = {
	selectedWorkspaceId: string | null;
	sendingWorkspaceIds?: Set<string>;
	interactionRequiredWorkspaceIds?: Set<string>;
	onSelectWorkspace: (workspaceId: string | null) => void;
	pushWorkspaceToast: (
		description: string,
		title?: string,
		variant?: WorkspaceToastVariant,
		opts?: {
			action?: { label: string; onClick: () => void; destructive?: boolean };
			persistent?: boolean;
		},
	) => void;
};

export const WorkspacesSidebarContainer = memo(
	function WorkspacesSidebarContainer({
		selectedWorkspaceId,
		sendingWorkspaceIds,
		interactionRequiredWorkspaceIds,
		onSelectWorkspace,
		pushWorkspaceToast,
	}: WorkspacesSidebarContainerProps) {
		const {
			addingRepository,
			archivingWorkspaceIds,
			archivedRows,
			availableRepositories,
			creatingWorkspaceRepoId,
			cloneDefaultDirectory,
			groups,
			handleAddRepository,
			handleArchiveWorkspace,
			handleCloneFromUrl,
			handleCreateWorkspaceFromRepo,
			handleDeleteWorkspace,
			handleMarkWorkspaceUnread,
			handleOpenCloneDialog,
			handleRestoreWorkspace,
			handleSelectWorkspace,
			handleSetManualStatus,
			handleTogglePin,
			isCloneDialogOpen,
			prefetchWorkspace,
			setIsCloneDialogOpen,
		} = useWorkspacesSidebarController({
			selectedWorkspaceId,
			onSelectWorkspace,
			pushWorkspaceToast,
		});

		return (
			<WorkspacesSidebar
				groups={groups}
				archivedRows={archivedRows}
				availableRepositories={availableRepositories}
				addingRepository={addingRepository}
				archivingWorkspaceIds={archivingWorkspaceIds}
				selectedWorkspaceId={selectedWorkspaceId}
				sendingWorkspaceIds={sendingWorkspaceIds}
				interactionRequiredWorkspaceIds={interactionRequiredWorkspaceIds}
				creatingWorkspaceRepoId={creatingWorkspaceRepoId}
				onAddRepository={() => {
					void handleAddRepository();
				}}
				onOpenCloneDialog={handleOpenCloneDialog}
				isCloneDialogOpen={isCloneDialogOpen}
				onCloneDialogOpenChange={setIsCloneDialogOpen}
				cloneDefaultDirectory={cloneDefaultDirectory}
				onSubmitClone={handleCloneFromUrl}
				onSelectWorkspace={handleSelectWorkspace}
				onPrefetchWorkspace={prefetchWorkspace}
				onCreateWorkspace={(repoId) => {
					void handleCreateWorkspaceFromRepo(repoId);
				}}
				onArchiveWorkspace={handleArchiveWorkspace}
				onMarkWorkspaceUnread={handleMarkWorkspaceUnread}
				onRestoreWorkspace={handleRestoreWorkspace}
				onDeleteWorkspace={handleDeleteWorkspace}
				onOpenInFinder={(workspaceId) => {
					void openWorkspaceInFinder(workspaceId).catch((error) => {
						pushWorkspaceToast(String(error), "Failed to open Finder");
					});
				}}
				onTogglePin={(workspaceId, pinned) => {
					void handleTogglePin(workspaceId, pinned);
				}}
				onSetManualStatus={(workspaceId, status) => {
					void handleSetManualStatus(workspaceId, status);
				}}
			/>
		);
	},
);
