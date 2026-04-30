import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkspaceDetail, WorkspaceSessionSummary } from "@/lib/api";
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

	it("renders project onboarding copy when no session exists", () => {
		renderPanel({
			workspace: {
				...WORKSPACE,
				activeSessionId: null,
				activeSessionTitle: null,
			},
			sessions: [],
			selectedSessionId: null,
		});

		expect(
			screen.getByRole("heading", { name: "Bring a project into Pathos" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Open a local codebase or clone a remote repository to begin a focused workspace.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open project" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Clone from URL" }),
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
});
