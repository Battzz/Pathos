import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
	ThreadMessageLike,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { createPathosQueryClient } from "@/lib/query-client";

vi.mock("@/components/icons", () => ({
	ClaudeIcon: (props: { className?: string }) => (
		<span data-testid="claude-icon" {...props}>
			claude-icon
		</span>
	),
	OpenAIIcon: (props: { className?: string }) => (
		<span data-testid="codex-icon" {...props}>
			codex-icon
		</span>
	),
}));

import { WorkspacePanel } from "./index";

const WORKSPACE: WorkspaceDetail = {
	id: "workspace-1",
	title: "Workspace 1",
	repoId: "repo-1",
	repoName: "pathos",
	directoryName: "pathos",
	state: "ready",
	hasUnread: false,
	workspaceUnread: 0,
	unreadSessionCount: 0,
	status: "in-progress",
	activeSessionId: "session-1",
	activeSessionTitle: "Session 1",
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
	rootPath: "/tmp/pathos",
	isGit: true,
};

const SESSIONS: WorkspaceSessionSummary[] = [
	{
		id: "session-1",
		workspaceId: "workspace-1",
		title: "Session 1",
		agentType: "claude",
		status: "idle",
		model: "opus",
		permissionMode: "default",
		providerSessionId: null,
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt: "2026-04-10T00:00:00Z",
		updatedAt: "2026-04-10T00:00:00Z",
		lastUserMessageAt: null,
		isHidden: false,
		actionKind: null,
		active: true,
	},
];

function assistantMessage(id: string, text: string): ThreadMessageLike {
	return {
		id,
		role: "assistant",
		createdAt: "2026-04-10T00:00:00Z",
		content: [{ type: "text", id: `${id}:text`, text }],
	};
}

function renderPanel(
	props: Partial<React.ComponentProps<typeof WorkspacePanel>> = {},
) {
	return render(
		<TooltipProvider delayDuration={0}>
			<QueryClientProvider client={createPathosQueryClient()}>
				<WorkspacePanel
					workspace={WORKSPACE}
					sessions={SESSIONS}
					selectedSessionId="session-1"
					sessionPanes={[]}
					sending={false}
					{...props}
				/>
			</QueryClientProvider>
		</TooltipProvider>,
	);
}

describe("WorkspacePanel", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows the selected provider in the empty session heading", () => {
		renderPanel({
			sessionDisplayProviders: {
				"session-1": "codex",
			},
			sessionPanes: [
				{
					sessionId: "session-1",
					messages: [],
					sending: false,
					hasLoaded: true,
					presentationState: "presented",
				},
			],
		});

		expect(
			screen.getByRole("heading", { name: "Chat with OpenAI" }),
		).toBeInTheDocument();
		expect(screen.getByTestId("codex-icon")).toBeInTheDocument();
	});

	it("keeps the cold placeholder while the selected session pane is not ready", () => {
		renderPanel({
			sessionDisplayProviders: {
				"session-1": "codex",
			},
			sessionPanes: [
				{
					sessionId: "previous-session",
					messages: [assistantMessage("previous-message", "Already loaded")],
					sending: false,
					hasLoaded: true,
					presentationState: "cached",
				},
			],
		});

		expect(
			screen.queryByRole("heading", { name: "Chat with OpenAI" }),
		).not.toBeInTheDocument();
		expect(screen.queryByTestId("codex-icon")).not.toBeInTheDocument();
	});

	it("renders session guidance when no session exists", () => {
		renderPanel({
			workspace: {
				...WORKSPACE,
				activeSessionId: null,
				activeSessionTitle: null,
			},
			sessions: [],
			selectedSessionId: null,
		});

		expect(screen.getByRole("heading", { name: "pathos" })).toBeInTheDocument();
		expect(
			screen.getByText(
				"Start a thread to work inside this project, or bring in another repository for something new.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open project" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Clone from URL" }),
		).toBeInTheDocument();
	});

	it("renders selected-workspace guidance when sessions exist but none is selected", () => {
		renderPanel({
			selectedSessionId: null,
		});

		expect(screen.getByRole("heading", { name: "pathos" })).toBeInTheDocument();
		expect(
			screen.getByText(
				"Choose an existing thread from the sidebar, or start a fresh one when you are ready.",
			),
		).toBeInTheDocument();
	});

	it("renders project picker guidance when no workspace is selected", () => {
		renderPanel({
			workspace: null,
			sessions: [],
			selectedSessionId: null,
		});

		expect(
			screen.getByRole("heading", { name: "Choose a workspace" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Pathos" }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("First")).not.toBeInTheDocument();
		expect(screen.queryByText("Then")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open project" }),
		).toBeInTheDocument();
	});

	it("shows the initializing state while a project is being prepared", () => {
		renderPanel({
			workspace: { ...WORKSPACE, state: "initializing" },
			sessions: [],
			selectedSessionId: null,
		});

		expect(screen.getByText(/Preparing workspace/i)).toBeInTheDocument();
	});

	it("does not display a cached inactive pane while the selected session loads", () => {
		renderPanel({
			loadingSession: true,
			sessionPanes: [
				{
					sessionId: "session-2",
					messages: [assistantMessage("assistant-2", "old cached answer")],
					sending: false,
					hasLoaded: true,
					presentationState: "cached",
				},
			],
		});

		expect(
			screen.queryByLabelText("Conversation rows for session session-2"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("old cached answer")).not.toBeInTheDocument();
	});
});
