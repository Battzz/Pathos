import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	RepositoryFolder,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";
import { closeWorkspaceSession } from "./session-close";

const apiMocks = vi.hoisted(() => ({
	createSession: vi.fn(),
	deleteSession: vi.fn(),
	hideSession: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();

	return {
		...actual,
		createSession: apiMocks.createSession,
		deleteSession: apiMocks.deleteSession,
		hideSession: apiMocks.hideSession,
	};
});

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

function workspace(): WorkspaceDetail {
	return {
		id: "workspace-1",
		title: "Workspace",
		repoId: "repo-1",
		repoName: "repo",
		directoryName: "repo",
		state: "ready",
		hasUnread: false,
		workspaceUnread: 0,
		unreadSessionCount: 0,
		status: "in-progress",
		activeSessionId: "session-1",
		activeSessionTitle: "First",
		activeSessionAgentType: "claude",
		activeSessionStatus: "idle",
		branch: "main",
		initializationParentBranch: "main",
		intendedTargetBranch: "main",
		pinnedAt: null,
		prTitle: null,
		archiveCommit: null,
		sessionCount: 2,
		messageCount: 1,
		isGit: true,
	};
}

function session(
	id: string,
	title: string,
	active: boolean,
): WorkspaceSessionSummary {
	return {
		id,
		workspaceId: "workspace-1",
		title,
		agentType: "claude",
		status: "idle",
		model: "opus",
		permissionMode: "default",
		providerSessionId: "provider-session",
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		lastUserMessageAt: "2026-04-01T00:00:00.000Z",
		isHidden: false,
		actionKind: null,
		active,
	};
}

function repositoryFolders(
	sessions: WorkspaceSessionSummary[],
): RepositoryFolder[] {
	return [
		{
			repoId: "repo-1",
			repoName: "repo",
			repoInitials: "R",
			rootPath: "/tmp/repo",
			defaultBranch: "main",
			isGit: true,
			chats: sessions.map((item) => ({
				sessionId: item.id,
				workspaceId: item.workspaceId,
				title: item.title,
				agentType: item.agentType,
				status: item.status,
				unreadCount: item.unreadCount,
				needsPlanImplementation: false,
				pinnedAt: item.pinnedAt,
				createdAt: item.createdAt,
				updatedAt: item.updatedAt,
				lastUserMessageAt: item.lastUserMessageAt,
			})),
			workspaces: [],
		},
	];
}

describe("closeWorkspaceSession", () => {
	beforeEach(() => {
		apiMocks.createSession.mockReset();
		apiMocks.deleteSession.mockReset();
		apiMocks.hideSession.mockReset();
	});

	it("selects the adjacent session before hideSession resolves", async () => {
		const queryClient = new QueryClient();
		const currentWorkspace = workspace();
		const sessions = [
			session("session-1", "First", true),
			session("session-2", "Second", false),
		];
		const hide = deferred<void>();
		const onSelectSession = vi.fn();

		apiMocks.hideSession.mockReturnValueOnce(hide.promise);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail(currentWorkspace.id),
			currentWorkspace,
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions(currentWorkspace.id),
			sessions,
		);
		queryClient.setQueryData(pathosQueryKeys.repositoryFolders, [
			...repositoryFolders(sessions),
		]);

		const closePromise = closeWorkspaceSession({
			queryClient,
			workspace: currentWorkspace,
			sessions,
			sessionId: "session-1",
			activateAdjacent: true,
			onSelectSession,
		});

		expect(apiMocks.hideSession).toHaveBeenCalledWith("session-1");
		expect(onSelectSession).toHaveBeenCalledWith("session-2");
		expect(
			queryClient.getQueryData<WorkspaceDetail>(
				pathosQueryKeys.workspaceDetail(currentWorkspace.id),
			)?.activeSessionId,
		).toBe("session-2");
		expect(
			queryClient
				.getQueryData<WorkspaceSessionSummary[]>(
					pathosQueryKeys.workspaceSessions(currentWorkspace.id),
				)
				?.map(({ id, active }) => ({ id, active })),
		).toEqual([{ id: "session-2", active: true }]);
		expect(
			queryClient
				.getQueryData<RepositoryFolder[]>(
					pathosQueryKeys.repositoryFolders,
				)?.[0]
				?.chats.map((chat) => chat.sessionId),
		).toEqual(["session-2"]);

		hide.resolve();
		await expect(closePromise).resolves.toBe(true);
	});

	it("removes the sidebar row instead of showing the replacement empty chat", async () => {
		const queryClient = new QueryClient();
		const currentWorkspace = { ...workspace(), sessionCount: 1 };
		const sessions = [session("session-1", "First", true)];
		const hide = deferred<void>();

		apiMocks.createSession.mockResolvedValueOnce({ sessionId: "session-new" });
		apiMocks.hideSession.mockReturnValueOnce(hide.promise);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceDetail(currentWorkspace.id),
			currentWorkspace,
		);
		queryClient.setQueryData(
			pathosQueryKeys.workspaceSessions(currentWorkspace.id),
			sessions,
		);
		queryClient.setQueryData(
			pathosQueryKeys.repositoryFolders,
			repositoryFolders(sessions),
		);

		const closePromise = closeWorkspaceSession({
			queryClient,
			workspace: currentWorkspace,
			sessions,
			sessionId: "session-1",
			activateAdjacent: true,
		});

		await vi.waitFor(() => {
			expect(apiMocks.hideSession).toHaveBeenCalledWith("session-1");
		});
		expect(
			queryClient.getQueryData<WorkspaceSessionSummary[]>(
				pathosQueryKeys.workspaceSessions(currentWorkspace.id),
			),
		).toEqual([
			expect.objectContaining({
				id: "session-new",
				title: "Untitled",
			}),
		]);
		expect(
			queryClient.getQueryData<RepositoryFolder[]>(
				pathosQueryKeys.repositoryFolders,
			)?.[0]?.chats,
		).toEqual([]);

		hide.resolve();
		await expect(closePromise).resolves.toBe(true);
	});
});
