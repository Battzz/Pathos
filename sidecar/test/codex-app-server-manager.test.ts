import { beforeEach, describe, expect, mock, test } from "bun:test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createSidecarEmitter, type SidecarEmitter } from "../src/emitter.js";

process.env.HELMOR_LOG_DIR = resolve(tmpdir(), "helmor-sidecar-test-logs");

type RequestRecord = {
	method: string;
	params: unknown;
};

const serverState = {
	requests: [] as RequestRecord[],
	onNotification: null as
		| null
		| ((notification: { method: string; params?: unknown }) => void),
};
const gitAccessState = {
	directories: [] as string[],
};

class MockCodexAppServer {
	killed = false;

	async sendRequest(method: string, params: unknown): Promise<unknown> {
		serverState.requests.push({ method, params });

		if (method === "initialize") return {};
		if (method === "model/list") {
			return {
				data: [
					{
						id: "gpt-5.4",
						model: "gpt-5.4",
						displayName: "GPT-5.4",
						supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
					},
					{
						id: "custom-nofast",
						model: "custom-nofast",
						displayName: "Custom No Fast",
						supportedReasoningEfforts: ["low", "medium"],
						supportsFastMode: false,
					},
				],
			};
		}
		if (method === "thread/start") {
			return { thread: { id: "thread-1" } };
		}
		if (method === "turn/start") {
			queueMicrotask(() => {
				serverState.onNotification?.({
					method: "turn/started",
					params: { turn: { id: "turn-1" } },
				});
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
		_onRequest: unknown,
	): void {
		serverState.onNotification = onNotification;
	}

	setActiveRequestId(_id: string): void {}

	sendResponse(_requestId: string | number, _result: unknown): void {}
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
		serverState.onNotification = null;
		gitAccessState.directories = [];
		emitter = createSidecarEmitter(() => {});
	});

	test("surfaces fast mode support in model list", async () => {
		const manager = new CodexAppServerManager();

		const models = await manager.listModels();

		expect(models).toEqual([
			expect.objectContaining({
				id: "gpt-5.4",
				supportsFastMode: true,
			}),
			expect.objectContaining({
				id: "custom-nofast",
				supportsFastMode: false,
			}),
		]);
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
});
