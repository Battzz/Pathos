import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ThreadMessageLike, WorkspaceSessionSummary } from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";
import type { PresentedSessionPane } from "./thread-viewport";

const MAX_RETAINED_SESSION_PANES = 2;

function arraysEqual(left: readonly string[], right: readonly string[]) {
	if (left.length !== right.length) {
		return false;
	}
	return left.every((value, index) => value === right[index]);
}

type UseSessionPanesArgs = {
	activeMessages: ThreadMessageLike[];
	activeMessagesLoaded: boolean;
	activeSessionId: string | null;
	queryClient: QueryClient;
	sending: boolean;
	sendingSessionIds?: Set<string>;
	sessions: WorkspaceSessionSummary[];
};

export function useSessionPanes({
	activeMessages,
	activeMessagesLoaded,
	activeSessionId,
	queryClient,
	sending,
	sendingSessionIds,
	sessions,
}: UseSessionPanesArgs): PresentedSessionPane[] {
	const sessionIds = useMemo(
		() => new Set(sessions.map((session) => session.id)),
		[sessions],
	);
	const [recentSessionIds, setRecentSessionIds] = useState<string[]>([]);

	useEffect(() => {
		if (!activeSessionId || !activeMessagesLoaded) {
			return;
		}

		setRecentSessionIds((current) => {
			const next = [
				activeSessionId,
				...current.filter(
					(sessionId) =>
						sessionId !== activeSessionId && sessionIds.has(sessionId),
				),
			].slice(0, MAX_RETAINED_SESSION_PANES);

			return arraysEqual(current, next) ? current : next;
		});
	}, [activeMessagesLoaded, activeSessionId, sessionIds]);

	const paneSessionIds = useMemo(() => {
		const ordered = activeSessionId
			? [
					activeSessionId,
					...recentSessionIds.filter(
						(sessionId) => sessionId !== activeSessionId,
					),
				]
			: recentSessionIds;

		return ordered
			.filter((sessionId) => sessionIds.has(sessionId))
			.slice(0, MAX_RETAINED_SESSION_PANES);
	}, [activeSessionId, recentSessionIds, sessionIds]);

	return useMemo(
		() =>
			paneSessionIds
				.map((sessionId): PresentedSessionPane | null => {
					const isActive = sessionId === activeSessionId;
					const messages = isActive
						? activeMessagesLoaded
							? activeMessages
							: undefined
						: queryClient.getQueryData<ThreadMessageLike[]>([
								...pathosQueryKeys.sessionMessages(sessionId),
								"thread",
							]);

					if (messages === undefined) {
						return null;
					}

					return {
						sessionId,
						messages,
						sending:
							sendingSessionIds?.has(sessionId) ?? (isActive ? sending : false),
						hasLoaded: true,
						presentationState: isActive ? "presented" : "cached",
					};
				})
				.filter((pane): pane is PresentedSessionPane => pane !== null),
		[
			activeMessages,
			activeMessagesLoaded,
			activeSessionId,
			paneSessionIds,
			queryClient,
			sending,
			sendingSessionIds,
		],
	);
}
