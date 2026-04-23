import { describe, expect, it } from "vitest";
import {
	formatTokens,
	parseCodexRateLimits,
	parseContextUsageMeta,
	ringTier,
} from "./parse";

describe("parseContextUsageMeta", () => {
	it("returns null for empty / null / unparseable input", () => {
		expect(parseContextUsageMeta(null)).toBeNull();
		expect(parseContextUsageMeta("")).toBeNull();
		expect(parseContextUsageMeta("not json")).toBeNull();
		expect(parseContextUsageMeta("[]")).toBeNull();
		expect(parseContextUsageMeta("{}")).toBeNull();
	});

	it("parses Claude shape and filters Free space", () => {
		const display = parseContextUsageMeta(
			JSON.stringify({
				totalTokens: 20000,
				maxTokens: 200000,
				percentage: 10,
				categories: [
					{ name: "Free space", tokens: 180000 },
					{ name: "Messages", tokens: 12000 },
					{ name: "System tools", tokens: 5000 },
					{ name: "Memory files", tokens: 3000 },
				],
			}),
		);
		expect(display).not.toBeNull();
		if (!display || display.source !== "claude")
			throw new Error("expected claude");
		expect(display.used).toBe(20000);
		expect(display.max).toBe(200000);
		expect(display.percentage).toBe(10);
		// Free space is filtered, the rest is sorted desc by tokens
		expect(display.categories.map((c) => c.name)).toEqual([
			"Messages",
			"System tools",
			"Memory files",
		]);
		// Per-category percentage is computed against max
		expect(display.categories[0].percentage).toBeCloseTo(6);
	});

	it("falls back to computed percentage when SDK omits it", () => {
		const display = parseContextUsageMeta(
			JSON.stringify({
				totalTokens: 50,
				maxTokens: 200,
				categories: [{ name: "Messages", tokens: 50 }],
			}),
		);
		if (!display || display.source !== "claude")
			throw new Error("expected claude");
		expect(display.percentage).toBe(25);
	});

	it("parses Codex shape and uses `last` (not `total`) for context fill", () => {
		// Critical: Codex's `total.*` is THREAD-CUMULATIVE billed tokens —
		// each turn re-sends history and gets it counted again. The actual
		// context size after the last turn is `last.totalTokens`. Mistaking
		// `total` for current fill makes a few turns look like a near-full
		// window even when real usage is small.
		const display = parseContextUsageMeta(
			JSON.stringify({
				total: {
					totalTokens: 937124,
					inputTokens: 928536,
					cachedInputTokens: 738560,
					outputTokens: 8588,
					reasoningOutputTokens: 1721,
				},
				last: {
					totalTokens: 80467,
					inputTokens: 79707,
					cachedInputTokens: 79488,
					outputTokens: 760,
					reasoningOutputTokens: 0,
				},
				modelContextWindow: 950000,
			}),
		);
		if (!display || display.source !== "codex")
			throw new Error("expected codex");
		// `used` MUST come from `last`, not `total`.
		expect(display.used).toBe(80467);
		expect(display.max).toBe(950000);
		expect(display.percentage).toBeCloseTo(8.47, 2);
		expect(display.last).toEqual({
			total: 80467,
			input: 79707,
			cachedInput: 79488,
			output: 760,
			reasoningOutput: 0,
		});
	});

	it("Codex: single-turn thread (total === last) renders identically", () => {
		// Sanity check — for a fresh thread with only one turn, total and
		// last carry the same numbers, and our `last`-based calculation
		// matches what a `total`-based one would have produced.
		const breakdown = {
			totalTokens: 19868,
			inputTokens: 19842,
			cachedInputTokens: 2432,
			outputTokens: 26,
			reasoningOutputTokens: 19,
		};
		const display = parseContextUsageMeta(
			JSON.stringify({
				total: breakdown,
				last: breakdown,
				modelContextWindow: 950000,
			}),
		);
		if (!display || display.source !== "codex")
			throw new Error("expected codex");
		expect(display.used).toBe(19868);
		expect(display.percentage).toBeCloseTo(2.09, 2);
	});

	it("Codex: falls back to `total` when `last` is missing", () => {
		// Defensive — protocol contract has `last` non-optional, but if
		// the field disappears for any reason we still want a sensible
		// number rather than 0.
		const display = parseContextUsageMeta(
			JSON.stringify({
				total: {
					totalTokens: 12,
					inputTokens: 10,
					cachedInputTokens: 0,
					outputTokens: 2,
					reasoningOutputTokens: 0,
				},
				modelContextWindow: 100,
			}),
		);
		if (!display || display.source !== "codex")
			throw new Error("expected codex");
		expect(display.used).toBe(12);
		expect(display.percentage).toBe(12);
	});

	it("returns 0 percentage when max is 0", () => {
		const display = parseContextUsageMeta(
			JSON.stringify({
				total: {
					totalTokens: 50,
					inputTokens: 50,
					cachedInputTokens: 0,
					outputTokens: 0,
					reasoningOutputTokens: 0,
				},
				last: {
					totalTokens: 50,
					inputTokens: 50,
					cachedInputTokens: 0,
					outputTokens: 0,
					reasoningOutputTokens: 0,
				},
				modelContextWindow: 0,
			}),
		);
		if (!display) throw new Error("expected display");
		expect(display.percentage).toBe(0);
	});

	it("returns null when neither shape matches", () => {
		// Has `total` object but no `modelContextWindow` → not Codex.
		// Has no `categories` array → not Claude.
		expect(
			parseContextUsageMeta(JSON.stringify({ total: { totalTokens: 5 } })),
		).toBeNull();
	});

	describe("clamping (used <= max, percentage <= 100)", () => {
		// SDK can briefly report >100% during autocompact transitions when
		// maxTokens shifts mid-flight. The ring must never render >100%.
		it("clamps Claude used + percentage", () => {
			const display = parseContextUsageMeta(
				JSON.stringify({
					totalTokens: 250000,
					maxTokens: 200000,
					percentage: 125,
					categories: [{ name: "Messages", tokens: 200000 }],
				}),
			);
			if (!display || display.source !== "claude") {
				throw new Error("expected claude");
			}
			expect(display.used).toBe(200000);
			expect(display.percentage).toBe(100);
		});

		it("clamps Codex used + percentage", () => {
			// Pathological: last.totalTokens > modelContextWindow.
			const display = parseContextUsageMeta(
				JSON.stringify({
					total: {
						totalTokens: 1100000,
						inputTokens: 1100000,
						cachedInputTokens: 0,
						outputTokens: 0,
						reasoningOutputTokens: 0,
					},
					last: {
						totalTokens: 1100000,
						inputTokens: 1100000,
						cachedInputTokens: 0,
						outputTokens: 0,
						reasoningOutputTokens: 0,
					},
					modelContextWindow: 1000000,
				}),
			);
			if (!display || display.source !== "codex") {
				throw new Error("expected codex");
			}
			expect(display.used).toBe(1000000);
			expect(display.percentage).toBe(100);
			// Underlying breakdown not clamped — only the displayed top-line.
			expect(display.last.total).toBe(1100000);
		});
	});

	describe("autoCompacts", () => {
		it("Claude: surfaces isAutoCompactEnabled", () => {
			const display = parseContextUsageMeta(
				JSON.stringify({
					totalTokens: 100,
					maxTokens: 1000,
					percentage: 10,
					isAutoCompactEnabled: true,
					categories: [],
				}),
			);
			if (!display || display.source !== "claude") {
				throw new Error("expected claude");
			}
			expect(display.autoCompacts).toBe(true);
		});

		it("Claude: defaults to false when field missing", () => {
			const display = parseContextUsageMeta(
				JSON.stringify({
					totalTokens: 100,
					maxTokens: 1000,
					percentage: 10,
					categories: [],
				}),
			);
			if (!display || display.source !== "claude") {
				throw new Error("expected claude");
			}
			expect(display.autoCompacts).toBe(false);
		});
	});
});

