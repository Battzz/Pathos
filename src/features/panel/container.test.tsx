import { waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPathosQueryClient, pathosQueryKeys } from "@/lib/query-client";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { renderWithProviders } from "@/test/render-with-providers";

const apiMocks = vi.hoisted(() => ({
	createSession: vi.fn(),
	generateSessionTitle: vi.fn(),
	loadRepoScripts: vi.fn(),
	loadWorkspaceDetail: vi.fn(),
	loadWorkspaceSessions: vi.fn(),
	loadSessionMessages: vi.fn(),
	loadSessionThreadMessages: vi.fn(),
	prepareSessionRedoFromUserMessage: vi.fn(),
	truncateSessionMessagesAfter: vi.fn(),
}));

const panelRenderSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();

	return {
		...actual,
		createSession: apiMocks.createSession,
		generateSessionTitle: apiMocks.generateSessionTitle,
		loadRepoScripts: apiMocks.loadRepoScripts,
		loadWorkspaceDetail: apiMocks.loadWorkspaceDetail,
		loadWorkspaceSessions: apiMocks.loadWorkspaceSessions,
		loadSessionMessages: apiMocks.loadSessionThreadMessages,
		loadSessionThreadMessages: apiMocks.loadSessionThreadMessages,
		prepareSessionRedoFromUserMessage:
			apiMocks.prepareSessionRedoFromUserMessage,
		truncateSessionMessagesAfter: apiMocks.truncateSessionMessagesAfter,
	};
});

vi.mock("./index", () => ({
	WorkspacePanel: (props: Record<string, unknown>) => {
		useEffect(() => {
			const preparingSessionId = props.preparingSessionId as string | null;
			const onSessionPrepared = props.onSessionPrepared as
				| ((sessionId: string, payload: Record<string, unknown>) => void)
				| undefined;

			if (!preparingSessionId || !onSessionPrepared) {
				return;
			}

			const timeoutId = window.setTimeout(() => {
				onSessionPrepared(preparingSessionId, {
					layoutCacheKey: "test-layout",
					lastMeasuredAt: Date.now(),
				});
			}, 0);

			return () => {
				window.clearTimeout(timeoutId);
			};
		}, [props.onSessionPrepared, props.preparingSessionId]);

		panelRenderSpy(props);
		return <div data-testid="workspace-panel-props" />;
	},
}));

import { WorkspacePanelContainer } from "./container";

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});

	return { promise, resolve };
}

function createWorkspaceDetail(
	workspaceId = "workspace-1",
	activeSessionId: string | null = "session-1",
) {
	return {
		id: workspaceId,
		title: `Workspace ${workspaceId}`,
		repoId: "repo-1",
		repoName: "pathos",
		directoryName: "pathos",
		state: "ready",
		hasUnread: false,
		workspaceUnread: 0,
		unreadSessionCount: 0,
		status: "in-progress",
		activeSessionId,
		activeSessionTitle: activeSessionId,
		activeSessionAgentType: "claude",
		activeSessionStatus: activeSessionId ? "idle" : null,
		branch: "main",
		initializationParentBranch: "main",
		intendedTargetBranch: "main",
		pinnedAt: null,
		prTitle: null,
		archiveCommit: null,
		sessionCount: 2,
		messageCount: 2,
		rootPath: "/tmp/pathos",
	};
}

function createWorkspaceSessions(
	workspaceId = "workspace-1",
	sessionIds = ["session-1", "session-2"],
) {
	return [
		{
			id: sessionIds[0],
			workspaceId,
			title: sessionIds[0],
			agentType: "claude",
			status: "idle",
			model: "opus-1m",
			permissionMode: "default",
			providerSessionId: null,
			effortLevel: null,
			unreadCount: 0,
			fastMode: false,
			createdAt: "2026-04-05T00:00:00Z",
			updatedAt: "2026-04-05T00:00:00Z",
			lastUserMessageAt: null,
			isHidden: false,
			actionKind: null,
			active: true,
		},
		{
			id: sessionIds[1],
			workspaceId,
			title: sessionIds[1],
			agentType: "claude",
			status: "idle",
			model: "opus-1m",
			permissionMode: "default",
			providerSessionId: null,
			effortLevel: null,
			unreadCount: 0,
			fastMode: false,
			createdAt: "2026-04-05T00:00:00Z",
			updatedAt: "2026-04-05T00:00:00Z",
			lastUserMessageAt: null,
			isHidden: false,
			actionKind: null,
			active: false,
		},
	];
}

