import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ThreadMessageLike, TodoListPart } from "@/lib/api";
import { sessionThreadMessagesQueryOptions } from "@/lib/query-client";

function isTodoListComplete(part: TodoListPart): boolean {
	return (
		part.items.length > 0 && part.items.every((i) => i.status === "completed")
	);
}

/**
 * Returns the most recent `todo-list` content part in the thread. A completed
 * list is hidden after the user sends the next prompt; unfinished lists remain
 * pinned until a newer list updates them or completes.
 */
export function findLatestTodoList(
	messages: readonly ThreadMessageLike[] | undefined,
): TodoListPart | null {
	if (!messages || messages.length === 0) return null;

	let latestUserIdx = -1;
	let latestTodo: { idx: number; part: TodoListPart } | null = null;

	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!message) continue;

		if (latestUserIdx < 0 && message.role === "user") {
			latestUserIdx = i;
		}

		if (!latestTodo) {
			const parts = message.content;
			for (let j = parts.length - 1; j >= 0; j--) {
				const part = parts[j];
				if (part && part.type === "todo-list") {
					latestTodo = { idx: i, part };
					break;
				}
			}
		}

		if (latestUserIdx >= 0 && latestTodo) break;
	}

	if (!latestTodo) return null;
	if (latestUserIdx > latestTodo.idx && isTodoListComplete(latestTodo.part)) {
		return null;
	}
	return latestTodo.part;
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
