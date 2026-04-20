import { describe, expect, it } from "vitest";
import type { WorkspaceGroup, WorkspaceRow } from "@/lib/api";
import { selectUnreadSessionCount } from "./selector";

function row(id: string, unreadSessionCount?: number): WorkspaceRow {
	return {
		id,
		title: id,
		state: "ready",
		derivedStatus: "in-progress",
		unreadSessionCount,
	};
}

function group(id: string, rows: WorkspaceRow[]): WorkspaceGroup {
	return { id, label: id, tone: "progress", rows };
}

describe("selectUnreadSessionCount", () => {
	it("returns 0 when groups is undefined", () => {
		expect(selectUnreadSessionCount(undefined)).toBe(0);
	});

	it("returns 0 when groups is null", () => {
		expect(selectUnreadSessionCount(null)).toBe(0);
	});

	it("returns 0 when all groups are empty", () => {
		expect(selectUnreadSessionCount([group("a", []), group("b", [])])).toBe(0);
	});

	it("returns 0 when no row has unread sessions", () => {
		expect(
			selectUnreadSessionCount([group("a", [row("ws-1", 0), row("ws-2", 0)])]),
		).toBe(0);
	});

	it("treats missing unreadSessionCount as 0", () => {
		expect(
			selectUnreadSessionCount([group("a", [row("ws-1"), row("ws-2", 3)])]),
		).toBe(3);
	});

	it("sums unreadSessionCount across rows within one group", () => {
		expect(
			selectUnreadSessionCount([
				group("a", [row("ws-1", 1), row("ws-2", 2), row("ws-3", 0)]),
			]),
		).toBe(3);
	});

	it("sums unreadSessionCount across multiple groups", () => {
		expect(
			selectUnreadSessionCount([
				group("progress", [row("ws-1", 2)]),
				group("review", [row("ws-2", 4)]),
				group("done", [row("ws-3", 1)]),
			]),
		).toBe(7);
	});

	it("does not cap the total — macOS handles large values itself", () => {
		const manyRows = Array.from({ length: 150 }, (_, i) => row(`ws-${i}`, 1));
		expect(selectUnreadSessionCount([group("a", manyRows)])).toBe(150);
	});
});
