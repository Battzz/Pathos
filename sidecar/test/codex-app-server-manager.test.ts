import { beforeEach, describe, expect, mock, test } from "bun:test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createSidecarEmitter, type SidecarEmitter } from "../src/emitter.js";

process.env.PATHOS_LOG_DIR = resolve(tmpdir(), "pathos-sidecar-test-logs");

type RequestRecord = {
	method: string;
	params: unknown;
};

type ResponseRecord = {
	requestId: string | number;
	result: unknown;
};

const serverState = {
	requests: [] as RequestRecord[],
	responses: [] as ResponseRecord[],
	onNotification: null as
		| null
		| ((notification: { method: string; params?: unknown }) => void),
	onRequest: null as
		| null
		| ((request: {
				id: string | number;
				method: string;
				params?: unknown;
		  }) => void | Promise<void>),
	/** Optional hook tests use to inject extra notifications between
	 *  `turn/started` and `turn/completed` (e.g. `thread/tokenUsage/updated`). */
	beforeTurnCompleted: null as null | (() => void),
};
const gitAccessState = {
	directories: [] as string[],
};

class MockCodexAppServer {
	killed = false;

	async sendRequest(method: string, params: unknown): Promise<unknown> {
		serverState.requests.push({ method, params });

		if (method === "initialize") return {};
		if (method === "thread/start") {
			return { thread: { id: "thread-1" } };
		}
		if (method === "turn/start") {
			queueMicrotask(() => {
				serverState.onNotification?.({
					method: "turn/started",
					params: { turn: { id: "turn-1" } },
				});
				serverState.beforeTurnCompleted?.();
				serverState.onNotification?.({
					method: "turn/completed",
					params: { turn: { id: "turn-1" } },
				});
			});
			return {};
		}
		return {};
	}

	writeNotification(_method: string, _params?: unknown): void {}
	setHandlers(
		onNotification: (notification: {
			method: string;
			params?: unknown;
		}) => void,
		onRequest: (request: {
			id: string | number;
			method: string;
			params?: unknown;
		}) => void | Promise<void>,
	): void {
		serverState.onNotification = onNotification;
		serverState.onRequest = onRequest;
	}

	setActiveRequestId(_id: string): void {}

	sendResponse(requestId: string | number, result: unknown): void {
		serverState.responses.push({ requestId, result });
	}
	kill(): void {
		this.killed = true;
	}
}

mock.module("../src/codex-app-server.js", () => ({
	CodexAppServer: MockCodexAppServer,
}));

mock.module("../src/git-access.js", () => ({
	resolveGitAccessDirectories: async () => [...gitAccessState.directories],
}));

const { CodexAppServerManager } = await import(
	"../src/codex-app-server-manager.js"
);

