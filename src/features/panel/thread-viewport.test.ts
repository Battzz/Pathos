import { describe, expect, it } from "vitest";
import {
	collectRowsInWindow,
	findFirstRowEndingAtOrAfter,
	getPaneWidthBucket,
	resolveConversationRowHeight,
	resolvePaneWidthSnapshot,
} from "./thread-viewport";

describe("resolveConversationRowHeight", () => {
	it("keeps the larger estimate for streaming rows until measurement catches up", () => {
		expect(
			resolveConversationRowHeight({
				estimatedHeight: 168,
				measuredHeight: 132,
				streaming: true,
			}),
		).toBe(168);
	});

	it("trusts the measured height for non-streaming rows", () => {
		expect(
			resolveConversationRowHeight({
				estimatedHeight: 168,
				measuredHeight: 132,
				streaming: false,
			}),
		).toBe(132);
	});
});

describe("resolvePaneWidthSnapshot", () => {
	it("keeps the same snapshot for width changes inside the current layout bucket", () => {
		const current = resolvePaneWidthSnapshot(640);

		expect(getPaneWidthBucket(640)).toBe(20);
		expect(resolvePaneWidthSnapshot(647, current)).toBe(current);
	});

	it("returns a new snapshot when width crosses a layout bucket", () => {
		const current = resolvePaneWidthSnapshot(640);
		const next = resolvePaneWidthSnapshot(657, current);

		expect(next).not.toBe(current);
		expect(next).toEqual({ bucket: 21, width: 657 });
	});
});

describe("progressive viewport row windowing", () => {
	const rows = [
		{ top: 0, height: 40, id: "a" },
		{ top: 40, height: 80, id: "b" },
		{ top: 120, height: 60, id: "c" },
		{ top: 180, height: 40, id: "d" },
	];

	it("finds the first row whose bottom reaches the requested offset", () => {
		expect(findFirstRowEndingAtOrAfter(rows, 0)).toBe(0);
		expect(findFirstRowEndingAtOrAfter(rows, 41)).toBe(1);
		expect(findFirstRowEndingAtOrAfter(rows, 180)).toBe(2);
		expect(findFirstRowEndingAtOrAfter(rows, 221)).toBe(4);
	});

	it("collects only rows that intersect the viewport window", () => {
		expect(collectRowsInWindow(rows, 41, 179).map((row) => row.id)).toEqual([
			"b",
			"c",
		]);
	});
});
