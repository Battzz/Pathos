import type {
	RepositoryFolder,
	RepositoryFolderChat,
	RepositoryFolderWorkspace,
	WorkspaceRow,
	WorkspaceSessionSummary,
} from "@/lib/api";

export type NavigationItem = {
	id: string;
	value: string;
	title: string;
	detail: string;
	workspaceId: string | null;
	sessionId: string | null;
};

export function buildNavigationItems(
	repositoryFolders: RepositoryFolder[],
): NavigationItem[] {
	return repositoryFolders.flatMap((folder) => {
		const chatItems = folder.chats.map((chat) =>
			chatNavigationItem(folder, chat),
		);
		const workspaceItems = folder.workspaces.map((workspace) =>
			workspaceNavigationItem(folder, workspace),
		);

		if (chatItems.length > 0 || workspaceItems.length > 0) {
			return [...chatItems, ...workspaceItems];
		}

		return [
			{
				id: `repo-${folder.repoId}`,
				value: `project repository ${folder.repoName} ${folder.rootPath ?? ""}`,
				title: folder.repoName,
				detail: "No chats yet",
				workspaceId: null,
				sessionId: null,
			},
		];
	});
}

export function sessionDetail(session: WorkspaceSessionSummary) {
	const parts = [
		session.model,
		session.status === "idle" ? null : session.status,
	];
	return parts.filter(Boolean).join(" · ");
}

function chatNavigationItem(
	folder: RepositoryFolder,
	chat: RepositoryFolderChat,
): NavigationItem {
	const title = chat.title || folder.repoName;
	const detail =
		chat.title && chat.title !== folder.repoName
			? folder.repoName
			: (folder.rootPath ?? "Project chat");
	return {
		id: `chat-${chat.sessionId}`,
		value: `project chat session ${folder.repoName} ${title} ${folder.rootPath ?? ""} ${chat.status}`,
		title,
		detail,
		workspaceId: chat.workspaceId,
		sessionId: chat.sessionId,
	};
}

function workspaceNavigationItem(
	folder: RepositoryFolder,
	workspace: RepositoryFolderWorkspace,
): NavigationItem {
	return {
		id: `workspace-${workspace.id}`,
		value: `workspace project ${workspace.title} ${folder.repoName} ${workspace.repoName ?? ""} ${workspace.directoryName ?? ""} ${workspace.branch ?? ""}`,
		title: workspace.title,
		detail: workspaceSubtitle(workspace) || folder.repoName,
		workspaceId: workspace.id,
		sessionId: null,
	};
}

function workspaceSubtitle(workspace: WorkspaceRow) {
	const parts = [
		workspace.repoName ?? workspace.directoryName,
		workspace.branch ? `branch ${workspace.branch}` : null,
	];
	return parts.filter(Boolean).join(" · ");
}
