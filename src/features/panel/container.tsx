import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { getShortcut } from "@/features/shortcuts/registry";
import type {
	AgentModelSection,
	AgentProvider,
	ChangeRequestInfo,
	RepoScripts,
	ThreadMessageLike,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import {
	createSession,
	loadRepoScripts,
	prepareSessionRedoFromUserMessage,
	truncateSessionMessagesAfter,
} from "@/lib/api";
import {
	pathosQueryKeys,
	sessionThreadMessagesQueryOptions,
	workspaceDetailQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { resolveSessionDisplayProvider } from "@/lib/workspace-helpers";
import {
	WORKSPACE_SCRIPT_PROMPTS,
	type WorkspaceScriptType,
} from "@/lib/workspace-script-actions";
import { WorkspacePanel } from "./index";
import type { SessionCloseRequest } from "./use-confirm-session-close";
import { useSessionPanes } from "./use-session-pane-cache";

const EMPTY_MESSAGES: ThreadMessageLike[] = [];

function isFreshEmptySession(session: WorkspaceSessionSummary | null): boolean {
	if (!session) {
		return false;
	}

	// `lastUserMessageAt` and `providerSessionId` both flip definitively the
	// first time the user actually sends a prompt (the agent SDK assigns the
	// provider session id on the first turn). We deliberately do NOT compare
	// `createdAt`/`updatedAt`: the `update_sessions_updated_at` SQL trigger
	// bumps `updated_at` on any row update — model defaulting, status flips,
	// fast-mode toggles, etc. — long before the user has typed anything.
	// Including that check made the gate flap to false intermittently, which
	// suppressed the "Chat with X" empty state in favour of the cold
	// placeholder when switching from an existing chat to a new one.
	return session.lastUserMessageAt == null && session.providerSessionId == null;
}

type WorkspacePanelContainerProps = {
	isShellResizing?: boolean;
	selectedWorkspaceId: string | null;
	displayedWorkspaceId: string | null;
	selectedSessionId: string | null;
	displayedSessionId: string | null;
	sessionSelectionHistory?: string[];
	sending: boolean;
	sendingSessionIds?: Set<string>;
	interactionRequiredSessionIds?: Set<string>;
	modelSelections?: Record<string, string>;
	workspaceChangeRequest?: ChangeRequestInfo | null;
	onSelectSession: (sessionId: string | null) => void;
	onResolveDisplayedSession: (sessionId: string | null) => void;
	onQueuePendingPromptForSession?: (request: {
		sessionId: string;
		prompt: string;
		modelId?: string | null;
		permissionMode?: string | null;
		replayUserMessageId?: string | null;
	}) => void;
	onRequestCloseSession?: (request: SessionCloseRequest) => void;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
	headerActions?: React.ReactNode;
	headerLeading?: React.ReactNode;
};

export const WorkspacePanelContainer = memo(function WorkspacePanelContainer({
	isShellResizing = false,
	selectedWorkspaceId,
	displayedWorkspaceId,
	selectedSessionId,
	displayedSessionId,
	sessionSelectionHistory = [],
	sending,
	sendingSessionIds,
	interactionRequiredSessionIds,
	modelSelections = {},
	workspaceChangeRequest = null,
	onSelectSession,
	onResolveDisplayedSession,
	onQueuePendingPromptForSession,
	onRequestCloseSession,
	onCloneProject,
	onOpenProject,
	headerActions,
	headerLeading,
}: WorkspacePanelContainerProps) {
	const queryClient = useQueryClient();
	const { settings } = useSettings();

	const detailQuery = useQuery({
		...workspaceDetailQueryOptions(displayedWorkspaceId ?? "__none__"),
		enabled: Boolean(displayedWorkspaceId),
	});
	const sessionsQuery = useQuery({
		...workspaceSessionsQueryOptions(displayedWorkspaceId ?? "__none__"),
		enabled: Boolean(displayedWorkspaceId),
	});

	const workspace = detailQuery.data ?? null;
	const sessions = sessionsQuery.data ?? [];
	const rememberedSessionId = useMemo(() => {
		if (sessionSelectionHistory.length === 0 || sessions.length === 0) {
			return null;
		}

		const visibleSessionIds = new Set(sessions.map((session) => session.id));
		for (let i = sessionSelectionHistory.length - 1; i >= 0; i -= 1) {
			const sessionId = sessionSelectionHistory[i];
			if (visibleSessionIds.has(sessionId)) {
				return sessionId;
			}
		}

		return null;
	}, [sessionSelectionHistory, sessions]);

	const autoCreatingWorkspaceRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!displayedWorkspaceId || selectedWorkspaceId !== displayedWorkspaceId) {
			return;
		}

		// Only auto-create after one real fetch cycle. Newly created workspaces
		// are optimistically seeded with an empty session list before the backend
		// response with the initial session lands.
		if (
			!detailQuery.isFetchedAfterMount ||
			!sessionsQuery.isFetchedAfterMount
		) {
			return;
		}

		if (!workspace || sessionsQuery.data === undefined) {
			return;
		}

		const hasNoPersistedSessions =
			workspace.sessionCount === 0 && workspace.activeSessionId === null;

		if (
			workspace.state === "archived" ||
			workspace.state === "initializing" ||
			sessions.length > 0 ||
			!hasNoPersistedSessions
		) {
			autoCreatingWorkspaceRef.current.delete(displayedWorkspaceId);
			return;
		}

		if (autoCreatingWorkspaceRef.current.has(displayedWorkspaceId)) {
			return;
		}

		let cancelled = false;
		autoCreatingWorkspaceRef.current.add(displayedWorkspaceId);

		void createSession(displayedWorkspaceId)
			.then(async ({ sessionId }) => {
				if (cancelled) {
					return;
				}

				const now = new Date().toISOString();
				queryClient.setQueryData(
					pathosQueryKeys.workspaceDetail(displayedWorkspaceId),
					(current: WorkspaceDetail | null | undefined) => {
						if (!current) {
							return current;
						}

						return {
							...current,
							activeSessionId: sessionId,
							activeSessionTitle: "Untitled",
							activeSessionAgentType: null,
							activeSessionStatus: "idle",
							sessionCount: Math.max(current.sessionCount, 1),
						};
					},
				);
				queryClient.setQueryData(
					pathosQueryKeys.workspaceSessions(displayedWorkspaceId),
					(current: WorkspaceSessionSummary[] | undefined) => {
						if ((current ?? []).some((session) => session.id === sessionId)) {
							return current;
						}

						return [
							...(current ?? []),
							{
								id: sessionId,
								workspaceId: displayedWorkspaceId,
								title: "Untitled",
								agentType: null,
								status: "idle",
								model: null,
								permissionMode: "default",
								providerSessionId: null,
								effortLevel: null,
								unreadCount: 0,
								fastMode: false,
								createdAt: now,
								updatedAt: now,
								lastUserMessageAt: null,
								isHidden: false,
								actionKind: null,
								active: true,
							},
						];
					},
				);
				queryClient.setQueryData(
					[...pathosQueryKeys.sessionMessages(sessionId), "thread"],
					[],
				);

				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceDetail(displayedWorkspaceId),
					}),
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceSessions(displayedWorkspaceId),
					}),
				]);
			})
			.catch((error) => {
				console.error(
					`Failed to auto-create a session for workspace ${displayedWorkspaceId}:`,
					error,
				);
			})
			.finally(() => {
				autoCreatingWorkspaceRef.current.delete(displayedWorkspaceId);
			});

		return () => {
			cancelled = true;
		};
	}, [
		displayedWorkspaceId,
		detailQuery.isFetchedAfterMount,
		queryClient,
		sessionsQuery.isFetchedAfterMount,
		selectedWorkspaceId,
		sessions.length,
		sessionsQuery.data,
		workspace,
	]);

	const threadSessionId = useMemo(() => {
		if (!displayedWorkspaceId) {
			return null;
		}

		if (
			displayedSessionId &&
			sessions.some((session) => session.id === displayedSessionId)
		) {
			return displayedSessionId;
		}

		return (
			rememberedSessionId ??
			workspace?.activeSessionId ??
			sessions.find((session) => session.active)?.id ??
			sessions[0]?.id ??
			null
		);
	}, [
		displayedSessionId,
		displayedWorkspaceId,
		rememberedSessionId,
		sessions,
		workspace?.activeSessionId,
	]);

	useEffect(() => {
		if (threadSessionId !== displayedSessionId) {
			onResolveDisplayedSession(threadSessionId);
		}
	}, [displayedSessionId, onResolveDisplayedSession, threadSessionId]);

	useEffect(() => {
		if (!threadSessionId) {
			return;
		}

		void queryClient.prefetchQuery(
			sessionThreadMessagesQueryOptions(threadSessionId),
		);
	}, [queryClient, threadSessionId]);

	const messagesQuery = useQuery({
		...sessionThreadMessagesQueryOptions(threadSessionId ?? "__none__"),
		enabled: Boolean(threadSessionId),
	});
	const repoScriptsQuery = useQuery({
		queryKey: pathosQueryKeys.repoScripts(
			workspace?.repoId ?? "__none__",
			displayedWorkspaceId,
		),
		queryFn: () => loadRepoScripts(workspace!.repoId, displayedWorkspaceId),
		enabled: Boolean(workspace?.repoId && displayedWorkspaceId),
		staleTime: 0,
	});

	const messages = messagesQuery.data ?? EMPTY_MESSAGES;
	const threadSession =
		sessions.find((session) => session.id === threadSessionId) ?? null;
	const hasResolvedSessionMessages = messagesQuery.data !== undefined;
	const startedSessionHasEmptyThread =
		Boolean(threadSessionId) &&
		hasResolvedSessionMessages &&
		messages.length === 0 &&
		!isFreshEmptySession(threadSession);
	const sessionDisplayProviders = useMemo<Record<string, AgentProvider>>(() => {
		const modelSections =
			queryClient.getQueryData<AgentModelSection[]>(
				pathosQueryKeys.agentModelSections,
			) ?? [];
		return Object.fromEntries(
			sessions
				.map((session) => {
					const provider = resolveSessionDisplayProvider({
						session,
						modelSelections,
						modelSections,
						settingsDefaultModelId: settings.defaultModelId,
					});
					return provider ? [session.id, provider] : null;
				})
				.filter((entry): entry is [string, AgentProvider] => entry !== null),
		);
	}, [modelSelections, queryClient, sessions, settings.defaultModelId]);

	const preferredPaneSessionId = selectedSessionId ?? threadSessionId;
	const sessionPanes = useSessionPanes({
		activeMessages: messages,
		activeMessagesLoaded:
			preferredPaneSessionId === threadSessionId &&
			hasResolvedSessionMessages &&
			!startedSessionHasEmptyThread,
		activeSessionId: preferredPaneSessionId,
		queryClient,
		sending,
		sendingSessionIds,
		sessions,
	});

	const hasWorkspaceDetail = workspace !== null;
	const hasWorkspaceSessions = sessionsQuery.data !== undefined;
	const hasWorkspaceContent = hasWorkspaceDetail || sessions.length > 0;
	const hasResolvedWorkspace = hasWorkspaceDetail && hasWorkspaceSessions;

	const loadingWorkspace =
		Boolean(displayedWorkspaceId) &&
		!hasResolvedWorkspace &&
		(detailQuery.isPending || sessionsQuery.isPending);
	const refreshingWorkspace =
		Boolean(displayedWorkspaceId) &&
		!loadingWorkspace &&
		(selectedWorkspaceId !== displayedWorkspaceId ||
			(hasWorkspaceContent &&
				(detailQuery.isFetching || sessionsQuery.isFetching)));
	// Session is "loading" whenever we have a target session but no resolved
	// message data yet. We intentionally do NOT gate this on `refreshingWorkspace`
	// — a background workspace revalidation (e.g. from the git watcher's
	// `invalidateQueries(workspaceDetail)`) must not suppress session-level
	// loading, or the panel falls through to `EmptyState` and flashes
	// "Nothing here yet" before the real messages land. We also deliberately
	// drop the old `messagesQuery.isPending` guard: it was redundant with
	// `!hasResolvedSessionMessages` for enabled queries and hid loading when
	// a previous fetch had errored — the user still needs a placeholder, not
	// EmptyState, until the next fetch succeeds.
	const loadingSession =
		Boolean(threadSessionId) &&
		(!hasResolvedSessionMessages || startedSessionHasEmptyThread);
	const refreshingSession =
		Boolean(threadSessionId) &&
		!loadingSession &&
		!refreshingWorkspace &&
		(selectedSessionId !== threadSessionId ||
			(hasResolvedSessionMessages && messagesQuery.isFetching));

	const invalidateWorkspaceQueries = useCallback(async () => {
		if (!displayedWorkspaceId) {
			return;
		}

		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceDetail(displayedWorkspaceId),
			}),
			queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceSessions(displayedWorkspaceId),
			}),
			queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			}),
		]);
	}, [displayedWorkspaceId, queryClient]);

	const invalidateSessionQueries = useCallback(async () => {
		if (!displayedWorkspaceId) {
			return;
		}

		await invalidateWorkspaceQueries();
		if (threadSessionId) {
			await queryClient.invalidateQueries({
				queryKey: [
					...pathosQueryKeys.sessionMessages(threadSessionId),
					"thread",
				],
			});
		}
	}, [
		displayedWorkspaceId,
		invalidateWorkspaceQueries,
		queryClient,
		threadSessionId,
	]);

	const handleSessionRenamed = useCallback(
		(sessionId: string, title: string) => {
			if (!displayedWorkspaceId) {
				return;
			}

			queryClient.setQueryData(
				pathosQueryKeys.workspaceSessions(displayedWorkspaceId),
				(current: typeof sessions | undefined) =>
					(current ?? []).map((session) =>
						session.id === sessionId ? { ...session, title } : session,
					),
			);
			queryClient.setQueryData(
				pathosQueryKeys.workspaceDetail(displayedWorkspaceId),
				(current: typeof workspace | undefined) => {
					if (!current || current.activeSessionId !== sessionId) {
						return current;
					}

					return {
						...current,
						activeSessionTitle: title,
					};
				},
			);
		},
		[displayedWorkspaceId, queryClient, sessions, workspace],
	);

	const handlePrefetchSession = useCallback(
		(sessionId: string) => {
			void queryClient.prefetchQuery(
				sessionThreadMessagesQueryOptions(sessionId),
			);
		},
		[queryClient],
	);

	// All callback props that go into <WorkspacePanel> must be reference
	// stable so that the memoed header sub-component bails out across stream
	// ticks. We capture the latest `onSelectSession` in a ref and route the
	// stable handler through it.
	const onSelectSessionRef = useRef(onSelectSession);
	onSelectSessionRef.current = onSelectSession;
	const handleSelectSession = useCallback((sessionId: string) => {
		onSelectSessionRef.current(sessionId);
	}, []);
	const handleSessionsChanged = useCallback(() => {
		void invalidateSessionQueries();
	}, [invalidateSessionQueries]);
	const handleWorkspaceChanged = useCallback(() => {
		void invalidateWorkspaceQueries();
	}, [invalidateWorkspaceQueries]);
	const selectedSessionIdForPanel = selectedSessionId ?? threadSessionId;
	const selectedSession =
		sessions.find((session) => session.id === selectedSessionIdForPanel) ??
		null;
	const missingScriptTypes = useMemo<WorkspaceScriptType[]>(() => {
		if (!selectedSession) {
			return [];
		}

		const scripts: RepoScripts | undefined = repoScriptsQuery.data;
		if (!scripts) {
			return [];
		}

		const missing: WorkspaceScriptType[] = [];
		if (!scripts.setupScript?.trim()) {
			missing.push("setup");
		}
		if (!scripts.runScript?.trim()) {
			missing.push("run");
		}
		return missing;
	}, [repoScriptsQuery.data, selectedSession]);
	const handleInitializeScript = useCallback(
		(scriptType: WorkspaceScriptType) => {
			if (!selectedSessionIdForPanel || !onQueuePendingPromptForSession) {
				return;
			}

			onQueuePendingPromptForSession({
				sessionId: selectedSessionIdForPanel,
				prompt: WORKSPACE_SCRIPT_PROMPTS[scriptType],
			});
		},
		[onQueuePendingPromptForSession, selectedSessionIdForPanel],
	);
	const refreshRolledBackSession = useCallback(
		async (sessionId: string) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [...pathosQueryKeys.sessionMessages(sessionId), "thread"],
				}),
				invalidateWorkspaceQueries(),
			]);
		},
		[invalidateWorkspaceQueries, queryClient],
	);
	const handleRevertMessage = useCallback(
		async (messageId: string) => {
			if (!selectedSessionIdForPanel) return;
			await truncateSessionMessagesAfter(
				selectedSessionIdForPanel,
				messageId,
				true,
			);
			await refreshRolledBackSession(selectedSessionIdForPanel);
		},
		[refreshRolledBackSession, selectedSessionIdForPanel],
	);
	const handleSubmitEditedMessage = useCallback(
		async (messageId: string, prompt: string) => {
			if (!selectedSessionIdForPanel || !onQueuePendingPromptForSession) {
				return;
			}
			await truncateSessionMessagesAfter(
				selectedSessionIdForPanel,
				messageId,
				true,
			);
			await refreshRolledBackSession(selectedSessionIdForPanel);
			onQueuePendingPromptForSession({
				sessionId: selectedSessionIdForPanel,
				prompt,
			});
		},
		[
			onQueuePendingPromptForSession,
			refreshRolledBackSession,
			selectedSessionIdForPanel,
		],
	);
	const handleRedoAssistantMessage = useCallback(
		async (userMessageId: string, prompt: string) => {
			if (!selectedSessionIdForPanel || !onQueuePendingPromptForSession) {
				return;
			}
			await prepareSessionRedoFromUserMessage(
				selectedSessionIdForPanel,
				userMessageId,
			);
			await refreshRolledBackSession(selectedSessionIdForPanel);
			onQueuePendingPromptForSession({
				sessionId: selectedSessionIdForPanel,
				prompt,
				replayUserMessageId: userMessageId,
			});
		},
		[
			onQueuePendingPromptForSession,
			refreshRolledBackSession,
			selectedSessionIdForPanel,
		],
	);

	return (
		<WorkspacePanel
			isShellResizing={isShellResizing}
			workspace={workspace}
			sessions={sessions}
			selectedSessionId={selectedSessionIdForPanel}
			sessionDisplayProviders={sessionDisplayProviders}
			sessionPanes={sessionPanes}
			loadingWorkspace={loadingWorkspace}
			loadingSession={loadingSession}
			refreshingWorkspace={refreshingWorkspace}
			refreshingSession={refreshingSession}
			sending={sending}
			sendingSessionIds={sendingSessionIds}
			interactionRequiredSessionIds={interactionRequiredSessionIds}
			onSelectSession={handleSelectSession}
			onPrefetchSession={handlePrefetchSession}
			onSessionsChanged={handleSessionsChanged}
			onSessionRenamed={handleSessionRenamed}
			onWorkspaceChanged={handleWorkspaceChanged}
			onRequestCloseSession={onRequestCloseSession}
			onCloneProject={onCloneProject}
			onOpenProject={onOpenProject}
			headerActions={headerActions}
			headerLeading={headerLeading}
			newSessionShortcut={getShortcut(settings.shortcuts, "session.new")}
			missingScriptTypes={missingScriptTypes}
			onInitializeScript={handleInitializeScript}
			onRevertMessage={handleRevertMessage}
			onSubmitEditedMessage={handleSubmitEditedMessage}
			onRedoAssistantMessage={handleRedoAssistantMessage}
			changeRequest={workspaceChangeRequest}
		/>
	);
});
