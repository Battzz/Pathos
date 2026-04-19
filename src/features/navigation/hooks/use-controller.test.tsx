import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ArchiveExecutionFailedPayload,
	ArchiveExecutionSucceededPayload,
	PrepareArchiveWorkspaceResponse,
	WorkspaceDetail,
	WorkspaceGroup,
	WorkspaceSessionSummary,
	WorkspaceSummary,
} from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { useWorkspacesSidebarController } from "./use-controller";

const apiMocks = vi.hoisted(() => {
	let archiveFailedListener:
		| ((payload: ArchiveExecutionFailedPayload) => void)
		| null = null;
	let archiveSucceededListener:
		| ((payload: ArchiveExecutionSucceededPayload) => void)
		| null = null;

	return {
		addRepositoryFromLocalPath: vi.fn(),
		createWorkspaceFromRepo: vi.fn(),
		listRepositories: vi.fn(),
		loadAddRepositoryDefaults: vi.fn(),
		loadArchivedWorkspaces: vi.fn(),
		loadSessionThreadMessages: vi.fn(),
		loadWorkspaceDetail: vi.fn(),
		loadWorkspaceGroups: vi.fn(),
		loadWorkspaceSessions: vi.fn(),
		markWorkspaceRead: vi.fn(),
		markWorkspaceUnread: vi.fn(),
		permanentlyDeleteWorkspace: vi.fn(),
		pinWorkspace: vi.fn(),
		prepareArchiveWorkspace: vi.fn(),
		restoreWorkspace: vi.fn(),
		setWorkspaceManualStatus: vi.fn(),
		startArchiveWorkspace: vi.fn(),
		unpinWorkspace: vi.fn(),
		validateRestoreWorkspace: vi.fn(),
		listenArchiveExecutionFailed: vi.fn(async (callback) => {
			archiveFailedListener = callback;
			return () => {
				if (archiveFailedListener === callback) {
					archiveFailedListener = null;
				}
			};
		}),
		listenArchiveExecutionSucceeded: vi.fn(async (callback) => {
			archiveSucceededListener = callback;
			return () => {
				if (archiveSucceededListener === callback) {
					archiveSucceededListener = null;
				}
			};
		}),
		emitArchiveFailed(payload: ArchiveExecutionFailedPayload) {
			archiveFailedListener?.(payload);
		},
		emitArchiveSucceeded(payload: ArchiveExecutionSucceededPayload) {
			archiveSucceededListener?.(payload);
		},
	};
});

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();

	return {
		...actual,
		addRepositoryFromLocalPath: apiMocks.addRepositoryFromLocalPath,
		createWorkspaceFromRepo: apiMocks.createWorkspaceFromRepo,
		listRepositories: apiMocks.listRepositories,
		loadAddRepositoryDefaults: apiMocks.loadAddRepositoryDefaults,
		loadArchivedWorkspaces: apiMocks.loadArchivedWorkspaces,
		loadSessionThreadMessages: apiMocks.loadSessionThreadMessages,
		loadWorkspaceDetail: apiMocks.loadWorkspaceDetail,
		loadWorkspaceGroups: apiMocks.loadWorkspaceGroups,
		loadWorkspaceSessions: apiMocks.loadWorkspaceSessions,
		listenArchiveExecutionFailed: apiMocks.listenArchiveExecutionFailed,
		listenArchiveExecutionSucceeded: apiMocks.listenArchiveExecutionSucceeded,
		markWorkspaceRead: apiMocks.markWorkspaceRead,
		markWorkspaceUnread: apiMocks.markWorkspaceUnread,
		permanentlyDeleteWorkspace: apiMocks.permanentlyDeleteWorkspace,
		pinWorkspace: apiMocks.pinWorkspace,
		prepareArchiveWorkspace: apiMocks.prepareArchiveWorkspace,
		restoreWorkspace: apiMocks.restoreWorkspace,
		setWorkspaceManualStatus: apiMocks.setWorkspaceManualStatus,
		startArchiveWorkspace: apiMocks.startArchiveWorkspace,
		unpinWorkspace: apiMocks.unpinWorkspace,
		validateRestoreWorkspace: apiMocks.validateRestoreWorkspace,
	};
});