describe("formatTokens", () => {
	it.each([
		[0, "0"],
		[Number.NaN, "0"],
		[-5, "0"],
		[42, "42"],
		[999, "999"],
		[1_000, "1.0k"],
		[12_345, "12.3k"],
		[1_000_000, "1.0M"],
		[2_500_000, "2.5M"],
	])("%s → %s", (input, expected) => {
		expect(formatTokens(input)).toBe(expected);
	});
});

describe("parseCodexRateLimits", () => {
	const NOW = 1_777_000_000;

	it("returns null for empty / unparseable / shapeless input", () => {
		expect(parseCodexRateLimits(null)).toBeNull();
		expect(parseCodexRateLimits("")).toBeNull();
		expect(parseCodexRateLimits("not json")).toBeNull();
		expect(parseCodexRateLimits("{}")).toBeNull();
	});

	it("parses both windows with labels and reset times", () => {
		const display = parseCodexRateLimits(
			JSON.stringify({
				primary: {
					usedPercent: 27,
					windowDurationMins: 300, // 5h
					resetsAt: NOW + 3600,
				},
				secondary: {
					usedPercent: 27,
					windowDurationMins: 10080, // 7d
					resetsAt: NOW + 86400,
				},
			}),
			NOW,
		);
		expect(display).not.toBeNull();
		expect(display?.primary).toEqual({
			usedPercent: 27,
			leftPercent: 73,
			label: "5h limit",
			resetsAt: NOW + 3600,
			expired: false,
		});
		expect(display?.secondary?.label).toBe("7d limit");
		expect(display?.secondary?.expired).toBe(false);
	});

	it("marks expired windows when resetsAt is in the past", () => {
		const display = parseCodexRateLimits(
			JSON.stringify({
				primary: {
					usedPercent: 50,
					windowDurationMins: 300,
					resetsAt: NOW - 1,
				},
				secondary: null,
			}),
			NOW,
		);
		expect(display?.primary?.expired).toBe(true);
		expect(display?.secondary).toBeNull();
	});

	it("clamps usedPercent into 0-100 and computes leftPercent", () => {
		const display = parseCodexRateLimits(
			JSON.stringify({
				primary: { usedPercent: -10, windowDurationMins: 60 },
				secondary: { usedPercent: 150, windowDurationMins: 60 },
			}),
			NOW,
		);
		expect(display?.primary?.usedPercent).toBe(0);
		expect(display?.primary?.leftPercent).toBe(100);
		expect(display?.secondary?.usedPercent).toBe(100);
		expect(display?.secondary?.leftPercent).toBe(0);
	});

	it("returns null when neither window is present", () => {
		expect(
			parseCodexRateLimits(
				JSON.stringify({ primary: null, secondary: null }),
				NOW,
			),
		).toBeNull();
	});

	it("falls back to null label when windowDurationMins is missing", () => {
		const display = parseCodexRateLimits(
			JSON.stringify({
				primary: { usedPercent: 5 },
				secondary: null,
			}),
			NOW,
		);
		expect(display?.primary?.label).toBeNull();
	});
});

describe("ringTier", () => {
	it.each([
		[0, "default"],
		[59.99, "default"],
		[60, "warning"],
		[79.99, "warning"],
		[80, "danger"],
		[100, "danger"],
	])("%s%% → %s", (input, expected) => {
		expect(ringTier(input)).toBe(expected);
	});
});