describe("CodexAppServerManager", () => {
	let emitter: SidecarEmitter;

	beforeEach(() => {
		serverState.requests = [];
		serverState.responses = [];
		serverState.onNotification = null;
		serverState.onRequest = null;
		serverState.beforeTurnCompleted = null;
		gitAccessState.directories = [];
		emitter = createSidecarEmitter(() => {});
	});

	test("returns the hardcoded model list", async () => {
		const manager = new CodexAppServerManager();

		const models = await manager.listModels();

		expect(models).toHaveLength(6);
		expect(models).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "gpt-5.5",
					supportsFastMode: true,
				}),
				expect.objectContaining({
					id: "gpt-5.4",
					supportsFastMode: true,
				}),
				expect.objectContaining({
					id: "gpt-5.4-mini",
					supportsFastMode: true,
				}),
			]),
		);
		expect(serverState.requests).toEqual([]);
	});

	test("forwards service tier when fast mode is enabled for a codex model", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-fast-codex",
			{
				sessionId: "session-1",
				prompt: "hello",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: undefined,
				effortLevel: "high",
				fastMode: true,
			},
			emitter,
		);

		const threadStart = serverState.requests.find(
			(request) => request.method === "thread/start",
		);
		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);

		expect(threadStart?.params).toEqual(
			expect.objectContaining({ serviceTier: "fast" }),
		);
		expect(turnStart?.params).toEqual(
			expect.objectContaining({ serviceTier: "fast" }),
		);
	});

	test("rolls back the live Codex thread by turn count", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-rollback-seed",
			{
				sessionId: "session-1",
				prompt: "hello",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: undefined,
				effortLevel: undefined,
				fastMode: false,
			},
			emitter,
		);

		await manager.rollbackSession("session-1", 2);

		expect(serverState.requests).toContainEqual({
			method: "thread/rollback",
			params: {
				threadId: "thread-1",
				numTurns: 2,
			},
		});
	});

	test("plan mode with additionalDirectories sets sandboxPolicy writableRoots including cwd", async () => {
		const manager = new CodexAppServerManager();
		gitAccessState.directories = ["/git/worktree-meta", "/git/common"];

		await manager.sendMessage(
			"REQ-plan-writable",
			{
				sessionId: "session-plan",
				prompt: "hi",
				model: "gpt-5.4",
				cwd: "/tmp/workspace",
				resume: undefined,
				permissionMode: "plan",
				effortLevel: "medium",
				fastMode: false,
				// Include cwd explicitly to verify dedupe, and a duplicate
				// `/tmp/a` to verify we keep the first occurrence only.
				additionalDirectories: ["/tmp/workspace", "/tmp/a", "/tmp/a", "/tmp/b"],
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);

		expect(turnStart?.params).toEqual(
			expect.objectContaining({
				sandboxPolicy: {
					type: "workspaceWrite",
					writableRoots: [
						"/tmp/workspace",
						"/tmp/a",
						"/tmp/b",
						"/git/worktree-meta",
						"/git/common",
					],
					networkAccess: false,
				},
			}),
		);
	});

	test("plan mode without additionalDirectories sets sandboxPolicy for cwd", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-plan-noextras",
			{
				sessionId: "session-plan-noextras",
				prompt: "hi",
				model: "gpt-5.4",
				cwd: "/tmp/workspace",
				resume: undefined,
				permissionMode: "plan",
				effortLevel: "medium",
				fastMode: false,
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);

		expect(turnStart?.params).toEqual(
			expect.objectContaining({
				sandboxPolicy: {
					type: "workspaceWrite",
					writableRoots: ["/tmp/workspace"],
					networkAccess: false,
				},
			}),
		);
	});

	test("non-plan modes restore dangerFullAccess sandboxPolicy", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-bypass-noop",
			{
				sessionId: "session-bypass",
				prompt: "hi",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: "bypassPermissions",
				effortLevel: "medium",
				fastMode: false,
				additionalDirectories: ["/tmp/a"],
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);

		expect(turnStart?.params).toEqual(
			expect.objectContaining({
				sandboxPolicy: {
					type: "dangerFullAccess",
				},
			}),
		);
	});

	test("bypassPermissions auto-accepts Codex approval requests without emitting a permission prompt", async () => {
		const manager = new CodexAppServerManager();
		const captured: Array<Record<string, unknown>> = [];
		emitter = createSidecarEmitter((event) => {
			captured.push(event as Record<string, unknown>);
		});
		serverState.beforeTurnCompleted = () => {
			void serverState.onRequest?.({
				id: "approval-read-app",
				method: "item/fileRead/requestApproval",
				params: { path: "/Applications/Cursor.app/Contents/Info.plist" },
			});
		};

		await manager.sendMessage(
			"REQ-codex-bypass-approval",
			{
				sessionId: "session-codex-bypass-approval",
				prompt: "check the installed app",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: "bypassPermissions",
				effortLevel: "medium",
				fastMode: false,
			},
			emitter,
		);

		expect(serverState.responses).toContainEqual({
			requestId: "approval-read-app",
			result: { decision: "accept" },
		});
		expect(captured.some((event) => event.type === "permissionRequest")).toBe(
			false,
		);
	});

	test("default permission mode still emits Codex approval requests as permission prompts", async () => {
		const manager = new CodexAppServerManager();
		const captured: Array<Record<string, unknown>> = [];
		emitter = createSidecarEmitter((event) => {
			captured.push(event as Record<string, unknown>);
		});
		serverState.beforeTurnCompleted = () => {
			void serverState.onRequest?.({
				id: "approval-open-app",
				method: "item/commandExecution/requestApproval",
				params: { command: "open -a Cursor ." },
			});
		};

		await manager.sendMessage(
			"REQ-codex-default-approval",
			{
				sessionId: "session-codex-default-approval",
				prompt: "open the app",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: "default",
				effortLevel: "medium",
				fastMode: false,
			},
			emitter,
		);

		expect(
			captured.find((event) => event.type === "permissionRequest"),
		).toMatchObject({
			id: "REQ-codex-default-approval",
			toolName: "Bash",
			toolInput: { command: "open -a Cursor ." },
		});
		expect(serverState.responses).not.toContainEqual({
			requestId: "approval-open-app",
			result: { decision: "accept" },
		});
	});

	test("prepends a linked-directories preamble to the turn input", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-preamble",
			{
				sessionId: "session-preamble",
				prompt: "summarize what's in these projects",
				model: "gpt-5.4",
				cwd: "/tmp/workspace",
				resume: undefined,
				permissionMode: "bypassPermissions",
				effortLevel: "medium",
				fastMode: false,
				additionalDirectories: ["/abs/alpha", "/abs/bravo"],
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);
		const input = (turnStart?.params as { input?: Array<{ text?: string }> })
			?.input;
		const firstText = input?.[0]?.text ?? "";
		// Preamble references the linked paths, and the original user prompt
		// is still in there (after the preamble).
		expect(firstText).toContain("/abs/alpha");
		expect(firstText).toContain("/abs/bravo");
		expect(firstText).toContain("summarize what's in these projects");
	});

	test("does not touch the user prompt when no directories are linked", async () => {
		const manager = new CodexAppServerManager();

		await manager.sendMessage(
			"REQ-no-preamble",
			{
				sessionId: "session-no-preamble",
				prompt: "hello",
				model: "gpt-5.4",
				cwd: "/tmp/workspace",
				resume: undefined,
				permissionMode: "bypassPermissions",
				effortLevel: "medium",
				fastMode: false,
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);
		const input = (turnStart?.params as { input?: Array<{ text?: string }> })
			?.input;
		expect(input?.[0]?.text).toBe("hello");
	});

	test("includes resolved git access directories in the linked-directories preamble", async () => {
		const manager = new CodexAppServerManager();
		gitAccessState.directories = ["/git/worktree-meta", "/git/common"];

		await manager.sendMessage(
			"REQ-git-preamble",
			{
				sessionId: "session-git-preamble",
				prompt: "check repo state",
				model: "gpt-5.4",
				cwd: "/tmp/workspace",
				resume: undefined,
				permissionMode: "plan",
				effortLevel: "medium",
				fastMode: false,
			},
			emitter,
		);

		const turnStart = serverState.requests.find(
			(request) => request.method === "turn/start",
		);
		const input = (turnStart?.params as { input?: Array<{ text?: string }> })
			?.input;
		const firstText = input?.[0]?.text ?? "";

		expect(firstText).toContain("/git/worktree-meta");
		expect(firstText).toContain("/git/common");
		expect(firstText).toContain("check repo state");
	});

	test("normalizes thread/tokenUsage/updated into contextUsageUpdated emit", async () => {
		const manager = new CodexAppServerManager();
		const events: Array<Record<string, unknown>> = [];
		const capturingEmitter = createSidecarEmitter((event) => {
			events.push(event as Record<string, unknown>);
		});

		serverState.beforeTurnCompleted = () => {
			serverState.onNotification?.({
				method: "thread/tokenUsage/updated",
				params: {
					tokenUsage: {
						total: { totalTokens: 35_000 },
						last: { totalTokens: 17_500 },
						modelContextWindow: 400_000,
					},
				},
			});
		};

		await manager.sendMessage(
			"REQ-usage",
			{
				sessionId: "session-codex-usage",
				prompt: "hi",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: undefined,
				effortLevel: "medium",
				fastMode: false,
			},
			capturingEmitter,
		);

		// `last.totalTokens` (not `total.totalTokens`) is the numerator; max
		// is `modelContextWindow`; percentage is rounded to 2 decimals.
		const ctxUsage = events.find((e) => e.type === "contextUsageUpdated");
		expect(ctxUsage).toBeDefined();
		expect(ctxUsage?.sessionId).toBe("session-codex-usage");
		expect(ctxUsage?.id).toBe("REQ-usage");
		const meta = JSON.parse(ctxUsage?.meta as string);
		expect(meta).toEqual({
			// Stamped from the sendMessage param, not the notification.
			modelId: "gpt-5.4",
			usedTokens: 17_500,
			maxTokens: 400_000,
			percentage: 4.38,
		});
	});

	test("skips contextUsageUpdated emit when tokenUsage payload is empty", async () => {
		const manager = new CodexAppServerManager();
		const events: Array<Record<string, unknown>> = [];
		const capturingEmitter = createSidecarEmitter((event) => {
			events.push(event as Record<string, unknown>);
		});

		// Zero tokens AND zero window — nothing meaningful to persist.
		serverState.beforeTurnCompleted = () => {
			serverState.onNotification?.({
				method: "thread/tokenUsage/updated",
				params: {
					tokenUsage: {
						last: { totalTokens: 0 },
						total: { totalTokens: 0 },
					},
				},
			});
		};

		await manager.sendMessage(
			"REQ-empty",
			{
				sessionId: "session-empty",
				prompt: "hi",
				model: "gpt-5.4",
				cwd: "/tmp",
				resume: undefined,
				permissionMode: undefined,
				effortLevel: "medium",
				fastMode: false,
			},
			capturingEmitter,
		);

		expect(
			events.find((e) => e.type === "contextUsageUpdated"),
		).toBeUndefined();
	});
});