function createWorkspaceSessionSummary(
	id: string,
	overrides: Record<string, unknown> = {},
) {
	return {
		id,
		workspaceId: "workspace-1",
		title: id,
		agentType: "claude",
		status: "idle",
		model: "opus-1m",
		permissionMode: "default",
		providerSessionId: null,
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt: "2026-04-05T00:00:00Z",
		updatedAt: "2026-04-05T00:00:00Z",
		lastUserMessageAt: null,
		isHidden: false,
		actionKind: null,
		active: false,
		...overrides,
	};
}

function createMessages(sessionId: string) {
	return [
		{
			role: "assistant" as const,
			id: `${sessionId}-assistant`,
			createdAt: "2026-04-05T00:00:00Z",
			content: [{ type: "text" as const, text: "hello" }],
			status: { type: "complete", reason: "stop" },
		},
	];
}

function createPlanReviewMessages(
	sessionId: string,
	toolUseId = "tool-plan-1",
) {
	return [
		{
			role: "assistant" as const,
			id: `${sessionId}-plan-review`,
			createdAt: "2026-04-05T00:00:00Z",
			content: [
				{
					type: "plan-review" as const,
					toolUseId,
					toolName: "ExitPlanMode",
					plan: "1. Review the implementation plan.",
					planFilePath: "/tmp/plan.md",
					allowedPrompts: [],
				},
			],
			status: { type: "complete", reason: "stop" },
		},
	];
}

function getLatestPanelProps() {
	const latestCall =
		panelRenderSpy.mock.calls[panelRenderSpy.mock.calls.length - 1];
	if (!latestCall) {
		throw new Error("WorkspacePanel was not rendered.");
	}

	return latestCall[0] as Record<string, unknown>;
}

function getSessionPaneIds() {
	return (
		(getLatestPanelProps().sessionPanes as Array<{ sessionId: string }>)?.map(
			(pane) => pane.sessionId,
		) ?? []
	);
}

