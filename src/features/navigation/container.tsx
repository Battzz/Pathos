import { memo, type ReactNode } from "react";
import { useFolderSidebarController } from "./hooks/use-controller";
import { WorkspacesSidebar } from "./index";

type WorkspaceToastVariant = "default" | "destructive";

type WorkspacesSidebarContainerProps = {
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	addRepositoryShortcut?: string | null;
	onSelectWorkspace: (workspaceId: string | null) => void;
	onSelectChat: (workspaceId: string, sessionId: string) => void;
	footerControls?: ReactNode;
	accountControl?: ReactNode;
	pushWorkspaceToast: (
		description: string,
		title?: string,
		variant?: WorkspaceToastVariant,
	) => void;
};

export const WorkspacesSidebarContainer = memo(
	function WorkspacesSidebarContainer({
		selectedWorkspaceId,
		selectedSessionId,
		addRepositoryShortcut,
		onSelectWorkspace,
		onSelectChat,
		footerControls,
		accountControl,
		pushWorkspaceToast,
	}: WorkspacesSidebarContainerProps) {
		const {
			folders,
			addingRepository,
			creatingChatRepoId,
			isCloneDialogOpen,
			setIsCloneDialogOpen,
			cloneDefaultDirectory,
			isFolderExpanded,
			toggleFolder,
			handleAddRepository,
			handleOpenCloneDialog,
			handleCloneFromUrl,
			handleCreateChat,
			handleDeleteChat,
			handleToggleChatPin,
			handleRemoveProject,
			prefetchChat,
		} = useFolderSidebarController({
			selectedWorkspaceId,
			onSelectWorkspace,
			onSelectChat,
			pushWorkspaceToast,
		});

		return (
			<WorkspacesSidebar
				folders={folders}
				selectedWorkspaceId={selectedWorkspaceId}
				selectedSessionId={selectedSessionId}
				addRepositoryShortcut={addRepositoryShortcut}
				addingRepository={addingRepository}
				creatingChatRepoId={creatingChatRepoId}
				isCloneDialogOpen={isCloneDialogOpen}
				cloneDefaultDirectory={cloneDefaultDirectory}
				onCloneDialogOpenChange={setIsCloneDialogOpen}
				onAddRepository={() => {
					void handleAddRepository();
				}}
				onOpenCloneDialog={handleOpenCloneDialog}
				onSubmitClone={handleCloneFromUrl}
				onSelectChat={onSelectChat}
				onPrefetchChat={prefetchChat}
				onCreateChat={handleCreateChat}
				onDeleteChat={(sessionId) => {
					void handleDeleteChat(sessionId);
				}}
				onToggleChatPin={(chat) => {
					void handleToggleChatPin(chat);
				}}
				onRemoveProject={(repoId) => {
					void handleRemoveProject(repoId);
				}}
				isFolderExpanded={isFolderExpanded}
				onToggleFolder={toggleFolder}
				footerControls={footerControls}
				accountControl={accountControl}
			/>
		);
	},
);
