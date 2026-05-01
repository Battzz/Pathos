import { describe, expect, it } from "vitest";
import type { ThreadMessageLike, TodoListPart } from "@/lib/api";
import { findLatestTodoList } from "./use-latest-todo-list";

function todoList(id: string, allCompleted: boolean): TodoListPart {
	return {
		type: "todo-list",
		id,
		items: [
			{ text: "do thing", status: allCompleted ? "completed" : "in_progress" },
			{ text: "do other thing", status: "completed" },
		],
	};
}

function userMsg(text = "hi"): ThreadMessageLike {
	return {
		role: "user",
		content: [{ type: "text", id: `user-${text}`, text }],
	};
}

function assistantMsgWithTodo(part: TodoListPart): ThreadMessageLike {
	return {
		role: "assistant",
		content: [part],
	};
}

describe("findLatestTodoList", () => {
	it("returns null when there are no messages", () => {
		expect(findLatestTodoList([])).toBeNull();
		expect(findLatestTodoList(undefined)).toBeNull();
	});

	it("returns the latest todo list when no user message follows it", () => {
		const list = todoList("a", false);
		const messages = [userMsg("first"), assistantMsgWithTodo(list)];
		expect(findLatestTodoList(messages)).toBe(list);
	});

	it("hides the previous list when the user has sent a new message after it (all completed)", () => {
		const list = todoList("a", true);
		const messages = [
			userMsg("first prompt"),
			assistantMsgWithTodo(list),
			userMsg("follow-up prompt"),
		];
		expect(findLatestTodoList(messages)).toBeNull();
	});

	it("returns the new list when a fresh assistant turn emits one after the user message", () => {
		const stale = todoList("a", true);
		const fresh = todoList("b", false);
		const messages = [
			userMsg("first"),
			assistantMsgWithTodo(stale),
			userMsg("second"),
			assistantMsgWithTodo(fresh),
		];
		expect(findLatestTodoList(messages)).toBe(fresh);
	});

	it("keeps showing the list while the same assistant turn is mid-stream", () => {
		const list = todoList("a", false);
		const messages = [userMsg("kick off"), assistantMsgWithTodo(list)];
		expect(findLatestTodoList(messages)).toBe(list);
	});
});
