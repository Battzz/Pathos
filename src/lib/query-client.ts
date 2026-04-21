import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, QueryClient, queryOptions } from "@tanstack/react-query";
import {
	type ActionKind,
	type AgentProvider,
	DEFAULT_WORKSPACE_GROUPS,
	type DetectedEditor,
	detectInstalledEditors,
	listRepositories,
	listSlashCommands,
	listWorkspaceCandidateDirectories,
	listWorkspaceChangesWithContent,
	listWorkspaceFiles,
	listWorkspaceLinkedDirectories,
	loadAgentModelSections,
	loadArchivedWorkspaces,
	loadAutoCloseActionKinds,
	loadAutoCloseOptInAsked,
	loadSessionAttachments,
	loadSessionThreadMessages,
	loadWorkspaceDetail,
	loadWorkspaceGitActionStatus,
	loadWorkspaceGroups,
	loadWorkspacePrActionStatus,
	loadWorkspaceSessions,
	lookupWorkspacePr,
	type PullRequestInfo,
	type WorkspacePrActionStatus,
} from "./api";

const SESSION_STALE_TIME = 10 * 60_000;
const CHANGES_STALE_TIME = 3_000;
const CHANGES_REFETCH_INTERVAL = 10_000;
const DEFAULT_GC_TIME = 30 * 60_000;
const SESSION_GC_TIME = 60 * 60_000;
const PERSIST_GC_TIME = 24 * 60 * 60_000; // 24h — persisted entries live this long

export const helmorQueryKeys = {
	workspaceGroups: ["workspaceGroups"] as const,
	archivedWorkspaces: ["archivedWorkspaces"] as const,
	repositories: ["repositories"] as const,
	agentModelSections: ["agentModelSections"] as const,
	workspaceDetail: (workspaceId: string) =>
		["workspaceDetail", workspaceId] as const,
	workspaceSessions: (workspaceId: string) =>
		["workspaceSessions", workspaceId] as const,
	sessionMessages: (sessionId: string) =>
		["sessionMessages", sessionId] as const,
	sessionAttachments: (sessionId: string) =>
		["sessionAttachments", sessionId] as const,
	workspaceChanges: (workspaceRootPath: string) =>
		["workspaceChanges", workspaceRootPath] as const,
	workspaceFiles: (workspaceRootPath: string) =>
		["workspaceFiles", workspaceRootPath] as const,
	workspacePr: (workspaceId: string) => ["workspacePr", workspaceId] as const,
	workspaceGitActionStatus: (workspaceId: string) =>
		["workspaceGitActionStatus", workspaceId] as const,
	workspacePrActionStatus: (workspaceId: string) =>
		["workspacePrActionStatus", workspaceId] as const,
	repoScripts: (repoId: string, workspaceId: string | null) =>
		["repoScripts", repoId, workspaceId ?? ""] as const,
	repoPreferences: (repoId: string) => ["repoPreferences", repoId] as const,
	autoCloseActionKinds: ["autoCloseActionKinds"] as const,
	autoCloseOptInAsked: ["autoCloseOptInAsked"] as const,
	detectedEditors: ["detectedEditors"] as const,
	slashCommands: (provider: AgentProvider, workingDirectory: string | null) =>
		["slashCommands", provider, workingDirectory ?? ""] as const,
	workspaceLinkedDirectories: (workspaceId: string) =>
		["workspaceLinkedDirectories", workspaceId] as const,
	workspaceCandidateDirectories: (excludeWorkspaceId: string | null) =>
		["workspaceCandidateDirectories", excludeWorkspaceId ?? ""] as const,
};

export function createHelmorQueryClient() {
	// Replace React Query's default focus listener (browser visibilitychange)
	// with Tauri's native window focus/blur events. This is the official
	// pattern for non-browser environments (cf. React Native AppState in
	// the TanStack Query docs). The focusManager calls `handleFocus(true)`
	// which triggers refetchOnWindowFocus for all queries, respecting each
	// query's own staleTime — local DB queries use staleTime: 0 so they
	// always refetch on focus, while remote GitHub queries keep their
	// staleTime: 30s to avoid hammering the API.
	focusManager.setEventListener((handleFocus) => {
		let unlistenFocus: (() => void) | undefined;
		let unlistenBlur: (() => void) | undefined;

		void import("@tauri-apps/api/event").then(({ listen }) => {
			void listen("tauri://focus", () => handleFocus(true)).then((fn) => {
				unlistenFocus = fn;
			});
			void listen("tauri://blur", () => handleFocus(false)).then((fn) => {
				unlistenBlur = fn;
			});
		});

		return () => {
			unlistenFocus?.();
			unlistenBlur?.();
		};
	});

	return new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: PERSIST_GC_TIME,
				refetchOnReconnect: false,
				refetchOnWindowFocus: true,
				retry: 1,
			},
		},
	});
}