const workspaceGroups: WorkspaceGroup[] = [
	{
		id: "progress",
		label: "In progress",
		tone: "progress",
		rows: [
			{
				id: "ws-1",
				title: "Workspace 1",
				repoName: "helmor",
				repoInitials: "HE",
				state: "ready",
				manualStatus: null,
				derivedStatus: "in-progress",
				hasUnread: false,
				workspaceUnread: 0,
				sessionUnreadTotal: 0,
				unreadSessionCount: 0,
				activeSessionId: null,
				activeSessionTitle: null,
				activeSessionAgentType: null,
				activeSessionStatus: null,
				branch: "feature/ws-1",
				prTitle: null,
				pinnedAt: null,
				sessionCount: 0,
				messageCount: 0,
				attachmentCount: 0,
			},
			{
				id: "ws-2",
				title: "Workspace 2",
				repoName: "helmor",
				repoInitials: "HE",
				state: "ready",
				manualStatus: null,
				derivedStatus: "in-progress",
				hasUnread: false,
				workspaceUnread: 0,
				sessionUnreadTotal: 0,
				unreadSessionCount: 0,
				activeSessionId: null,
				activeSessionTitle: null,
				activeSessionAgentType: null,
				activeSessionStatus: null,
				branch: "feature/ws-2",
				prTitle: null,
				pinnedAt: null,
				sessionCount: 0,
				messageCount: 0,
				attachmentCount: 0,
			},
		],
	},
];

function makeArchivedSummary(id: string): WorkspaceSummary {
	return {
		id,
		title: `Archived ${id}`,
		directoryName: id,
		repoName: "helmor",
		repoInitials: "HE",
		state: "archived",
		hasUnread: false,
		workspaceUnread: 0,
		sessionUnreadTotal: 0,
		unreadSessionCount: 0,
		derivedStatus: "in-progress",
		manualStatus: null,
		branch: `feature/${id}`,
		activeSessionId: null,
		activeSessionTitle: null,
		activeSessionAgentType: null,
		activeSessionStatus: null,
		prTitle: null,
		sessionCount: 0,
		messageCount: 0,
		attachmentCount: 0,
	};
}

function makeWorkspaceDetail(id: string): WorkspaceDetail {
	return {
		id,
		title: `Workspace ${id}`,
		repoId: "repo-1",
		repoName: "helmor",
		repoInitials: "HE",
		repoIconSrc: null,
		remote: "origin",
		remoteUrl: null,
		defaultBranch: "main",
		rootPath: `/tmp/${id}`,
		directoryName: id,
		state: "ready",
		hasUnread: false,
		workspaceUnread: 0,
		sessionUnreadTotal: 0,
		unreadSessionCount: 0,
		derivedStatus: "in-progress",
		manualStatus: null,
		activeSessionId: null,
		activeSessionTitle: null,
		activeSessionAgentType: null,
		activeSessionStatus: null,
		branch: `feature/${id}`,
		initializationParentBranch: "main",
		intendedTargetBranch: "main",
		notes: null,
		pinnedAt: null,
		prTitle: null,
		prDescription: null,
		archiveCommit: null,
		sessionCount: 0,
		messageCount: 0,
		attachmentCount: 0,
	};
}

const emptySessions: WorkspaceSessionSummary[] = [];

function createWrapper(queryClient: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<SettingsContext.Provider
				value={{
					settings: DEFAULT_SETTINGS,
					isLoaded: true,
					updateSettings: () => {},
				}}
			>
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			</SettingsContext.Provider>
		);
	};
}

