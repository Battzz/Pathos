import { invoke } from "@tauri-apps/api/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
	loadGithubIdentitySession: vi.fn(),
	cancelGithubIdentityConnect: vi.fn(),
	listenGithubIdentityChanged: vi.fn(),
	disconnectGithubIdentity: vi.fn(),
	loadWorkspaceGroups: vi.fn(),
	loadArchivedWorkspaces: vi.fn(),
	loadAgentModelSections: vi.fn(),
	listRepositories: vi.fn(),
	loadWorkspaceDetail: vi.fn(),
	loadWorkspaceSessions: vi.fn(),
	loadSessionMessages: vi.fn(),
	loadSessionThreadMessages: vi.fn(),
}));

const openerMocks = vi.hoisted(() => ({
	openUrl: vi.fn(),
}));

vi.mock("./App.css", () => ({}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: openerMocks.openUrl,
}));

vi.mock("./lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./lib/api")>();

	return {
		...actual,
		loadGithubIdentitySession: apiMocks.loadGithubIdentitySession,
		cancelGithubIdentityConnect: apiMocks.cancelGithubIdentityConnect,
		listenGithubIdentityChanged: apiMocks.listenGithubIdentityChanged,
		disconnectGithubIdentity: apiMocks.disconnectGithubIdentity,
		loadWorkspaceGroups: apiMocks.loadWorkspaceGroups,
		loadArchivedWorkspaces: apiMocks.loadArchivedWorkspaces,
		loadAgentModelSections: apiMocks.loadAgentModelSections,
		listRepositories: apiMocks.listRepositories,
		loadWorkspaceDetail: apiMocks.loadWorkspaceDetail,
		loadWorkspaceSessions: apiMocks.loadWorkspaceSessions,
		loadSessionMessages: apiMocks.loadSessionThreadMessages,
		loadSessionThreadMessages: apiMocks.loadSessionThreadMessages,
	};
});

import App from "./App";

function installTauriRuntime() {
	Object.defineProperty(window, "__TAURI_INTERNALS__", {
		value: {},
		configurable: true,
	});
}

function removeTauriRuntime() {
	Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
}

function mockWorkspaceData() {
	apiMocks.loadWorkspaceGroups.mockResolvedValue([
		{
			id: "progress",
			label: "In progress",
			tone: "progress",
			rows: [
				{
					id: "workspace-1",
					title: "Authenticated workspace",
					repoName: "pathos-core",
					state: "ready",
				},
			],
		},
	]);
	apiMocks.loadArchivedWorkspaces.mockResolvedValue([]);
	apiMocks.loadAgentModelSections.mockResolvedValue([]);
	apiMocks.listRepositories.mockResolvedValue([]);
	apiMocks.loadWorkspaceDetail.mockResolvedValue({
		id: "workspace-1",
		title: "Authenticated workspace",
		repoId: "repo-1",
		repoName: "pathos-core",
		directoryName: "authenticated-workspace",
		state: "ready",
		hasUnread: false,
		workspaceUnread: 0,
		unreadSessionCount: 0,
		status: "in-progress",
		activeSessionId: "session-1",
		activeSessionTitle: "Untitled",
		activeSessionAgentType: "claude",
		activeSessionStatus: "idle",
		branch: "main",
		initializationParentBranch: "main",
		intendedTargetBranch: "main",
		pinnedAt: null,
		prTitle: null,
		archiveCommit: null,
		sessionCount: 1,
		messageCount: 0,
	});
	apiMocks.loadWorkspaceSessions.mockResolvedValue([
		{
			id: "session-1",
			workspaceId: "workspace-1",
			title: "Untitled",
			agentType: "claude",
			status: "idle",
			model: "opus",
			permissionMode: "default",
			providerSessionId: null,
			unreadCount: 0,
			codexThinkingLevel: null,
			fastMode: false,
			createdAt: "2026-04-04T00:00:00Z",
			updatedAt: "2026-04-04T00:00:00Z",
			lastUserMessageAt: null,
			isHidden: false,
			active: true,
		},
	]);
	apiMocks.loadSessionMessages.mockResolvedValue([]);
	apiMocks.loadSessionThreadMessages.mockResolvedValue([]);
}

describe("App GitHub identity states", () => {
	beforeEach(() => {
		window.localStorage.clear();
		installTauriRuntime();
		vi.mocked(invoke).mockClear();
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: vi.fn(async () => undefined),
			},
		});

		apiMocks.loadGithubIdentitySession.mockReset();
		apiMocks.cancelGithubIdentityConnect.mockReset();
		apiMocks.listenGithubIdentityChanged.mockReset();
		apiMocks.disconnectGithubIdentity.mockReset();
		apiMocks.loadWorkspaceGroups.mockReset();
		apiMocks.loadArchivedWorkspaces.mockReset();
		apiMocks.loadAgentModelSections.mockReset();
		apiMocks.listRepositories.mockReset();
		apiMocks.loadWorkspaceDetail.mockReset();
		apiMocks.loadWorkspaceSessions.mockReset();
		apiMocks.loadSessionMessages.mockReset();
		apiMocks.loadSessionThreadMessages.mockReset();
		openerMocks.openUrl.mockReset();

		apiMocks.loadGithubIdentitySession.mockResolvedValue({
			status: "disconnected",
		});
		apiMocks.cancelGithubIdentityConnect.mockResolvedValue(undefined);
		apiMocks.disconnectGithubIdentity.mockResolvedValue(undefined);
		apiMocks.listenGithubIdentityChanged.mockImplementation(async () => {
			return () => {};
		});

		mockWorkspaceData();
	});

	afterEach(() => {
		removeTauriRuntime();
		cleanup();
	});

	it("shows app onboarding while preloading GitHub identity", async () => {
		const invokeMock = vi.mocked(invoke);
		invokeMock.mockImplementationOnce(async (command) => {
			if (command === "get_app_settings") {
				return {
					"app.onboarding_completed": "false",
				};
			}
			return undefined;
		});

		render(<App />);

		expect(
			await screen.findByRole("main", { name: "Pathos onboarding" }),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Welcome to Pathos")).toBeInTheDocument();
		await waitFor(() =>
			expect(apiMocks.loadGithubIdentitySession).toHaveBeenCalled(),
		);
		expect(
			screen.queryByRole("main", { name: "GitHub identity gate" }),
		).not.toBeInTheDocument();
	});

	it("renders the shell while GitHub account is disconnected", async () => {
		render(<App />);

		expect(
			await screen.findByRole("main", { name: "Application shell" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("main", { name: "GitHub identity gate" }),
		).not.toBeInTheDocument();
		await waitFor(() =>
			expect(apiMocks.loadGithubIdentitySession).toHaveBeenCalled(),
		);
	});

	it("renders the shell when GitHub CLI is unconfigured", async () => {
		apiMocks.loadGithubIdentitySession.mockResolvedValue({
			status: "unconfigured",
			message: "GitHub CLI is not available.",
		});

		render(<App />);
		expect(
			await screen.findByRole("main", { name: "Application shell" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("main", { name: "GitHub identity gate" }),
		).not.toBeInTheDocument();
		await waitFor(() =>
			expect(apiMocks.loadGithubIdentitySession).toHaveBeenCalled(),
		);
	});
});