export const helmorQueryPersister = createAsyncStoragePersister({
	storage: window.localStorage,
	key: "helmor-query-cache",
});

export function workspaceGroupsQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceGroups,
		queryFn: loadWorkspaceGroups,
		initialData: DEFAULT_WORKSPACE_GROUPS,
		initialDataUpdatedAt: 0,
		staleTime: 0,
	});
}

export function archivedWorkspacesQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.archivedWorkspaces,
		queryFn: loadArchivedWorkspaces,
		initialData: [],
		initialDataUpdatedAt: 0,
		staleTime: 0,
	});
}

export function repositoriesQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.repositories,
		queryFn: listRepositories,
		initialData: [],
		initialDataUpdatedAt: 0,
		staleTime: 0,
	});
}

export function agentModelSectionsQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.agentModelSections,
		queryFn: loadAgentModelSections,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		retry: 2,
	});
}

export function workspaceDetailQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceDetail(workspaceId),
		queryFn: () => loadWorkspaceDetail(workspaceId),
		staleTime: 0,
	});
}

export function workspaceSessionsQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceSessions(workspaceId),
		queryFn: () => loadWorkspaceSessions(workspaceId),
		staleTime: 0,
	});
}

/** `/add-dir` linked directories, workspace-scoped. */
export function workspaceLinkedDirectoriesQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceLinkedDirectories(workspaceId),
		queryFn: () => listWorkspaceLinkedDirectories(workspaceId),
		staleTime: 0,
	});
}

/**
 * Candidate directories shown as quick-pick suggestions in the /add-dir
 * popup. Staled quickly so newly-created workspaces show up on the next
 * popup open without a manual refresh.
 */
export function workspaceCandidateDirectoriesQueryOptions(
	excludeWorkspaceId: string | null,
) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceCandidateDirectories(excludeWorkspaceId),
		queryFn: () => listWorkspaceCandidateDirectories({ excludeWorkspaceId }),
		staleTime: 0,
	});
}

/** Pipeline-rendered thread messages — ready for direct rendering. */
export function sessionThreadMessagesQueryOptions(sessionId: string) {
	return queryOptions({
		queryKey: [...helmorQueryKeys.sessionMessages(sessionId), "thread"],
		queryFn: () => loadSessionThreadMessages(sessionId),
		gcTime: SESSION_GC_TIME,
		staleTime: SESSION_STALE_TIME,
	});
}

export function sessionAttachmentsQueryOptions(sessionId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.sessionAttachments(sessionId),
		queryFn: () => loadSessionAttachments(sessionId),
		gcTime: SESSION_GC_TIME,
		staleTime: 60_000,
	});
}

export function slashCommandsQueryOptions(
	provider: AgentProvider,
	workingDirectory: string | null,
	repoId: string | null,
) {
	return queryOptions({
		queryKey: helmorQueryKeys.slashCommands(provider, workingDirectory),
		queryFn: () =>
			listSlashCommands({
				provider,
				workingDirectory,
				repoId,
			}),
		// The backend owns slash-command caching and background refresh. Keep
		// the frontend layer as a thin request shell only.
		staleTime: 0,
		gcTime: 0,
		retry: 0,
		refetchOnWindowFocus: false,
	});
}

export function autoCloseActionKindsQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.autoCloseActionKinds,
		queryFn: loadAutoCloseActionKinds,
		initialData: [] as ActionKind[],
		initialDataUpdatedAt: 0,
		staleTime: 60_000,
	});
}

export function autoCloseOptInAskedQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.autoCloseOptInAsked,
		queryFn: loadAutoCloseOptInAsked,
		initialData: [] as ActionKind[],
		initialDataUpdatedAt: 0,
		staleTime: 60_000,
	});
}

/**
 * Installed third-party editors (Cursor, VS Code, JetBrains, terminals, Git GUIs).
 * Detection is cheap but non-trivial — the Rust side stat()'s known app paths and
 * falls back to a single batched `mdfind` for apps in non-standard locations.
 * Cached for 60s so revisiting the dropdown does not re-scan; persisted across
 * app restarts via the localStorage persister so the button shows up instantly
 * on the next launch.
 */
export function detectedEditorsQueryOptions() {
	return queryOptions({
		queryKey: helmorQueryKeys.detectedEditors,
		queryFn: detectInstalledEditors,
		initialData: [] as DetectedEditor[],
		initialDataUpdatedAt: 0,
		staleTime: 60_000,
		gcTime: PERSIST_GC_TIME,
	});
}

