import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ThreadMessageLike, TodoListPart } from "@/lib/api";
import { sessionThreadMessagesQueryOptions } from "@/lib/query-client";

function findLatestTodoList(
	messages: readonly ThreadMessageLike[] | undefined,
): TodoListPart | null {
	if (!messages || messages.length === 0) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!message) continue;
		const parts = message.content;
		for (let j = parts.length - 1; j >= 0; j--) {
			const part = parts[j];
			if (part && part.type === "todo-list") {
				return part;
			}
		}
	}
	return null;
}

/** Returns the most recent `TodoListPart` in the displayed session, or null. */
export function useLatestTodoList(
	sessionId: string | null,
): TodoListPart | null {
	const { data: messages } = useQuery({
		...sessionThreadMessagesQueryOptions(sessionId ?? ""),
		enabled: Boolean(sessionId),
	});
	return useMemo(() => findLatestTodoList(messages), [messages]);
}
