import { describe, expect, it } from "bun:test";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { snapshotContextUsage } from "./claude-session-manager";
import { createSidecarEmitter } from "./emitter";

function fakeQuery(getContextUsage: () => Promise<unknown>): Query {
	return { getContextUsage } as unknown as Query;
}

describe("snapshotContextUsage", () => {
	it("emits a slimmed contextUsageUpdated when SDK returns synchronously", async () => {
		// SDK responses include 30+KB of fields we never read (gridRows,
		// mcpTools, …); snapshotContextUsage must run them through
		// `slimClaudeContextUsage` before emit.
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));
		const fatMeta = {
			totalTokens: 12,
			maxTokens: 100,
			percentage: 12,
			gridRows: [[{ filler: true }]],
			mcpTools: [{ name: "noisy", tokens: 1 }],
			categories: [
				{ name: "Free space", tokens: 88, color: "promptBorder" },
				{ name: "Messages", tokens: 12, color: "purple" },
			],
		};

		await snapshotContextUsage(
			fakeQuery(async () => fatMeta),
			emitter,
			"req-1",
			"session-1",
		);

		expect(events).toHaveLength(1);
		const event = events[0] as { meta: string };
		const slim = JSON.parse(event.meta);
		expect(slim).toEqual({
			totalTokens: 12,
			maxTokens: 100,
			percentage: 12,
			isAutoCompactEnabled: false,
			categories: [{ name: "Messages", tokens: 12, color: "purple" }],
		});
	});

	it("emits nothing and returns within timeout when SDK hangs forever", async () => {
		// Critical contract: end/aborted must NOT be hostage to a hung SDK
		// control message. The cap is 1500ms; we allow up to 2500ms slack
		// for CI scheduler jitter.
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));

		const t0 = Date.now();
		await snapshotContextUsage(
			fakeQuery(() => new Promise(() => {})),
			emitter,
			"req-2",
			"session-2",
		);
		const elapsed = Date.now() - t0;

		expect(elapsed).toBeLessThan(2500);
		expect(elapsed).toBeGreaterThanOrEqual(1400);
		expect(events).toHaveLength(0);
	});

	it("emits nothing when SDK rejects (e.g. half-closed Query on abort)", async () => {
		const events: object[] = [];
		const emitter = createSidecarEmitter((e) => events.push(e));

		await snapshotContextUsage(
			fakeQuery(async () => {
				throw new Error("query closed");
			}),
			emitter,
			"req-3",
			"session-3",
		);

		expect(events).toHaveLength(0);
	});
});
