import { describe, expect, it } from "vitest";
import {
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
