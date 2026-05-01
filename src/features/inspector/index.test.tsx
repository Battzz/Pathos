import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgeActionStatus, WorkspaceGitActionStatus } from "@/lib/api";
import { ComposerInsertProvider } from "@/lib/composer-insert-context";
import { renderWithProviders } from "@/test/render-with-providers";
import { WorkspaceInspectorSidebar } from "./index";
import { ActionsMenu, ActionsSection } from "./sections/actions";

const apiMocks = vi.hoisted(() => ({
	listWorkspaceChangesWithContent: vi.fn(),
	getWorkspaceForgeCheckInsertText: vi.fn(),
	loadWorkspaceGitActionStatus: vi.fn(),
	loadWorkspaceForgeActionStatus: vi.fn(),
	syncWorkspaceWithTargetBranch: vi.fn(),
}));

const openerMocks = vi.hoisted(() => ({
	openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: openerMocks.openUrl,
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();

	return {
		...actual,
		getWorkspaceForgeCheckInsertText: apiMocks.getWorkspaceForgeCheckInsertText,
		listWorkspaceChangesWithContent: apiMocks.listWorkspaceChangesWithContent,
		loadWorkspaceGitActionStatus: apiMocks.loadWorkspaceGitActionStatus,
		loadWorkspaceForgeActionStatus: apiMocks.loadWorkspaceForgeActionStatus,
		syncWorkspaceWithTargetBranch: apiMocks.syncWorkspaceWithTargetBranch,
	};
});

function cleanGitStatus(): WorkspaceGitActionStatus {
	return {
		uncommittedCount: 0,
		conflictCount: 0,
		syncTargetBranch: "main",
		syncStatus: "upToDate",
		behindTargetCount: 0,
		remoteTrackingRef: "refs/remotes/origin/main",
		aheadOfRemoteCount: 0,
		pushStatus: "published",
	};
}

function emptyPrStatus(
	patch: Partial<ForgeActionStatus> = {},
): ForgeActionStatus {
	return {
		changeRequest: null,
		reviewDecision: null,
		mergeable: null,
		deployments: [],
		checks: [],
		remoteState: "unavailable",
		message: null,
		...patch,
	};
}

function renderInspector(
	props: Partial<ComponentProps<typeof WorkspaceInspectorSidebar>> = {},
) {
	return renderWithProviders(
		<WorkspaceInspectorSidebar
			workspaceId="workspace-1"
			workspaceRootPath="/tmp/workspace"
			workspaceBranch="feature/actions"
			workspaceDefaultBranch="main"
			workspaceTargetBranch="main"
			workspaceRemote="testuser"
			editorMode={false}
			onOpenEditorFile={vi.fn()}
			currentSessionId="session-1"
			{...props}
		/>,
	);
}

function renderActionsMenu(
	props: Partial<ComponentProps<typeof ActionsMenu>> = {},
) {
	return renderWithProviders(
		<ActionsMenu
			workspaceId={props.workspaceId ?? "workspace-1"}
			workspaceState={props.workspaceState}
			repoId={props.repoId}
			workspaceBranch={props.workspaceBranch ?? "feature/actions"}
			workspaceDefaultBranch={props.workspaceDefaultBranch ?? "main"}
			workspaceRemote={props.workspaceRemote ?? "testuser"}
			onCommitAction={props.onCommitAction}
			currentSessionId={props.currentSessionId ?? "session-1"}
			onQueuePendingPromptForSession={props.onQueuePendingPromptForSession}
			commitButtonMode={props.commitButtonMode}
			commitButtonState={props.commitButtonState}
			changeRequest={props.changeRequest ?? null}
		/>,
	);
}

function expectTextBefore(
	container: HTMLElement,
	first: string,
	second: string,
) {
	const firstNode = within(container).getByText(first);
	const secondNode = within(container).getByText(second);
	expect(
		firstNode.compareDocumentPosition(secondNode) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
}

describe("WorkspaceInspectorSidebar Actions section", () => {
	beforeEach(() => {
		apiMocks.listWorkspaceChangesWithContent.mockReset();
		apiMocks.getWorkspaceForgeCheckInsertText.mockReset();
		apiMocks.loadWorkspaceGitActionStatus.mockReset();
		apiMocks.loadWorkspaceForgeActionStatus.mockReset();
		apiMocks.syncWorkspaceWithTargetBranch.mockReset();
		openerMocks.openUrl.mockReset();

		apiMocks.listWorkspaceChangesWithContent.mockResolvedValue({
			items: [],
			prefetched: [],
		});
		apiMocks.getWorkspaceForgeCheckInsertText.mockResolvedValue(
			"Content Log:\ncheck output",
		);
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue(cleanGitStatus());
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(emptyPrStatus());
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "updated",
			targetBranch: "main",
			conflictedFiles: [],
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("hides deployments and checks when remote arrays are empty", async () => {
		renderInspector();

		await screen.findByText("No uncommitted changes");

		const actions = screen.getByLabelText("Inspector section Actions");
		expect(within(actions).queryByText("Deployments")).not.toBeInTheDocument();
		expect(within(actions).queryByText("Checks")).not.toBeInTheDocument();
		expect(within(actions).queryByText("marketing")).not.toBeInTheDocument();
		expect(
			within(actions).queryByText("staging-locked"),
		).not.toBeInTheDocument();
	});

	it("uses one Changes header for unstaged file controls", async () => {
		apiMocks.listWorkspaceChangesWithContent.mockResolvedValue({
			items: [
				{
					path: "vetro-stub.md",
					absolutePath: "/tmp/workspace/vetro-stub.md",
					name: "vetro-stub.md",
					status: "A",
					unstagedStatus: "A",
					stagedStatus: null,
					committedStatus: null,
					insertions: 4,
					deletions: 0,
				},
			],
			prefetched: [],
		});

		renderInspector();

		await screen.findByText("vetro-stub.md");

		const changes = screen.getByLabelText("Inspector section Changes");
		expect(within(changes).getAllByText("Changes")).toHaveLength(1);
		expect(
			within(changes).getByRole("button", { name: "Stage all changes" }),
		).toBeInTheDocument();
	});

	it("uses the same Changes header for staged file controls", async () => {
		apiMocks.listWorkspaceChangesWithContent.mockResolvedValue({
			items: [
				{
					path: "vetro-stub.md",
					absolutePath: "/tmp/workspace/vetro-stub.md",
					name: "vetro-stub.md",
					status: "A",
					unstagedStatus: null,
					stagedStatus: "A",
					committedStatus: null,
					insertions: 4,
					deletions: 0,
				},
			],
			prefetched: [],
		});

		renderInspector();

		await screen.findByText("vetro-stub.md");

		const changes = screen.getByLabelText("Inspector section Changes");
		expect(within(changes).getAllByText("Changes")).toHaveLength(1);
		expect(
			within(changes).queryByText("Staged Changes"),
		).not.toBeInTheDocument();
		expect(
			within(changes).getByRole("button", { name: "Unstage all changes" }),
		).toBeInTheDocument();
	});

	it("resizes the changes panel through a CSS variable during drag", async () => {
		const originalRequestAnimationFrame = window.requestAnimationFrame;
		const originalCancelAnimationFrame = window.cancelAnimationFrame;
		window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		window.cancelAnimationFrame = vi.fn();

		try {
			const user = userEvent.setup();
			renderInspector();

			await screen.findByText("No uncommitted changes");
			await user.click(
				screen.getByRole("button", { name: "Toggle inspector tabs section" }),
			);

			const inspector = screen.getByLabelText("Inspector section Changes")
				.parentElement as HTMLElement;
			const initialHeight = Number.parseInt(
				inspector.style.getPropertyValue("--pathos-inspector-changes-height"),
				10,
			);

			// With both Changes and Actions resize handles visible when tabs
			// are open, the first separator is the changes/actions divider.
			const [changesSeparator] = screen.getAllByRole("separator");
			fireEvent.mouseDown(changesSeparator, {
				clientY: 100,
			});
			fireEvent.mouseMove(window, { clientY: 150 });

			expect(
				inspector.style.getPropertyValue("--pathos-inspector-changes-height"),
			).toBe(`${initialHeight + 50}px`);

			fireEvent.mouseUp(window);
			expect(
				inspector.style.getPropertyValue("--pathos-inspector-changes-height"),
			).toBe(`${initialHeight + 50}px`);
		} finally {
			window.requestAnimationFrame = originalRequestAnimationFrame;
			window.cancelAnimationFrame = originalCancelAnimationFrame;
		}
	});

	it("resizes the actions panel from the Actions header during drag", async () => {
		const originalRequestAnimationFrame = window.requestAnimationFrame;
		const originalCancelAnimationFrame = window.cancelAnimationFrame;
		window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		window.cancelAnimationFrame = vi.fn();

		try {
			renderInspector();

			await screen.findByText("No uncommitted changes");

			const inspector = screen.getByLabelText("Inspector section Changes")
				.parentElement as HTMLElement;
			const initialHeight = Number.parseInt(
				inspector.style.getPropertyValue("--pathos-inspector-actions-height"),
				10,
			);
			const actionsBody = screen.getByLabelText("Actions panel body");
			expect(actionsBody).toHaveStyle({
				height: `var(--pathos-inspector-actions-height, ${initialHeight}px)`,
			});

			fireEvent.mouseDown(
				screen.getByRole("separator", { name: "Resize actions panel" }),
				{ clientY: 100 },
			);
			fireEvent.mouseMove(window, { clientY: 70 });

			expect(
				inspector.style.getPropertyValue("--pathos-inspector-actions-height"),
			).toBe(`${initialHeight + 30}px`);

			fireEvent.mouseUp(window);
			expect(
				inspector.style.getPropertyValue("--pathos-inspector-actions-height"),
			).toBe(`${initialHeight + 30}px`);
		} finally {
			window.requestAnimationFrame = originalRequestAnimationFrame;
			window.cancelAnimationFrame = originalCancelAnimationFrame;
		}
	});

	it("labels branch changes as incoming pull changes when the target is behind", async () => {
		apiMocks.listWorkspaceChangesWithContent.mockResolvedValue({
			items: [
				{
					path: "src/incoming.ts",
					absolutePath: "/tmp/workspace/src/incoming.ts",
					name: "incoming.ts",
					status: "M",
					unstagedStatus: null,
					stagedStatus: null,
					committedStatus: "M",
					insertions: 8,
					deletions: 2,
				},
			],
			prefetched: [],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			...cleanGitStatus(),
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector();

		const changes = screen.getByLabelText("Inspector section Changes");
		expect(
			await within(changes).findByText("Pull from testuser/main"),
		).toBeInTheDocument();
	});

	it("shows clean git rows with passed status icons", async () => {
		renderInspector();

		await screen.findByText("Up to date with testuser/main");

		const actions = screen.getByLabelText("Inspector section Actions");
		expect(
			within(actions).getByText("Up to date with testuser/main"),
		).toBeInTheDocument();
		expect(
			within(actions).getByText("Waiting for PR review"),
		).toBeInTheDocument();
		expect(
			within(actions).getByText("Branch fully pushed"),
		).toBeInTheDocument();
		expect(within(actions).getAllByLabelText("Passed")).toHaveLength(3);
	});

	it("offers create PR from the actions surface", async () => {
		const user = userEvent.setup();
		const onCommitAction = vi.fn();

		renderInspector({ onCommitAction, commitButtonMode: "create-pr" });

		await screen.findByText("No pull request");
		await user.click(screen.getByRole("button", { name: "Create PR" }));

		expect(onCommitAction).toHaveBeenCalledWith("create-pr");
	});

	it("marks the header actions trigger when a commit and push is available", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			...cleanGitStatus(),
			uncommittedCount: 2,
		});

		renderActionsMenu({ commitButtonMode: "commit-and-push" });

		expect(
			await screen.findByLabelText(
				"Open workspace actions: Commit and push available",
			),
		).toBeInTheDocument();
	});

	it("marks the header actions trigger when a pull is needed", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			...cleanGitStatus(),
			syncStatus: "behind",
			behindTargetCount: 3,
		});

		renderActionsMenu({ commitButtonMode: "create-pr" });

		expect(
			await screen.findByLabelText("Open workspace actions: Pull needed"),
		).toBeInTheDocument();
	});

	it("marks the header actions trigger when a pull request can be opened", async () => {
		renderActionsMenu({ commitButtonMode: "create-pr" });

		expect(
			await screen.findByLabelText(
				"Open workspace actions: Create PR available",
			),
		).toBeInTheDocument();
	});

	it("does not mark create PR on the default branch", async () => {
		renderActionsMenu({
			commitButtonMode: "create-pr",
			workspaceBranch: "main",
			workspaceDefaultBranch: "main",
		});

		expect(
			await screen.findByLabelText("Open workspace actions"),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Open workspace actions: Create PR available"),
		).not.toBeInTheDocument();
	});

	it("marks the header actions trigger when a pull request can be merged", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				mergeable: "MERGEABLE",
			}),
		);

		renderActionsMenu({
			commitButtonMode: "merge",
			changeRequest: {
				url: "https://github.com/acme/repo/pull/1",
				number: 1,
				state: "OPEN",
				title: "Ready",
				isMerged: false,
			},
		});

		expect(
			await screen.findByLabelText("Open workspace actions: Merge available"),
		).toBeInTheDocument();
	});

	it("keeps the actions scroll area shrinkable when tabs are collapsed", async () => {
		renderInspector();

		await screen.findByText("Up to date with testuser/main");

		const actionsBody = screen.getByLabelText("Actions panel body");
		expect(actionsBody).toHaveClass("min-h-0");
	});

	it("shows dirty and conflicting git rows and reuses commit action handlers", async () => {
		const user = userEvent.setup();
		const onCommitAction = vi.fn();
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 2,
			conflictCount: 1,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({ onCommitAction });

		await screen.findByText("2 uncommitted changes");
		await user.click(screen.getByRole("button", { name: "Commit and push" }));
		await user.click(screen.getByRole("button", { name: "Resolve" }));

		expect(onCommitAction).toHaveBeenCalledWith("commit-and-push");
		expect(onCommitAction).toHaveBeenCalledWith("resolve-conflicts");
	});

	it("shows pull when target branch is behind and triggers sync action", async () => {
		const user = userEvent.setup();
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector();

		await screen.findByText("2 commits behind testuser/main");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(apiMocks.syncWorkspaceWithTargetBranch).toHaveBeenCalledWith(
				"workspace-1",
			);
		});
	});

	it("queues the pull task into the current chat when the worktree is dirty", async () => {
		const user = userEvent.setup();
		const onQueuePendingPromptForSession = vi.fn();
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "dirtyWorktree",
			targetBranch: "main",
			conflictedFiles: [],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 1,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({ onQueuePendingPromptForSession });

		await screen.findByText("1 uncommitted change");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(onQueuePendingPromptForSession).toHaveBeenCalledWith({
				sessionId: "session-1",
				prompt:
					"Commit uncommitted changes, then merge testuser/main into this branch. Then push.",
				forceQueue: true,
			});
		});
	});

	it("queues the conflict-resolution task into the current chat", async () => {
		const user = userEvent.setup();
		const onQueuePendingPromptForSession = vi.fn();
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "conflict",
			targetBranch: "main",
			conflictedFiles: ["README.md", "src/App.tsx"],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({ onQueuePendingPromptForSession });

		await screen.findByText("2 commits behind testuser/main");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(onQueuePendingPromptForSession).toHaveBeenCalledWith({
				sessionId: "session-1",
				prompt: "Merge testuser/main into this branch. Then push.",
				forceQueue: true,
			});
		});
	});

	it("prefixes the real remote even when the branch name itself contains slashes", async () => {
		const user = userEvent.setup();
		const onQueuePendingPromptForSession = vi.fn();
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "conflict",
			targetBranch: "testuser/testing",
			conflictedFiles: ["README.md"],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "testuser/testing",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({
			onQueuePendingPromptForSession,
			workspaceRemote: "Origin",
		});

		await screen.findByText("2 commits behind testuser/testing");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(onQueuePendingPromptForSession).toHaveBeenCalledWith({
				sessionId: "session-1",
				prompt: "Merge Origin/testuser/testing into this branch. Then push.",
				forceQueue: true,
			});
		});
	});

	it("attempts pull without queueing a prompt when no AI follow-up is needed", async () => {
		const user = userEvent.setup();
		const onQueuePendingPromptForSession = vi.fn();
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "updated",
			targetBranch: "main",
			conflictedFiles: [],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({ onQueuePendingPromptForSession });

		await screen.findByText("2 commits behind testuser/main");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(apiMocks.syncWorkspaceWithTargetBranch).toHaveBeenCalledWith(
				"workspace-1",
			);
		});
		expect(onQueuePendingPromptForSession).not.toHaveBeenCalled();
	});

	it("queues the merge prompt with forceQueue when pull hits a conflict — even if the chat is streaming", async () => {
		const user = userEvent.setup();
		const onQueuePendingPromptForSession = vi.fn();
		apiMocks.syncWorkspaceWithTargetBranch.mockResolvedValue({
			outcome: "conflict",
			targetBranch: "main",
			conflictedFiles: ["README.md"],
		});
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
		});

		renderInspector({ onQueuePendingPromptForSession });

		await screen.findByText("2 commits behind testuser/main");
		await user.click(screen.getByRole("button", { name: "Pull" }));

		await waitFor(() => {
			expect(onQueuePendingPromptForSession).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: "session-1",
					forceQueue: true,
				}),
			);
		});
		expect(apiMocks.syncWorkspaceWithTargetBranch).toHaveBeenCalledWith(
			"workspace-1",
		);
	});

	it("shows push when local branch is ahead of its remote tracking ref", async () => {
		const user = userEvent.setup();
		const onCommitAction = vi.fn();
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
			remoteTrackingRef: "refs/remotes/origin/testuser/short-reply-setting",
			aheadOfRemoteCount: 2,
		});

		renderInspector({ onCommitAction });

		await screen.findByText(
			"2 commits ahead of refs/remotes/origin/testuser/short-reply-setting",
		);
		await user.click(screen.getByRole("button", { name: "Push" }));

		expect(onCommitAction).toHaveBeenCalledWith("push");
	});

	it("shows push when the branch has not been published yet", async () => {
		const user = userEvent.setup();
		const onCommitAction = vi.fn();
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
			remoteTrackingRef: null,
			aheadOfRemoteCount: 0,
			pushStatus: "unpublished",
		});

		renderInspector({ onCommitAction });

		await screen.findByText("Branch not published to remote");
		await user.click(screen.getByRole("button", { name: "Push" }));

		expect(onCommitAction).toHaveBeenCalledWith("push");
	});

	it("prioritizes actionable git rows ahead of passed checks", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 23,
			remoteTrackingRef: "origin/testuser/leo",
			aheadOfRemoteCount: 6,
		});
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				reviewDecision: "APPROVED",
			}),
		);

		renderInspector();

		await screen.findByText("6 commits ahead of origin/testuser/leo");

		const actions = screen.getByLabelText("Inspector section Actions");
		expectTextBefore(
			actions,
			"6 commits ahead of origin/testuser/leo",
			"No uncommitted changes",
		);
		expectTextBefore(
			actions,
			"23 commits behind testuser/main",
			"No uncommitted changes",
		);
		expectTextBefore(actions, "No uncommitted changes", "Review approved");
	});

	it("keeps failing review rows ahead of passed review rows", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				reviewDecision: "APPROVED",
				mergeable: "CONFLICTING",
			}),
		);

		renderInspector();

		await screen.findByText("Review approved");

		const actions = screen.getByLabelText("Inspector section Actions");
		expectTextBefore(actions, "Merge conflicts detected", "Review approved");
	});

	it("hides pull when conflicts are present even if target is behind", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 1,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 3,
		});

		renderInspector();

		await screen.findByText("Merge conflicts detected");
		expect(
			screen.queryByRole("button", { name: "Pull" }),
		).not.toBeInTheDocument();
	});

	it("disables git row actions while the commit lifecycle is busy", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 1,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
		});

		renderInspector({ commitButtonState: "busy" });

		expect(
			await screen.findByRole("button", { name: "Commit and push" }),
		).toBeDisabled();
	});

	it("shows a neutral loading spinner on push while the push lifecycle is busy", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
			remoteTrackingRef: "refs/remotes/origin/testuser/short-reply-setting",
			aheadOfRemoteCount: 2,
			pushStatus: "published",
		});

		renderInspector({
			commitButtonMode: "push",
			commitButtonState: "busy",
		});

		const actions = screen.getByLabelText("Inspector section Actions");
		const pushButton = await within(actions).findByRole("button", {
			name: "Pushing",
		});
		expect(pushButton).toBeDisabled();
		expect(pushButton).toHaveAttribute("aria-busy", "true");
		expect(
			pushButton.querySelector(".animate-spin.text-current"),
		).toBeInTheDocument();
		expect(pushButton).not.toHaveTextContent("Push");
	});

	it("shows a neutral loading spinner on commit-and-push while that lifecycle is busy", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 2,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
			pushStatus: "published",
		});

		renderInspector({
			commitButtonMode: "commit-and-push",
			commitButtonState: "busy",
		});

		const actions = screen.getByLabelText("Inspector section Actions");
		const commitButton = await within(actions).findByRole("button", {
			name: "Committing",
		});
		expect(commitButton).toBeDisabled();
		expect(commitButton).toHaveAttribute("aria-busy", "true");
		expect(
			commitButton.querySelector(".animate-spin.text-current"),
		).toBeInTheDocument();
		expect(commitButton).not.toHaveTextContent("Commit and push");
	});

	it("shows a neutral loading spinner on pull while sync is pending", async () => {
		const user = userEvent.setup();
		let resolveSync = (_value: {
			outcome: "updated";
			targetBranch: string;
			conflictedFiles: string[];
		}) => {};
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "behind",
			behindTargetCount: 2,
			pushStatus: "published",
		});
		apiMocks.syncWorkspaceWithTargetBranch.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveSync = resolve;
				}),
		);

		renderInspector();

		await user.click(await screen.findByRole("button", { name: "Pull" }));

		const actions = screen.getByLabelText("Inspector section Actions");
		const pullButton = await within(actions).findByRole("button", {
			name: "Pulling",
		});
		expect(pullButton).toBeDisabled();
		expect(pullButton).toHaveAttribute("aria-busy", "true");
		expect(
			pullButton.querySelector(".animate-spin.text-current"),
		).toBeInTheDocument();
		expect(pullButton).not.toHaveTextContent("Pull");

		resolveSync({
			outcome: "updated",
			targetBranch: "main",
			conflictedFiles: [],
		});
	});

	it("renders running and failed remote status colors with accessible labels", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				deployments: [
					{
						id: "deploy-1",
						name: "Preview",
						provider: "vercel",
						status: "running",
						url: "https://preview.example.com",
					},
				],
				checks: [
					{
						id: "check-1",
						name: "changes",
						provider: "github",
						status: "failure",
						duration: "12s",
						url: null,
					},
				],
			}),
		);

		renderInspector();

		await screen.findByText("Preview");

		expect(screen.getByText("Deployments")).toBeInTheDocument();
		expect(screen.getByText("Checks")).toBeInTheDocument();
		expect(screen.getByLabelText("Running")).toHaveStyle({
			color: "rgb(245, 158, 11)",
		});
		expect(screen.getByLabelText("Failed")).toHaveStyle({
			color: "rgb(207, 34, 46)",
		});
	});

	it("sorts checks by urgency and keeps the full GitHub check names visible", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				checks: [
					{
						id: "check-success",
						name: "Build / App Build (push)",
						provider: "github",
						status: "success",
						url: null,
					},
					{
						id: "check-running",
						name: "Test / Frontend Test (push)",
						provider: "github",
						status: "running",
						url: null,
					},
					{
						id: "check-failure",
						name: "Quality / Detect Changes (pull_request)",
						provider: "github",
						status: "failure",
						url: null,
					},
				],
			}),
		);

		renderInspector();

		const failing = await screen.findByText(
			"Quality / Detect Changes (pull_request)",
		);
		const running = screen.getByText("Test / Frontend Test (push)");
		const success = screen.getByText("Build / App Build (push)");

		expect(failing).toBeInTheDocument();
		expect(running).toBeInTheDocument();
		expect(success).toBeInTheDocument();
		expect(
			failing.compareDocumentPosition(running) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			running.compareDocumentPosition(success) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("vertically centers check row content and actions", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				checks: [
					{
						id: "check-centered",
						name: "App Build",
						provider: "github",
						status: "success",
						duration: "1m",
						url: "https://github.com/acme/repo/actions/runs/1",
					},
				],
			}),
		);

		renderInspector();

		const checkName = await screen.findByText("App Build");
		const row = checkName.closest(".group\\/check-row");
		expect(row).toHaveClass("items-center");
		expect(row).not.toHaveClass("items-start");

		const content = checkName.parentElement;
		expect(content).toHaveClass("items-center");
		expect(content).not.toHaveClass("items-start");

		const actions = screen.getByRole("button", {
			name: "Open App Build",
		}).parentElement;
		expect(actions).toHaveClass("gap-0");
		expect(screen.getByRole("button", { name: "Open App Build" })).toHaveClass(
			"size-5",
		);

		expect(screen.getByText("1m")).not.toHaveClass("pt-px");
	});

	it("renders link buttons only for remote items with urls", async () => {
		const user = userEvent.setup();
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				checks: [
					{
						id: "check-linked",
						name: "linked-check",
						provider: "github",
						status: "success",
						url: "https://github.com/acme/repo/actions/runs/1",
					},
					{
						id: "check-unlinked",
						name: "unlinked-check",
						provider: "github",
						status: "success",
						url: null,
					},
				],
			}),
		);

		renderInspector();

		await screen.findByText("linked-check");
		expect(screen.getByText("unlinked-check")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Open unlinked-check" }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Open linked-check" }));

		await waitFor(() => {
			expect(openerMocks.openUrl).toHaveBeenCalledWith(
				"https://github.com/acme/repo/actions/runs/1",
			);
		});
	});

	it("uses compact icon button chrome for append and open actions", async () => {
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				checks: [
					{
						id: "check-1",
						name: "changes",
						provider: "github",
						status: "failure",
						url: "https://github.com/acme/repo/actions/runs/1",
					},
				],
			}),
		);

		renderInspector();

		const appendButton = await screen.findByRole("button", {
			name: "Append changes to composer",
		});
		const openButton = screen.getByRole("button", { name: "Open changes" });

		expect(appendButton).toHaveClass("cursor-pointer");
		expect(appendButton).toHaveClass("size-4");
		expect(appendButton).toHaveClass("opacity-0");
		expect(appendButton).toHaveClass("pointer-events-none");
		expect(appendButton).toHaveClass("group-hover/check-row:opacity-55");
		expect(appendButton).toHaveClass(
			"group-focus-within/check-row:pointer-events-auto",
		);
		expect(appendButton).toHaveClass("hover:opacity-100");

		expect(openButton).toHaveClass("cursor-pointer");
		expect(openButton).toHaveClass("size-5");
		expect(openButton).toHaveClass("opacity-55");
		expect(openButton).toHaveClass("hover:opacity-100");
	});

	it("inserts check details into the composer and keeps deployments without insert buttons", async () => {
		const user = userEvent.setup();
		const insertIntoComposer = vi.fn();
		apiMocks.loadWorkspaceForgeActionStatus.mockResolvedValue(
			emptyPrStatus({
				remoteState: "ok",
				deployments: [
					{
						id: "deploy-1",
						name: "Preview",
						provider: "vercel",
						status: "running",
						url: "https://preview.example.com",
					},
				],
				checks: [
					{
						id: "check-1",
						name: "changes",
						provider: "github",
						status: "failure",
						duration: "12s",
						url: "https://github.com/acme/repo/actions/runs/1",
					},
				],
			}),
		);
		// 22 chars per line × 25 = 550 chars, above the composer preview threshold (500).
		const longCheckOutput = "const failure = true;\n".repeat(25);
		apiMocks.getWorkspaceForgeCheckInsertText.mockResolvedValue(
			longCheckOutput,
		);

		renderWithProviders(
			<ComposerInsertProvider value={insertIntoComposer}>
				<ActionsSection
					workspaceId="workspace-1"
					workspaceRemote="origin"
					bodyHeight={180}
					expanded={false}
					changeRequest={null}
				/>
			</ComposerInsertProvider>,
		);

		await screen.findByText("Preview");
		expect(
			screen.queryByRole("button", { name: "Append Preview to composer" }),
		).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Append changes to composer" }),
		);

		await waitFor(() => {
			expect(apiMocks.getWorkspaceForgeCheckInsertText).toHaveBeenCalledWith(
				"workspace-1",
				"check-1",
			);
		});

		expect(insertIntoComposer).toHaveBeenCalledWith({
			target: { workspaceId: "workspace-1" },
			items: [
				{
					kind: "custom-tag",
					label: "changes",
					submitText: longCheckOutput,
					key: "pr-check:check-1",
					preview: {
						kind: "code",
						title: "changes",
						language: "ts",
						code: longCheckOutput,
					},
				},
			],
			behavior: "append",
		});
	});

	it("uses the workspace remote when formatting sync target labels", async () => {
		apiMocks.loadWorkspaceGitActionStatus.mockResolvedValue({
			uncommittedCount: 0,
			conflictCount: 0,
			syncTargetBranch: "main",
			syncStatus: "upToDate",
			behindTargetCount: 0,
		});

		renderInspector({ workspaceRemote: "upstream" });

		await screen.findByText("Up to date with upstream/main");
	});

	it("does not blur the tabs panel when hover zoom never became eligible", async () => {
		const user = userEvent.setup();
		renderInspector();

		await user.click(
			screen.getByRole("button", { name: "Toggle inspector tabs section" }),
		);

		const tabsBody = await screen.findByLabelText("Inspector tabs body");
		const filterLayer = tabsBody.parentElement;
		const tabsSection = screen.getByLabelText("Inspector section Tabs");

		expect(filterLayer).not.toBeNull();
		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });

		fireEvent.mouseEnter(tabsBody);
		fireEvent.mouseLeave(tabsSection.parentElement as HTMLElement);

		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });
	});
});
