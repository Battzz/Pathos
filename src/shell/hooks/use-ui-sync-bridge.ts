import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { subscribeUiMutations, type UiMutationEvent } from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";

type Options = {
	queryClient: QueryClient;
	processPendingCliSends: () => Promise<void> | void;
	openChat: (workspaceId: string, sessionId: string) => void;
	reloadSettings: () => Promise<void> | void;
	refreshGithubIdentity: () => Promise<void> | void;
};

function invalidateAllWorkspaceChanges(queryClient: QueryClient) {
	void queryClient.invalidateQueries({
		predicate: (query) => query.queryKey[0] === "workspaceChanges",
	});
	void queryClient.invalidateQueries({
		predicate: (query) => query.queryKey[0] === "workspaceFiles",
	});
}

function handleUiMutation(
	event: UiMutationEvent,
	queryClient: QueryClient,
	options: Omit<Options, "queryClient">,
) {
	switch (event.type) {
		case "workspaceListChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.archivedWorkspaces,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "workspaceCandidateDirectories",
			});
			return;
		case "workspaceChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceLinkedDirectories(event.workspaceId),
			});
			return;
		case "sessionListChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceSessions(event.workspaceId),
			});
			return;
		case "contextUsageChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.sessionContextUsage(event.sessionId),
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "claudeRichContextUsage" &&
					query.queryKey[1] === event.sessionId,
			});
			return;
		case "workspaceFilesChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGitActionStatus(event.workspaceId),
			});
			invalidateAllWorkspaceChanges(queryClient);
			return;
		case "workspaceGitStateChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGitActionStatus(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceForgeActionStatus(event.workspaceId),
			});
			invalidateAllWorkspaceChanges(queryClient);
			return;
		case "workspaceForgeChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceForge(event.workspaceId),
			});
			// CLI auth status lives in a separate cache (Settings → Account).
			// Backend already debounces/edge-detects this event, so the bridge
			// is the right place to fan out instead of redoing the check in
			// individual feature components.
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.forgeCliStatusAll,
			});
			return;
		case "workspaceChangeRequestChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceChangeRequest(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceForgeActionStatus(event.workspaceId),
			});
			return;
		case "repositoryListChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositories,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			return;
		case "repositoryChanged":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositories,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "repoScripts" &&
					query.queryKey[1] === event.repoId,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repoPreferences(event.repoId),
			});
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryKey[0] === "workspaceDetail",
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			return;
		case "settingsChanged":
			if (
				event.key === null ||
				event.key.startsWith("app.") ||
				event.key.startsWith("branch_prefix_")
			) {
				void options.reloadSettings();
			}
			if (
				event.key === null ||
				event.key === "auto_close_action_kinds" ||
				event.key === "auto_close_opt_in_asked"
			) {
				void queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.autoCloseActionKinds,
				});
				void queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.autoCloseOptInAsked,
				});
			}
			return;
		case "githubIdentityChanged":
			void options.refreshGithubIdentity();
			return;
		case "pendingCliSendQueued":
			void options.processPendingCliSends();
			return;
		case "openChatRequested":
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.repositoryFolders,
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceSessions(event.workspaceId),
			});
			options.openChat(event.workspaceId, event.sessionId);
			return;
	}
}

export function useUiSyncBridge({
	queryClient,
	processPendingCliSends,
	openChat,
	reloadSettings,
	refreshGithubIdentity,
}: Options) {
	const processPendingCliSendsRef = useRef(processPendingCliSends);
	const openChatRef = useRef(openChat);
	const reloadSettingsRef = useRef(reloadSettings);
	const refreshGithubIdentityRef = useRef(refreshGithubIdentity);

	useEffect(() => {
		processPendingCliSendsRef.current = processPendingCliSends;
		openChatRef.current = openChat;
		reloadSettingsRef.current = reloadSettings;
		refreshGithubIdentityRef.current = refreshGithubIdentity;
	}, [openChat, processPendingCliSends, refreshGithubIdentity, reloadSettings]);

	useEffect(() => {
		let disposed = false;

		void subscribeUiMutations((event) => {
			if (disposed) {
				return;
			}

			handleUiMutation(event, queryClient, {
				processPendingCliSends: () => processPendingCliSendsRef.current(),
				openChat: (workspaceId, sessionId) =>
					openChatRef.current(workspaceId, sessionId),
				reloadSettings: () => reloadSettingsRef.current(),
				refreshGithubIdentity: () => refreshGithubIdentityRef.current(),
			});
		});

		return () => {
			disposed = true;
		};
	}, [queryClient]);
}
