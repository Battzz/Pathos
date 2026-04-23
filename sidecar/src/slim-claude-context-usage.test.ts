import { describe, expect, it } from "bun:test";
import { slimClaudeContextUsage } from "./claude-session-manager";

describe("slimClaudeContextUsage", () => {
	it("keeps the five fields the frontend parses", () => {
		const slim = slimClaudeContextUsage({
			totalTokens: 12345,
			maxTokens: 200000,
			percentage: 6,
			rawMaxTokens: 200000,
			model: "claude-opus-4",
			autoCompactThreshold: 160000,
			isAutoCompactEnabled: true,
			autocompactSource: "model",
			gridRows: [[{ filler: true }]],
			memoryFiles: [{ path: "/x", type: "User", tokens: 10 }],
			mcpTools: [{ name: "tool", serverName: "s", tokens: 1 }],
			systemTools: [{ name: "Bash", tokens: 100 }],
			skills: { totalSkills: 1, includedSkills: 1, tokens: 50 },
			messageBreakdown: { toolCallTokens: 1 },
			apiUsage: { input_tokens: 1, output_tokens: 2 },
			categories: [
				{ name: "System tools", tokens: 10000, color: "inactive" },
				{ name: "Messages", tokens: 2345, color: "purple" },
			],
		});

		expect(slim).toEqual({
			totalTokens: 12345,
			maxTokens: 200000,
			percentage: 6,
			isAutoCompactEnabled: true,
			categories: [
				{ name: "System tools", tokens: 10000, color: "inactive" },
				{ name: "Messages", tokens: 2345, color: "purple" },
			],
		});
		expect(Object.keys(slim).sort()).toEqual([
			"categories",
			"isAutoCompactEnabled",
			"maxTokens",
			"percentage",
			"totalTokens",
		]);
	});

	it("defaults isAutoCompactEnabled to false when missing", () => {
		const slim = slimClaudeContextUsage({
			totalTokens: 0,
			maxTokens: 100,
			percentage: 0,
			categories: [],
		});
		expect(slim.isAutoCompactEnabled).toBe(false);
	});

	it("filters the synthetic 'Free space' category", () => {
		const slim = slimClaudeContextUsage({
			totalTokens: 100,
			maxTokens: 1000,
			percentage: 10,
			categories: [
				{ name: "Free space", tokens: 900, color: "promptBorder" },
				{ name: "Messages", tokens: 100, color: "purple" },
			],
		});
		expect(slim.categories.map((c) => c.name)).toEqual(["Messages"]);
	});

	it("drops malformed category entries instead of crashing", () => {
		const slim = slimClaudeContextUsage({
			totalTokens: 0,
			maxTokens: 100,
			percentage: 0,
			categories: [
				{ name: "OK", tokens: 5, color: "x" },
				null,
				"junk",
				{ tokens: 5 },
				{ name: "Messages" },
				{ name: "NoColor", tokens: 7 },
			],
		});
		// Last entry has no color string but a valid name+tokens — color
		// defaults to "" so the row still survives.
		expect(slim.categories).toEqual([
			{ name: "OK", tokens: 5, color: "x" },
			{ name: "NoColor", tokens: 7, color: "" },
		]);
	});

	it("substantially reduces serialized size vs the raw SDK response", () => {
		// Simulates the worst-offender shape: gridRows is a 20×20 grid, mcpTools
		// has 50 entries. Empirically the live DB rows were ~33KB; we want
		// the slim form to land in the high-hundreds of bytes.
		const fatGrid = Array.from({ length: 20 }, () =>
			Array.from({ length: 20 }, () => ({
				color: "promptBorder",
				isFilled: true,
				categoryName: "Free space",
				tokens: 999999,
				percentage: 99,
				squareFullness: 1,
			})),
		);
		const fatMcp = Array.from({ length: 50 }, (_, i) => ({
			name: `tool_${i}_with_a_reasonably_long_name`,
			serverName: "some_mcp_server",
			tokens: 250,
			isLoaded: false,
		}));
		const raw = {
			totalTokens: 50000,
			maxTokens: 1000000,
			percentage: 5,
			rawMaxTokens: 1000000,
			gridRows: fatGrid,
			mcpTools: fatMcp,
			memoryFiles: [],
			systemTools: [],
			skills: { totalSkills: 30, includedSkills: 30, tokens: 6000 },
			categories: [
				{ name: "System tools", tokens: 10000, color: "inactive" },
				{ name: "Messages", tokens: 40000, color: "purple" },
				{ name: "Free space", tokens: 950000, color: "promptBorder" },
			],
		};
		const rawSize = JSON.stringify(raw).length;
		const slimSize = JSON.stringify(slimClaudeContextUsage(raw)).length;
		// Hard guard: slim must be at least 10× smaller for this fixture.
		expect(slimSize * 10).toBeLessThan(rawSize);
		expect(slimSize).toBeLessThan(500);
	});
});