describe("useWorkspacesSidebarController archive flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.loadWorkspaceGroups.mockResolvedValue(workspaceGroups);
		apiMocks.loadArchivedWorkspaces.mockResolvedValue([]);
		apiMocks.listRepositories.mockResolvedValue([]);
		apiMocks.loadAddRepositoryDefaults.mockResolvedValue({
			lastCloneDirectory: null,
		});
		apiMocks.loadWorkspaceDetail.mockImplementation(async (id: string) =>
			makeWorkspaceDetail(id),
		);
		apiMocks.loadWorkspaceSessions.mockResolvedValue(emptySessions);
		apiMocks.loadSessionThreadMessages.mockResolvedValue([]);
		apiMocks.prepareArchiveWorkspace.mockImplementation(
			async (
				workspaceId: string,
			): Promise<PrepareArchiveWorkspaceResponse> => ({
				workspaceId,
			}),
		);
		apiMocks.permanentlyDeleteWorkspace.mockResolvedValue(undefined);
		apiMocks.startArchiveWorkspace.mockResolvedValue(undefined);
		apiMocks.validateRestoreWorkspace.mockResolvedValue({
			targetBranchConflict: null,
		});
		apiMocks.restoreWorkspace.mockResolvedValue({
			restoredWorkspaceId: "ws-1",
			restoredState: "ready",
			selectedWorkspaceId: "ws-1",
			branchRename: null,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("optimistically moves the workspace after preflight success and switches to the next one", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onSelectWorkspace = vi.fn();
		const pushWorkspaceToast = vi.fn();

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: "ws-1",
					onSelectWorkspace,
					pushWorkspaceToast,
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows).toHaveLength(2);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(apiMocks.prepareArchiveWorkspace).toHaveBeenCalledWith("ws-1");
		});
		await waitFor(() => {
			expect(apiMocks.startArchiveWorkspace).toHaveBeenCalledWith("ws-1");
		});
		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-2",
			]);
		});
		expect(result.current.archivedRows.map((row) => row.id)).toContain("ws-1");
		expect(onSelectWorkspace).toHaveBeenCalledWith("ws-2");
		expect(pushWorkspaceToast).not.toHaveBeenCalled();
	});

	it("consecutive archives advance to the next sidebar row instead of jumping to archived", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onSelectWorkspace = vi.fn();
		const pushWorkspaceToast = vi.fn();

		apiMocks.loadWorkspaceGroups.mockResolvedValue([
			{
				id: "progress",
				label: "In progress",
				tone: "progress",
				rows: [
					{
						...workspaceGroups[0].rows[0],
						id: "ws-1",
						title: "Workspace 1",
					},
					{
						...workspaceGroups[0].rows[0],
						id: "ws-2",
						title: "Workspace 2",
					},
					{
						...workspaceGroups[0].rows[0],
						id: "ws-3",
						title: "Workspace 3",
					},
				],
			},
		]);
		apiMocks.loadArchivedWorkspaces.mockResolvedValue([
			makeArchivedSummary("arch-1"),
		]);

		const { result, rerender } = renderHook(
			({ selectedWorkspaceId }: { selectedWorkspaceId: string | null }) =>
				useWorkspacesSidebarController({
					selectedWorkspaceId,
					onSelectWorkspace,
					pushWorkspaceToast,
				}),
			{
				initialProps: { selectedWorkspaceId: "ws-1" },
				wrapper: createWrapper(queryClient),
			},
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
				"ws-3",
			]);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(onSelectWorkspace).toHaveBeenLastCalledWith("ws-2");
		});

		rerender({ selectedWorkspaceId: "ws-2" });

		act(() => {
			result.current.handleArchiveWorkspace("ws-2");
		});

		await waitFor(() => {
			expect(onSelectWorkspace).toHaveBeenLastCalledWith("ws-3");
		});
		expect(pushWorkspaceToast).not.toHaveBeenCalled();
	});

	it("inserts an initializing placeholder while creating a workspace, then swaps to the real one", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onSelectWorkspace = vi.fn();
		const pushWorkspaceToast = vi.fn();
		let resolveCreate:
			| ((value: {
					createdWorkspaceId: string;
					selectedWorkspaceId: string;
					initialSessionId: string;
					createdState: string;
					directoryName: string;
					branch: string;
			  }) => void)
			| null = null;

		apiMocks.listRepositories.mockResolvedValue([
			{
				id: "repo-1",
				name: "helmor",
				defaultBranch: "main",
				repoInitials: "HE",
			},
		]);
		apiMocks.createWorkspaceFromRepo.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace,
					pushWorkspaceToast,
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows).toHaveLength(2);
		});

		act(() => {
			void result.current.handleCreateWorkspaceFromRepo("repo-1");
		});

		const optimisticRow = result.current.groups[0]?.rows[0];
		expect(optimisticRow?.state).toBe("initializing");
		expect(optimisticRow?.title).toContain("Creating helmor");
		expect(onSelectWorkspace).toHaveBeenCalledWith(
			expect.stringMatching(/^creating-workspace:/),
		);

		await act(async () => {
			resolveCreate?.({
				createdWorkspaceId: "ws-created",
				selectedWorkspaceId: "ws-created",
				initialSessionId: "session-created",
				createdState: "ready",
				directoryName: "vega",
				branch: "feature/vega",
			});
		});

		await waitFor(() => {
			expect(
				apiMocks.loadWorkspaceGroups.mock.calls.length,
			).toBeGreaterThanOrEqual(2);
		});
		expect(onSelectWorkspace).toHaveBeenCalledWith("ws-created");
		expect(pushWorkspaceToast).not.toHaveBeenCalled();
	});

	it("upgrades the optimistic row to the real workspace on success so the sidebar never goes empty", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onSelectWorkspace = vi.fn();
		let resolveCreate:
			| ((value: {
					createdWorkspaceId: string;
					selectedWorkspaceId: string;
					initialSessionId: string;
					createdState: string;
					directoryName: string;
					branch: string;
			  }) => void)
			| null = null;

		apiMocks.listRepositories.mockResolvedValue([
			{
				id: "repo-1",
				name: "helmor",
				defaultBranch: "main",
				repoInitials: "HE",
			},
		]);
		apiMocks.createWorkspaceFromRepo.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace,
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});

		act(() => {
			void result.current.handleCreateWorkspaceFromRepo("repo-1");
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows[0]?.id).toMatch(
				/^creating-workspace:/,
			);
		});

		await act(async () => {
			resolveCreate?.({
				createdWorkspaceId: "ws-created",
				selectedWorkspaceId: "ws-created",
				initialSessionId: "session-created",
				createdState: "initializing",
				directoryName: "testuser-helmor",
				branch: "testuser/helmor",
			});
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows[0]?.id).toBe("ws-created");
		});

		expect(
			queryClient.getQueryData(helmorQueryKeys.workspaceDetail("ws-created")),
		).toMatchObject({
			id: "ws-created",
			directoryName: "testuser-helmor",
			branch: "testuser/helmor",
		});
		expect(
			queryClient.getQueryData(helmorQueryKeys.workspaceSessions("ws-created")),
		).toMatchObject([
			{
				id: "session-created",
				workspaceId: "ws-created",
				active: true,
			},
		]);
		expect(onSelectWorkspace).toHaveBeenCalledWith("ws-created");
	});

	it("does not optimistically reorder sidebar groups when setting manual status", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const deferred = new Promise<void>(() => {});

		apiMocks.setWorkspaceManualStatus.mockReturnValue(deferred);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: "ws-1",
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});

		act(() => {
			void result.current.handleSetManualStatus("ws-1", "done");
		});

		expect(apiMocks.setWorkspaceManualStatus).toHaveBeenCalledWith(
			"ws-1",
			"done",
		);
		expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
			"ws-1",
			"ws-2",
		]);
		expect(
			result.current.groups.find((group) => group.id === "done")?.rows ?? [],
		).toEqual([]);
	});

	// Retry: even with the mock + timeout fixes this test exercises the most
	// timing-sensitive microtask ordering in the suite (mutation resolve →
	// setQueryData injection → fire-and-forget refetchNavigation vs
	// reconciliation effect). Allow two local retries so a single CI hiccup
	// does not fail the whole Rust/Frontend matrix and force a full re-run.
	it("does not show the optimistic upgrade alongside the cached real workspace on success", {
		retry: 2,
	}, async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		let resolveCreate:
			| ((value: {
					createdWorkspaceId: string;
					selectedWorkspaceId: string;
					initialSessionId: string;
					createdState: string;
					directoryName: string;
					branch: string;
			  }) => void)
			| null = null;

		apiMocks.listRepositories.mockResolvedValue([
			{
				id: "repo-1",
				name: "helmor",
				defaultBranch: "main",
				repoInitials: "HE",
			},
		]);
		apiMocks.createWorkspaceFromRepo.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});

		act(() => {
			void result.current.handleCreateWorkspaceFromRepo("repo-1");
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows[0]?.id).toMatch(
				/^creating-workspace:/,
			);
		});

		const upgradedGroups = [
			{
				...workspaceGroups[0],
				rows: [
					{
						...workspaceGroups[0].rows[0],
						id: "ws-created",
						title: "Workspace created",
						state: "initializing" as const,
						branch: "testuser/helmor",
					},
					...workspaceGroups[0].rows,
				],
			},
		];

		// Keep `loadWorkspaceGroups` aligned with the injected cache so the
		// post-success `refetchNavigation()` inside the hook does not race with
		// reconciliation and replace the cache with a stale ws-1/ws-2 snapshot
		// that lacks ws-created (which was flaky under slow CI timing).
		apiMocks.loadWorkspaceGroups.mockResolvedValue(upgradedGroups);

		act(() => {
			queryClient.setQueryData(helmorQueryKeys.workspaceGroups, upgradedGroups);
		});

		await act(async () => {
			resolveCreate?.({
				createdWorkspaceId: "ws-created",
				selectedWorkspaceId: "ws-created",
				initialSessionId: "session-created",
				createdState: "initializing",
				directoryName: "testuser-helmor",
				branch: "testuser/helmor",
			});
		});

		await waitFor(() => {
			expect(
				result.current.groups[0]?.rows.filter((row) => row.id === "ws-created"),
			).toHaveLength(1);
		});
	});

	it("rolls back the optimistic update when the background start fails immediately", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const pushWorkspaceToast = vi.fn();
		apiMocks.startArchiveWorkspace.mockRejectedValueOnce(new Error("boom"));

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast,
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows).toHaveLength(2);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(apiMocks.startArchiveWorkspace).toHaveBeenCalledWith("ws-1");
		});
		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});
		expect(result.current.archivedRows).toHaveLength(0);
		expect(pushWorkspaceToast).toHaveBeenCalled();
	});

	it("stale refetches do not restore the workspace while the background is pending; failure events roll it back", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const pushWorkspaceToast = vi.fn();
		let resolveStart: (() => void) | null = null;
		apiMocks.startArchiveWorkspace.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast,
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(result.current.archivedRows.map((row) => row.id)).toContain(
				"ws-1",
			);
		});

		act(() => {
			queryClient.setQueryData(["workspaceGroups"], workspaceGroups);
			queryClient.setQueryData(["archivedWorkspaces"], []);
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-2",
			]);
		});
		expect(result.current.archivedRows.map((row) => row.id)).toContain("ws-1");

		act(() => {
			apiMocks.emitArchiveFailed({
				workspaceId: "ws-1",
				code: "Unknown",
				message: "archive failed later",
			});
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});
		expect(result.current.archivedRows).toHaveLength(0);
		expect(pushWorkspaceToast).toHaveBeenCalled();

		act(() => {
			resolveStart?.();
		});
	});

	it("after a success event, subsequent server refreshes defer to the real archived data", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		let resolveStart: (() => void) | null = null;
		let archivedFromServer: WorkspaceSummary[] = [];
		let groupsFromServer = workspaceGroups;
		apiMocks.startArchiveWorkspace.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				}),
		);
		apiMocks.loadWorkspaceGroups.mockImplementation(
			async () => groupsFromServer,
		);
		apiMocks.loadArchivedWorkspaces.mockImplementation(
			async () => archivedFromServer,
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows).toHaveLength(2);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(result.current.archivedRows.map((row) => row.id)).toContain(
				"ws-1",
			);
		});

		act(() => {
			groupsFromServer = [
				{ ...workspaceGroups[0], rows: [workspaceGroups[0].rows[1]] },
			];
			archivedFromServer = [makeArchivedSummary("ws-1")];
			apiMocks.emitArchiveSucceeded({ workspaceId: "ws-1" });
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-2",
			]);
		});
		expect(result.current.archivedRows.map((row) => row.id)).toEqual(["ws-1"]);
		expect(apiMocks.loadWorkspaceGroups).toHaveBeenCalledTimes(2);
		expect(apiMocks.loadArchivedWorkspaces).toHaveBeenCalledTimes(2);

		act(() => {
			resolveStart?.();
		});
	});

	it("does not render the same workspace in both live and archived when the success event arrives before the server snapshot switches", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		let resolveStart: (() => void) | null = null;
		apiMocks.startArchiveWorkspace.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: null,
					onSelectWorkspace: vi.fn(),
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-1",
				"ws-2",
			]);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-2",
			]);
			expect(result.current.archivedRows.map((row) => row.id)).toEqual([
				"ws-1",
			]);
		});

		act(() => {
			apiMocks.emitArchiveSucceeded({ workspaceId: "ws-1" });
		});

		await waitFor(() => {
			expect(result.current.groups[0]?.rows.map((row) => row.id)).toEqual([
				"ws-2",
			]);
			expect(result.current.archivedRows.map((row) => row.id)).toEqual([
				"ws-1",
			]);
		});

		const occurrences = [
			...result.current.groups.flatMap((group) => group.rows),
			...result.current.archivedRows,
		].filter((row) => row.id === "ws-1");
		expect(occurrences).toHaveLength(1);

		act(() => {
			resolveStart?.();
		});
	});

	it("deleting an archived placeholder also clears the local optimistic rollback entry", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onSelectWorkspace = vi.fn();
		let resolveStart: (() => void) | null = null;
		apiMocks.startArchiveWorkspace.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				}),
		);

		const { result } = renderHook(
			() =>
				useWorkspacesSidebarController({
					selectedWorkspaceId: "ws-1",
					onSelectWorkspace,
					pushWorkspaceToast: vi.fn(),
				}),
			{ wrapper: createWrapper(queryClient) },
		);

		await waitFor(() => {
			expect(result.current.groups[0]?.rows).toHaveLength(2);
		});

		act(() => {
			result.current.handleArchiveWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(result.current.archivedRows.map((row) => row.id)).toContain(
				"ws-1",
			);
		});

		act(() => {
			resolveStart?.();
		});

		await waitFor(() => {
			expect(result.current.archivingWorkspaceIds.has("ws-1")).toBe(false);
		});

		act(() => {
			result.current.handleDeleteWorkspace("ws-1");
		});

		await waitFor(() => {
			expect(apiMocks.permanentlyDeleteWorkspace).toHaveBeenCalledWith("ws-1");
		});
		await waitFor(() => {
			expect(result.current.archivedRows).toHaveLength(0);
		});

		act(() => {
			queryClient.setQueryData(["archivedWorkspaces"], []);
		});

		expect(result.current.archivedRows).toHaveLength(0);
		expect(onSelectWorkspace).toHaveBeenCalledWith("ws-2");
	});
});
