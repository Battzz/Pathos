import { memo, type ReactNode, useEffect } from "react";
import {
	PATHOS_CLONE_PROJECT_EVENT,
	PATHOS_OPEN_PROJECT_EVENT,
} from "@/lib/project-action-events";
import { useFolderSidebarController } from "./hooks/use-controller";
import { WorkspacesSidebar } from "./index";

type WorkspaceToastVariant = "default" | "destructive";

type WorkspacesSidebarContainerProps = {
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	addRepositoryShortcut?: string | null;
	newChatShortcut?: string | null;
	deleteChatShortcut?: string | null;
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
		newChatShortcut,
		deleteChatShortcut,
		onSelectWorkspace,
		onSelectChat,
		footerControls,
		accountControl,
		pushWorkspaceToast,
	}: WorkspacesSidebarContainerProps) {
		const {
			folders,
			addingRepository,
			importingRepository,
			recentlyAddedRepoId,
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
			handleDeleteProjectChats,
			handleToggleChatPin,
			handleRemoveProject,
			prefetchChat,
		} = useFolderSidebarController({
			selectedWorkspaceId,
			onSelectWorkspace,
			onSelectChat,
			pushWorkspaceToast,
		});

		useEffect(() => {
			const openProject = () => {
				void handleAddRepository();
			};
			const cloneProject = () => {
				handleOpenCloneDialog();
			};

			window.addEventListener(PATHOS_OPEN_PROJECT_EVENT, openProject);
			window.addEventListener(PATHOS_CLONE_PROJECT_EVENT, cloneProject);

			return () => {
				window.removeEventListener(PATHOS_OPEN_PROJECT_EVENT, openProject);
				window.removeEventListener(PATHOS_CLONE_PROJECT_EVENT, cloneProject);
			};
		}, [handleAddRepository, handleOpenCloneDialog]);

		return (
			<WorkspacesSidebar
				folders={folders}
				selectedWorkspaceId={selectedWorkspaceId}
				selectedSessionId={selectedSessionId}
				addRepositoryShortcut={addRepositoryShortcut}
				newChatShortcut={newChatShortcut}
				deleteChatShortcut={deleteChatShortcut}
				addingRepository={addingRepository}
				importingRepository={importingRepository}
				recentlyAddedRepoId={recentlyAddedRepoId}
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
				onDeleteProjectChats={(repoId) => {
					void handleDeleteProjectChats(repoId);
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
