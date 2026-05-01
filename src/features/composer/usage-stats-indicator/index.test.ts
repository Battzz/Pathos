import { describe, expect, it } from "vitest";
import type { RateLimitSnapshotDisplay } from "../context-usage-ring/parse";
import { formatRemaining } from ".";

describe("formatRemaining", () => {
	it("prefers the primary 5h window over lower 7d remaining percentages", () => {
		const stats: RateLimitSnapshotDisplay = {
			primary: {
				usedPercent: 20,
				leftPercent: 80,
				label: "5h limit",
				resetsAt: null,
				expired: false,
			},
			secondary: {
				usedPercent: 70,
				leftPercent: 30,
				label: "7d limit",
				resetsAt: null,
				expired: false,
			},
			extraWindows: [],
			notes: [],
		};

		expect(formatRemaining(stats)).toBe("80%");
	});

	it("falls back to other windows when the 5h window is unavailable", () => {
		const stats: RateLimitSnapshotDisplay = {
			primary: null,
			secondary: {
				usedPercent: 70,
				leftPercent: 30,
				label: "7d limit",
				resetsAt: null,
				expired: false,
			},
			extraWindows: [
				{
					id: "extra",
					title: "Extra",
					window: {
						usedPercent: 80,
						leftPercent: 20,
						label: "7d limit",
						resetsAt: null,
						expired: false,
					},
				},
			],
			notes: [],
		};

		expect(formatRemaining(stats)).toBe("20%");
	});
});