describe("WorkspacePanelContainer loading semantics", () => {
	beforeEach(() => {
		panelRenderSpy.mockReset();
		apiMocks.createSession.mockReset();
		apiMocks.generateSessionTitle.mockReset();
		apiMocks.loadRepoScripts.mockReset();
		apiMocks.loadWorkspaceDetail.mockReset();
		apiMocks.loadWorkspaceSessions.mockReset();
		apiMocks.loadSessionThreadMessages.mockReset();
		apiMocks.prepareSessionRedoFromUserMessage.mockReset();
		apiMocks.truncateSessionMessagesAfter.mockReset();

		apiMocks.createSession.mockResolvedValue({ sessionId: "session-created" });
		apiMocks.generateSessionTitle.mockResolvedValue({
			title: null,
			branchRenamed: false,
			skipped: true,
		});
		apiMocks.loadRepoScripts.mockResolvedValue({
			setupScript: "bun install",
			runScript: "bun run dev",
			setupFromProject: false,
			runFromProject: false,
			autoRunSetup: true,
		});
		apiMocks.loadWorkspaceDetail.mockImplementation((workspaceId?: string) =>
			Promise.resolve(createWorkspaceDetail(workspaceId)),
		);
		apiMocks.loadWorkspaceSessions.mockImplementation((workspaceId?: string) =>
			Promise.resolve(createWorkspaceSessions(workspaceId)),
		);
		apiMocks.loadSessionThreadMessages.mockImplementation(
			(sessionId?: string) =>
				Promise.resolve(createMessages(sessionId ?? "session-1")),
		);
		apiMocks.truncateSessionMessagesAfter.mockResolvedValue(1);
		apiMocks.prepareSessionRedoFromUserMessage.mockResolvedValue(1);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows a cold session loader for the first open of an uncached session", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);

		const deferredMessages =
			createDeferred<ReturnType<typeof createMessages>>();
		apiMocks.loadSessionThreadMessages.mockReturnValue(
			deferredMessages.promise,
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-2"
				displayedSessionId="session-2"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		expect(getLatestPanelProps().loadingWorkspace).toBe(false);
		expect(getLatestPanelProps().loadingSession).toBe(true);
		expect(getLatestPanelProps().refreshingSession).toBe(false);

		deferredMessages.resolve(createMessages("session-2"));
	});

	it("renders cached session data immediately when revisiting a previously opened session", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-2"), "thread"],
			createMessages("session-2"),
		);
		apiMocks.loadSessionThreadMessages.mockResolvedValue(
			createMessages("session-2"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-2"
				displayedSessionId="session-2"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		expect(getLatestPanelProps().loadingWorkspace).toBe(false);
		expect(getLatestPanelProps().loadingSession).toBe(false);
		expect(getSessionPaneIds()).toContain("session-2");
		expect(
			(
				getLatestPanelProps().sessionPanes as Array<{
					sessionId: string;
					messages: ReturnType<typeof createMessages>;
				}>
			).find((pane) => pane.sessionId === "session-2")?.messages,
		).toEqual(createMessages("session-2"));
	});

	it("drops the selected user message when rewinding a chat", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createMessages("session-1"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getLatestPanelProps().onRevertMessage).toEqual(
				expect.any(Function),
			);
		});

		await (
			getLatestPanelProps().onRevertMessage as (
				messageId: string,
			) => Promise<void>
		)("user-message-1");

		expect(apiMocks.truncateSessionMessagesAfter).toHaveBeenCalledTimes(1);
		expect(
			apiMocks.truncateSessionMessagesAfter.mock.calls[0]?.slice(1),
		).toEqual(["user-message-1", true]);
	});

	it("prepares redo and queues a replay without duplicating the user message", async () => {
		const queryClient = createPathosQueryClient();
		const onQueuePendingPromptForSession = vi.fn();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createMessages("session-1"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
				onQueuePendingPromptForSession={onQueuePendingPromptForSession}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getLatestPanelProps().onRedoAssistantMessage).toEqual(
				expect.any(Function),
			);
		});

		await waitFor(() => {
			expect(onQueuePendingPromptForSession).toEqual(expect.any(Function));
		});

		await (
			getLatestPanelProps().onRedoAssistantMessage as (
				userMessageId: string,
				prompt: string,
			) => Promise<void>
		)("user-message-1", "Run this again.");

		expect(apiMocks.prepareSessionRedoFromUserMessage).toHaveBeenCalledWith(
			"session-1",
			"user-message-1",
		);
		expect(onQueuePendingPromptForSession).toHaveBeenCalledWith({
			sessionId: "session-1",
			prompt: "Run this again.",
			replayUserMessageId: "user-message-1",
		});
	});

	it("derives the new-session tab provider from the default model setting", () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(pathosQueryKeys.agentModelSections, [
			{
				id: "claude",
				label: "Claude",
				options: [
					{
						id: "opus-1m",
						provider: "claude",
						label: "Opus",
						cliModel: "opus-1m",
					},
				],
			},
			{
				id: "codex",
				label: "Codex",
				options: [
					{
						id: "gpt-5.4",
						provider: "codex",
						label: "GPT-5.4",
						cliModel: "gpt-5.4",
					},
				],
			},
		]);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-new"),
		);
		queryClient.setQueryData(pathosQueryKeys.workspaceSessions("workspace-1"), [
			{
				id: "session-new",
				workspaceId: "workspace-1",
				title: "Untitled",
				agentType: null,
				status: "idle",
				model: null,
				permissionMode: "default",
				providerSessionId: null,
				unreadCount: 0,
				fastMode: false,
				createdAt: "2026-04-05T00:00:00Z",
				updatedAt: "2026-04-05T00:00:00Z",
				lastUserMessageAt: null,
				isHidden: false,
				active: true,
			},
		]);
		apiMocks.loadWorkspaceSessions.mockResolvedValue([
			{
				id: "session-new",
				workspaceId: "workspace-1",
				title: "Untitled",
				agentType: null,
				status: "idle",
				model: null,
				permissionMode: "default",
				providerSessionId: null,
				effortLevel: null,
				unreadCount: 0,
				fastMode: false,
				createdAt: "2026-04-05T00:00:00Z",
				updatedAt: "2026-04-05T00:00:00Z",
				lastUserMessageAt: null,
				isHidden: false,
				actionKind: null,
				active: true,
			},
		]);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-new"), "thread"],
			[],
		);

		renderWithProviders(
			<SettingsContext.Provider
				value={{
					settings: {
						...DEFAULT_SETTINGS,
						defaultModelId: "gpt-5.4",
					},
					isLoaded: true,
					updateSettings: vi.fn(),
				}}
			>
				<WorkspacePanelContainer
					selectedWorkspaceId="workspace-1"
					displayedWorkspaceId="workspace-1"
					selectedSessionId="session-new"
					displayedSessionId="session-new"
					sending={false}
					onSelectSession={vi.fn()}
					onResolveDisplayedSession={vi.fn()}
				/>
			</SettingsContext.Provider>,
			{ queryClient },
		);

		expect(getLatestPanelProps().sessionDisplayProviders).toEqual({
			"session-new": "codex",
		});
	});

	it("falls back to loading when revisiting a session after query cache eviction", async () => {
		const queryClient = createPathosQueryClient();
		const workspace1Sessions = createWorkspaceSessions("workspace-1", [
			"session-1",
			"session-2",
		]);
		const workspace2Sessions = createWorkspaceSessions("workspace-2", [
			"session-3",
			"session-4",
		]);

		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			workspace1Sessions,
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createMessages("session-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-2"),
			createWorkspaceDetail("workspace-2", "session-3"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-2"),
			workspace2Sessions,
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-3"), "thread"],
			createMessages("session-3"),
		);

		const rendered = renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toContain("session-1");
		});

		// Install the deferred mock BEFORE evicting the cache. The live
		// observer on session-1 fires an automatic refetch the instant
		// `removeQueries` drops its data, and that refetch must not hit the
		// default `mockReset` stub (which returns undefined and poisons the
		// query with a `"data cannot be undefined"` error that survives the
		// later rerender back to session-1).
		const deferredMessages =
			createDeferred<ReturnType<typeof createMessages>>();
		apiMocks.loadSessionThreadMessages.mockImplementation(
			(sessionId?: string) => {
				if (sessionId === "session-1") {
					return deferredMessages.promise;
				}

				return Promise.resolve(createMessages(sessionId ?? "session-unknown"));
			},
		);

		queryClient.removeQueries({
			queryKey: [...pathosQueryKeys.sessionMessages("session-1"), "thread"],
		});

		rendered.rerender(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-2"
				displayedWorkspaceId="workspace-2"
				selectedSessionId="session-3"
				displayedSessionId="session-3"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toContain("session-3");
		});

		rendered.rerender(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
		);

		expect(getLatestPanelProps().loadingSession).toBe(true);
		expect(getSessionPaneIds()).not.toContain("session-1");

		deferredMessages.resolve(createMessages("session-1"));

		await waitFor(() => {
			expect(getLatestPanelProps().loadingSession).toBe(false);
			expect(getSessionPaneIds()).toContain("session-1");
		});
	});

	it("retains the previous loaded session pane when switching between sessions", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-2"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-2"), "thread"],
			[],
			{ updatedAt: 0 },
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createMessages("session-1"),
		);

		const rendered = renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-2"
				displayedSessionId="session-2"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toContain("session-2");
		});

		rendered.rerender(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toContain("session-1");
			expect(getSessionPaneIds()).toContain("session-2");
			expect(getSessionPaneIds()).toHaveLength(2);
			expect(
				(
					getLatestPanelProps().sessionPanes as Array<{
						sessionId: string;
						presentationState: string;
					}>
				).map((pane) => [pane.sessionId, pane.presentationState]),
			).toEqual([
				["session-1", "presented"],
				["session-2", "cached"],
			]);
		});
	});

	it("shows an empty session immediately without a prepare phase", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-2"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-2"), "thread"],
			[],
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createMessages("session-1"),
		);

		const rendered = renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-2"
				displayedSessionId="session-2"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		rendered.rerender(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toEqual(["session-1", "session-2"]);
			expect(getLatestPanelProps().loadingSession).toBe(false);
		});
	});

	it("keeps showing the session loader for a started chat with a stale empty thread cache", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-2"),
		);
		queryClient.setQueryData(pathosQueryKeys.workspaceSessions("workspace-1"), [
			createWorkspaceSessionSummary("session-1", { active: false }),
			createWorkspaceSessionSummary("session-2", {
				active: true,
				updatedAt: "2026-04-05T00:01:00Z",
				// Session has actually been used: the agent SDK assigned a
				// provider session id on the first turn. That, not a bumped
				// `updated_at`, is what tells us the empty thread cache is stale.
				providerSessionId: "provider-session-2",
				lastUserMessageAt: "2026-04-05T00:01:00Z",
			}),
		]);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-2"), "thread"],
			[],
		);
		const deferredMessages =
			createDeferred<ReturnType<typeof createMessages>>();
		apiMocks.loadSessionThreadMessages.mockReturnValue(
			deferredMessages.promise,
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-2"
				displayedSessionId="session-2"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getLatestPanelProps().loadingSession).toBe(true);
			expect(getSessionPaneIds()).not.toContain("session-2");
		});

		deferredMessages.resolve(createMessages("session-2"));

		await waitFor(() => {
			expect(getLatestPanelProps().loadingSession).toBe(false);
			expect(getSessionPaneIds()).toContain("session-2");
		});
	});

	it("renders the empty state for a brand-new chat whose row has been touched since creation", async () => {
		// Regression: switching from an existing chat to a freshly created one
		// must always paint the EmptyState ("Chat with X / Let's get to it"),
		// never the cold placeholder. Before the fix, any update to the new
		// session row (model defaulting, status flips, fast-mode toggles, etc.)
		// fired the `update_sessions_updated_at` SQL trigger, made
		// `createdAt !== updatedAt`, and flipped `loadingSession` to true —
		// suppressing the empty state intermittently.
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "session-new"),
		);
		queryClient.setQueryData(pathosQueryKeys.workspaceSessions("workspace-1"), [
			createWorkspaceSessionSummary("session-1", { active: false }),
			createWorkspaceSessionSummary("session-new", {
				active: true,
				// The only thing that changed since creation is `updated_at`
				// (e.g. the trigger fired when a default model was assigned).
				// The user has not interacted yet: no provider session, no
				// user-message timestamp.
				createdAt: "2026-04-05T00:00:00Z",
				updatedAt: "2026-04-05T00:00:01Z",
				providerSessionId: null,
				lastUserMessageAt: null,
			}),
		]);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-new"), "thread"],
			[],
		);
		apiMocks.loadSessionThreadMessages.mockResolvedValue([]);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-new"
				displayedSessionId="session-new"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getLatestPanelProps().loadingSession).toBe(false);
			expect(getSessionPaneIds()).toContain("session-new");
		});

		const newPane = (
			getLatestPanelProps().sessionPanes as Array<{
				sessionId: string;
				messages: ReturnType<typeof createMessages>;
				hasLoaded: boolean;
				presentationState: string;
			}>
		).find((pane) => pane.sessionId === "session-new");

		// `hasLoaded: true` + `messages: []` is what makes the WorkspacePanel
		// route to ConversationViewport's EmptyPlaceholder ("Chat with X")
		// instead of falling through to ConversationColdPlaceholder.
		expect(newPane?.hasLoaded).toBe(true);
		expect(newPane?.presentationState).toBe("presented");
		expect(newPane?.messages).toEqual([]);
	});

	it("renders sessions in query order", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1", "idle"),
		);
		queryClient.setQueryData(pathosQueryKeys.workspaceSessions("workspace-1"), [
			createWorkspaceSessionSummary("action-idle", {
				actionKind: "create-pr",
				updatedAt: "2026-04-05T00:00:00Z",
			}),
			createWorkspaceSessionSummary("idle", {
				active: true,
				updatedAt: "2026-04-06T00:00:00Z",
			}),
			createWorkspaceSessionSummary("running", {
				updatedAt: "2026-04-07T00:00:00Z",
			}),
			createWorkspaceSessionSummary("unread", {
				unreadCount: 2,
				updatedAt: "2026-04-04T00:00:00Z",
			}),
		]);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("idle"), "thread"],
			createMessages("idle"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="idle"
				displayedSessionId="idle"
				sending={false}
				sendingSessionIds={new Set(["running"])}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(
				(getLatestPanelProps().sessions as Array<{ id: string }>).map(
					(session) => session.id,
				),
			).toEqual(["action-idle", "idle", "running", "unread"]);
		});
	});

	it("uses the first visible session as the default displayed thread", async () => {
		const queryClient = createPathosQueryClient();
		const onResolveDisplayedSession = vi.fn();
		const workspaceDetail = createWorkspaceDetail("workspace-1", null);
		const workspaceSessions = [
			createWorkspaceSessionSummary("idle", {
				updatedAt: "2026-04-05T00:00:00Z",
			}),
			createWorkspaceSessionSummary("unread", {
				unreadCount: 1,
				updatedAt: "2026-04-04T00:00:00Z",
			}),
		];

		apiMocks.loadWorkspaceDetail.mockResolvedValue(workspaceDetail);
		apiMocks.loadWorkspaceSessions.mockResolvedValue(workspaceSessions);
		apiMocks.loadSessionThreadMessages.mockImplementation(
			(sessionId?: string) =>
				Promise.resolve(createMessages(sessionId ?? "unread")),
		);

		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			workspaceDetail,
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			workspaceSessions,
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("unread"), "thread"],
			createMessages("unread"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId={null}
				displayedSessionId={null}
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={onResolveDisplayedSession}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(onResolveDisplayedSession).toHaveBeenCalledWith("idle");
		});
	});

	it("auto-creates a session when the selected workspace has none", async () => {
		const queryClient = createPathosQueryClient();
		let created = false;
		const onResolveDisplayedSession = vi.fn();

		apiMocks.createSession.mockImplementation(async () => {
			created = true;
			return { sessionId: "session-created" };
		});
		apiMocks.loadWorkspaceDetail.mockImplementation(
			async (workspaceId?: string) =>
				created
					? {
							...createWorkspaceDetail(workspaceId, "session-created"),
							sessionCount: 1,
							activeSessionTitle: "Untitled",
						}
					: {
							...createWorkspaceDetail(workspaceId, null),
							activeSessionAgentType: null,
							sessionCount: 0,
						},
		);
		apiMocks.loadWorkspaceSessions.mockImplementation(
			async (workspaceId?: string) =>
				created
					? [
							{
								id: "session-created",
								workspaceId: workspaceId ?? "workspace-1",
								title: "Untitled",
								agentType: null,
								status: "idle",
								model: null,
								permissionMode: "default",
								providerSessionId: null,
								unreadCount: 0,
								fastMode: false,
								createdAt: "2026-04-05T00:00:00Z",
								updatedAt: "2026-04-05T00:00:00Z",
								lastUserMessageAt: null,
								isHidden: false,
								actionKind: null,
								active: true,
							},
						]
					: [],
		);
		apiMocks.loadSessionThreadMessages.mockResolvedValue([]);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId={null}
				displayedSessionId={null}
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={onResolveDisplayedSession}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(apiMocks.createSession).toHaveBeenCalledWith("workspace-1");
		});
		await waitFor(() => {
			expect(onResolveDisplayedSession).toHaveBeenCalledWith("session-created");
		});
		await waitFor(() => {
			expect(getSessionPaneIds()).toEqual(["session-created"]);
		});
	});

	it("does not auto-create a duplicate session for a newly created workspace", async () => {
		const queryClient = createPathosQueryClient();
		const detailDeferred =
			createDeferred<ReturnType<typeof createWorkspaceDetail>>();
		const sessionsDeferred =
			createDeferred<ReturnType<typeof createWorkspaceSessions>>();

		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-created"),
			{
				...createWorkspaceDetail("workspace-created", null),
				activeSessionAgentType: null,
				activeSessionStatus: null,
				sessionCount: 0,
			},
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-created"),
			[],
		);

		apiMocks.createSession.mockResolvedValue({
			sessionId: "session-duplicate",
		});
		apiMocks.loadWorkspaceDetail.mockImplementation(
			async (workspaceId?: string) =>
				detailDeferred.promise.then(() =>
					createWorkspaceDetail(
						workspaceId ?? "workspace-created",
						"session-1",
					),
				),
		);
		apiMocks.loadWorkspaceSessions.mockImplementation(
			async (workspaceId?: string) =>
				sessionsDeferred.promise.then(() => [
					createWorkspaceSessionSummary("session-1", {
						workspaceId: workspaceId ?? "workspace-created",
						active: true,
					}),
				]),
		);
		apiMocks.loadSessionThreadMessages.mockResolvedValue([]);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-created"
				displayedWorkspaceId="workspace-created"
				selectedSessionId={null}
				displayedSessionId={null}
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(apiMocks.loadWorkspaceDetail).toHaveBeenCalledWith(
				"workspace-created",
			);
			expect(apiMocks.loadWorkspaceSessions).toHaveBeenCalledWith(
				"workspace-created",
			);
		});
		expect(apiMocks.createSession).not.toHaveBeenCalled();

		detailDeferred.resolve(
			createWorkspaceDetail("workspace-created", "session-1"),
		);
		sessionsDeferred.resolve(
			createWorkspaceSessions("workspace-created", ["session-1"]),
		);

		await waitFor(() => {
			expect(getSessionPaneIds()).toEqual(["session-1"]);
		});
		expect(apiMocks.createSession).not.toHaveBeenCalled();
	});

	it("does not auto-create when workspace detail already reports a session", async () => {
		const queryClient = createPathosQueryClient();

		apiMocks.createSession.mockResolvedValue({
			sessionId: "session-duplicate",
		});
		apiMocks.loadWorkspaceDetail.mockResolvedValue(
			createWorkspaceDetail("workspace-1", "session-1"),
		);
		apiMocks.loadWorkspaceSessions.mockResolvedValue([]);
		apiMocks.loadSessionThreadMessages.mockResolvedValue([]);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId={null}
				displayedSessionId={null}
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(apiMocks.loadWorkspaceDetail).toHaveBeenCalledWith("workspace-1");
			expect(apiMocks.loadWorkspaceSessions).toHaveBeenCalledWith(
				"workspace-1",
			);
		});

		expect(apiMocks.createSession).not.toHaveBeenCalled();
	});

	it("renders a pre-seeded initializing workspace without re-fetching thread messages", async () => {
		// When use-controller's prepare/paint/finalize flow seeds the detail
		// + sessions + empty thread cache, the panel paints from cache alone.
		// The thread messages query's SESSION_STALE_TIME keeps the seeded
		// empty array fresh, so no backend fetch fires while Phase 2 is
		// still materializing the worktree.
		const queryClient = createPathosQueryClient();
		const workspaceId = crypto.randomUUID();
		const sessionId = crypto.randomUUID();

		queryClient.setQueryData(pathosQueryKeys.workspaceDetail(workspaceId), {
			...createWorkspaceDetail(workspaceId, sessionId),
			state: "initializing",
		});
		queryClient.setQueryData(pathosQueryKeys.workspaceSessions(workspaceId), [
			createWorkspaceSessionSummary(sessionId, {
				workspaceId,
				active: true,
			}),
		]);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages(sessionId), "thread"],
			[],
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId={workspaceId}
				displayedWorkspaceId={workspaceId}
				selectedSessionId={null}
				displayedSessionId={null}
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		await waitFor(() => {
			expect(getLatestPanelProps().sessions).toMatchObject([{ id: sessionId }]);
		});

		expect(apiMocks.loadSessionThreadMessages).not.toHaveBeenCalledWith(
			sessionId,
		);
	});

	it("renders plan-review messages from DB as read-only cards", async () => {
		const queryClient = createPathosQueryClient();
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail("workspace-1"),
			createWorkspaceDetail("workspace-1"),
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions("workspace-1"),
			createWorkspaceSessions("workspace-1"),
		);
		queryClient.setQueryData(
			[...pathosQueryKeys.sessionMessages("session-1"), "thread"],
			createPlanReviewMessages("session-1"),
		);

		renderWithProviders(
			<WorkspacePanelContainer
				selectedWorkspaceId="workspace-1"
				displayedWorkspaceId="workspace-1"
				selectedSessionId="session-1"
				displayedSessionId="session-1"
				sending={false}
				onSelectSession={vi.fn()}
				onResolveDisplayedSession={vi.fn()}
			/>,
			{ queryClient },
		);

		const pane = (
			getLatestPanelProps().sessionPanes as Array<{
				sessionId: string;
				messages: Array<unknown>;
			}>
		).find((entry) => entry.sessionId === "session-1");

		expect(pane?.messages).toHaveLength(1);
	});
});
