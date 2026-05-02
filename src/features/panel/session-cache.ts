import type { QueryClient } from "@tanstack/react-query";
import type {
	ActionKind,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";

export function buildOptimisticSession(
	workspaceId: string,
	sessionId: string,
	createdAt: string,
	options: {
		title?: string;
		model?: string | null;
		actionKind?: ActionKind | null;
	} = {},
): WorkspaceSessionSummary {
	return {
		id: sessionId,
		workspaceId,
		title: options.title ?? "Untitled",
		agentType: null,
		status: "idle",
		model: options.model ?? null,
		permissionMode: "default",
		providerSessionId: null,
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt,
		updatedAt: createdAt,
		lastUserMessageAt: null,
		isHidden: false,
		actionKind: options.actionKind ?? null,
		active: true,
	};
}

type SeedNewSessionInCacheOptions = {
	queryClient: QueryClient;
	workspaceId: string;
	sessionId: string;
	workspace?: WorkspaceDetail | null;
	existingSessions?: WorkspaceSessionSummary[];
	createdAt?: string;
	title?: string;
	model?: string | null;
	actionKind?: ActionKind | null;
};

export function seedNewSessionInCache({
	queryClient,
	workspaceId,
	sessionId,
	workspace = null,
	existingSessions,
	createdAt = new Date().toISOString(),
	title,
	model,
	actionKind,
}: SeedNewSessionInCacheOptions): WorkspaceSessionSummary {
	const optimisticSession = buildOptimisticSession(
		workspaceId,
		sessionId,
		createdAt,
		{ title, model, actionKind },
	);

	queryClient.setQueryData(
		pathosQueryKeys.workspaceDetail(workspaceId),
		(current: WorkspaceDetail | null | undefined) => {
			const base = current ?? workspace;
			if (!base) {
				return current;
			}

			return {
				...base,
				activeSessionId: sessionId,
				activeSessionTitle: optimisticSession.title,
				activeSessionAgentType: null,
				activeSessionStatus: "idle",
				sessionCount:
					base.activeSessionId === sessionId
						? base.sessionCount
						: base.sessionCount + 1,
			};
		},
	);
	queryClient.setQueryData(
		pathosQueryKeys.workspaceSessions(workspaceId),
		(current: WorkspaceSessionSummary[] | undefined) => {
			const resolvedSessions = current ?? existingSessions ?? [];
			if (resolvedSessions.some((session) => session.id === sessionId)) {
				return resolvedSessions.map((session) => ({
					...session,
					active: session.id === sessionId,
				}));
			}

			return [
				...resolvedSessions.map((session) => ({
					...session,
					active: false,
				})),
				optimisticSession,
			];
		},
	);
	queryClient.setQueryData(
		[...pathosQueryKeys.sessionMessages(sessionId), "thread"],
		[],
	);

	return optimisticSession;
}
