import { useQuery } from "@tanstack/react-query";
import { memo, type ReactNode, useEffect } from "react";
import {
	PATHOS_CLONE_PROJECT_EVENT,
	PATHOS_OPEN_PROJECT_EVENT,
} from "@/lib/project-action-events";
import { spacesQueryOptions } from "@/lib/query-client";
import { useActiveSpace } from "./hooks/use-active-space";
import { useFolderSidebarController } from "./hooks/use-controller";
import { WorkspacesSidebar } from "./index";
import {
	PATHOS_SWITCH_SPACE_EVENT,
	type SwitchSpaceDetail,
} from "./space-events";

type WorkspaceToastVariant = "default" | "destructive";

type WorkspacesSidebarContainerProps = {
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	interactionRequiredSessionIds?: Set<string>;
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
		interactionRequiredSessionIds,
		addRepositoryShortcut,
		newChatShortcut,
		deleteChatShortcut,
		onSelectWorkspace,
		onSelectChat,
		footerControls,
		accountControl,
		pushWorkspaceToast,
	}: WorkspacesSidebarContainerProps) {
		const { data: spaces = [] } = useQuery(spacesQueryOptions());
		const { activeSpaceId, setActiveSpaceId } = useActiveSpace(spaces);

		const {
			folders,
			genericChats,
			addingRepository,
			importingRepository,
			recentlyAddedRepoId,
			creatingChatRepoId,
			creatingGenericChat,
			isCloneDialogOpen,
			setIsCloneDialogOpen,
			cloneDefaultDirectory,
			isFolderExpanded,
			toggleFolder,
			handleAddRepository,
			handleOpenCloneDialog,
			handleCloneFromUrl,
			handleCreateChat,
			handleCreateGenericChat,
			handleDeleteChat,
			handleDeleteProjectChats,
			handleToggleChatPin,
			handleRemoveProject,
			prefetchChat,
		} = useFolderSidebarController({
			selectedWorkspaceId,
			activeSpaceId,
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

		useEffect(() => {
			const handleSwitch = (event: Event) => {
				const detail = (event as CustomEvent<SwitchSpaceDetail>).detail;
				if (!detail) return;
				const target = spaces[detail.position - 1];
				if (!target) return;
				setActiveSpaceId(target.id);
			};

			window.addEventListener(PATHOS_SWITCH_SPACE_EVENT, handleSwitch);
			return () => {
				window.removeEventListener(PATHOS_SWITCH_SPACE_EVENT, handleSwitch);
			};
		}, [spaces, setActiveSpaceId]);

		return (
			<WorkspacesSidebar
				folders={folders}
				genericChats={genericChats}
				selectedWorkspaceId={selectedWorkspaceId}
				selectedSessionId={selectedSessionId}
				interactionRequiredSessionIds={interactionRequiredSessionIds}
				addRepositoryShortcut={addRepositoryShortcut}
				newChatShortcut={newChatShortcut}
				deleteChatShortcut={deleteChatShortcut}
				addingRepository={addingRepository}
				importingRepository={importingRepository}
				recentlyAddedRepoId={recentlyAddedRepoId}
				creatingChatRepoId={creatingChatRepoId}
				creatingGenericChat={creatingGenericChat}
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
				onCreateGenericChat={handleCreateGenericChat}
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
				spaces={spaces}
				activeSpaceId={activeSpaceId}
				onSelectSpace={setActiveSpaceId}
			/>
		);
	},
);
