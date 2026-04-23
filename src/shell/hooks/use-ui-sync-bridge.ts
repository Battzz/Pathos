import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { subscribeUiMutations, type UiMutationEvent } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";

type Options = {
	queryClient: QueryClient;
	processPendingCliSends: () => Promise<void> | void;
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
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.archivedWorkspaces,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "workspaceCandidateDirectories",
			});
			return;
		case "workspaceChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceLinkedDirectories(event.workspaceId),
			});
			return;
		case "sessionListChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceSessions(event.workspaceId),
			});
			return;
		case "contextUsageChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.sessionContextUsage(event.sessionId),
			});
			return;
		case "codexRateLimitsChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.codexRateLimits,
			});
			return;
		case "workspaceFilesChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGitActionStatus(event.workspaceId),
			});
			invalidateAllWorkspaceChanges(queryClient);
			return;
		case "workspaceGitStateChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGitActionStatus(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspacePrActionStatus(event.workspaceId),
			});
			invalidateAllWorkspaceChanges(queryClient);
			return;
		case "workspacePrChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceDetail(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspacePr(event.workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspacePrActionStatus(event.workspaceId),
			});
			return;
		case "repositoryListChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.repositories,
			});
			return;
		case "repositoryChanged":
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.repositories,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "repoScripts" &&
					query.queryKey[1] === event.repoId,
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.repoPreferences(event.repoId),
			});
			void queryClient.invalidateQueries({
				predicate: (query) => query.queryKey[0] === "workspaceDetail",
			});
			void queryClient.invalidateQueries({
				queryKey: helmorQueryKeys.workspaceGroups,
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
					queryKey: helmorQueryKeys.autoCloseActionKinds,
				});
				void queryClient.invalidateQueries({
					queryKey: helmorQueryKeys.autoCloseOptInAsked,
				});
			}
			return;
		case "githubIdentityChanged":
			void options.refreshGithubIdentity();
			return;
		case "pendingCliSendQueued":
			void options.processPendingCliSends();
			return;
	}
}

export function useUiSyncBridge({
	queryClient,
	processPendingCliSends,
	reloadSettings,
	refreshGithubIdentity,
}: Options) {
	const processPendingCliSendsRef = useRef(processPendingCliSends);
	const reloadSettingsRef = useRef(reloadSettings);
	const refreshGithubIdentityRef = useRef(refreshGithubIdentity);

	useEffect(() => {
		processPendingCliSendsRef.current = processPendingCliSends;
		reloadSettingsRef.current = reloadSettings;
		refreshGithubIdentityRef.current = refreshGithubIdentity;
	}, [processPendingCliSends, refreshGithubIdentity, reloadSettings]);

	useEffect(() => {
		let disposed = false;

		void subscribeUiMutations((event) => {
			if (disposed) {
				return;
			}

			handleUiMutation(event, queryClient, {
				processPendingCliSends: () => processPendingCliSendsRef.current(),
				reloadSettings: () => reloadSettingsRef.current(),
				refreshGithubIdentity: () => refreshGithubIdentityRef.current(),
			});
		});

		return () => {
			disposed = true;
		};
	}, [queryClient]);
}