// Adaptive refetch interval for workspacePr. Cheap query (~5-10 GraphQL
// points/call) — only carries state/title/isMerged, so tiers are coarse.
// Slow down on terminal PRs to save budget; refetchOnWindowFocus + staleTime
// still guarantee a refresh when the user returns or switches workspace.
export function prRefetchInterval(
	data: PullRequestInfo | null | undefined,
): number {
	if (!data) return 60_000;
	if (data.isMerged || data.state === "MERGED" || data.state === "CLOSED") {
		// Not `false` because this query drives the header badge — a reopen
		// should eventually reflect even if the user never loses focus.
		return 300_000;
	}
	return 60_000;
}

// Adaptive refetch interval for workspacePrActionStatus. Expensive query
// (~20-40 GraphQL points/call) with the richest signal, so tiers are fine:
//   - PR MERGED/CLOSED → stop polling entirely (false). checks/deployments
//     are frozen; focus + invalidate paths remain available for reopens.
//   - remoteState !== "ok" → keep 60s. Don't accelerate on error (avoids
//     hammering GitHub during outages) and don't stop (need to detect the
//     PR coming back).
//   - mergeable === "UNKNOWN" → 5s. GitHub's async mergeability typically
//     resolves within 5-20s; we want to reflect it ASAP.
//   - any check/deployment pending or running → 15s. User is watching CI.
//   - stable OPEN → 60s (unchanged from previous fixed interval).
export function prActionStatusRefetchInterval(
	data: WorkspacePrActionStatus | undefined,
): number | false {
	if (!data) return 60_000;
	if (data.remoteState !== "ok") return 60_000;
	if (
		data.pr?.isMerged ||
		data.pr?.state === "MERGED" ||
		data.pr?.state === "CLOSED"
	) {
		return false;
	}
	if (data.mergeable === "UNKNOWN") return 5_000;
	const hasRunningWork =
		data.checks.some((c) => c.status === "pending" || c.status === "running") ||
		data.deployments.some(
			(d) => d.status === "pending" || d.status === "running",
		);
	if (hasRunningWork) return 15_000;
	return 60_000;
}

/**
 * Current PR for a workspace's branch. Drives the commit button's resting
 * mode (create-pr → merge → merged) and the "Git · PR #xxx" header badge.
 * Adaptive polling: 60s while the PR is OPEN, 5min once terminal
 * (MERGED/CLOSED) to save GraphQL budget. Returns `null` when no PR is
 * found or lookup is unavailable.
 */
export function workspacePrQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspacePr(workspaceId),
		queryFn: () => lookupWorkspacePr(workspaceId),
		staleTime: 30_000,
		gcTime: DEFAULT_GC_TIME,
		refetchOnWindowFocus: true,
		refetchInterval: (query) => prRefetchInterval(query.state.data),
		retry: 0,
	});
}

export function workspaceGitActionStatusQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceGitActionStatus(workspaceId),
		queryFn: () => loadWorkspaceGitActionStatus(workspaceId),
		staleTime: CHANGES_STALE_TIME,
		gcTime: DEFAULT_GC_TIME,
		refetchOnWindowFocus: true,
		refetchInterval: 10_000,
		retry: 0,
	});
}

/**
 * PR mergeable state, review decision, checks and deployments. Drives the
 * inspector's git/review/checks rows and the commit button's merge
 * pre-validation. Adaptive polling by PR hotness (see
 * {@link prActionStatusRefetchInterval}) — 5s while GitHub computes
 * mergeability, 15s while CI is in flight, 60s stable, stopped on terminal.
 */
export function workspacePrActionStatusQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspacePrActionStatus(workspaceId),
		queryFn: () => loadWorkspacePrActionStatus(workspaceId),
		staleTime: 30_000,
		gcTime: DEFAULT_GC_TIME,
		refetchInterval: (query) => prActionStatusRefetchInterval(query.state.data),
		retry: 0,
	});
}

export function workspaceChangesQueryOptions(workspaceRootPath: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceChanges(workspaceRootPath),
		queryFn: () => listWorkspaceChangesWithContent(workspaceRootPath),
		staleTime: CHANGES_STALE_TIME,
		refetchOnWindowFocus: true,
		refetchInterval: CHANGES_REFETCH_INTERVAL,
	});
}

/**
 * Full workspace file list for the @-mention picker. The popup is hidden
 * until this resolves; on error we fall back to an empty list and the
 * popup never opens (no UI breakage). Cached aggressively because the
 * walk is bounded but not free, and the file set rarely changes within
 * a single composer session.
 */
export function workspaceFilesQueryOptions(workspaceRootPath: string) {
	return queryOptions({
		queryKey: helmorQueryKeys.workspaceFiles(workspaceRootPath),
		queryFn: () => listWorkspaceFiles(workspaceRootPath),
		staleTime: 60_000,
		gcTime: DEFAULT_GC_TIME,
		retry: 0,
	});
}
