import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RepositoryFolder, RepositoryFolderChat } from "@/lib/api";
import { WorkspacesSidebar } from "./index";

afterEach(() => {
	cleanup();
});

function makeChat(index: number): RepositoryFolderChat {
	return {
		sessionId: `session-${index}`,
		workspaceId: `workspace-${index}`,
		title: `Chat ${index}`,
		agentType: "codex",
		status: "idle",
		unreadCount: 0,
		createdAt: "2026-04-30T00:00:00Z",
		updatedAt: "2026-04-30T00:00:00Z",
		lastUserMessageAt: null,
	};
}

function makeFolder(chatCount: number): RepositoryFolder {
	return {
		repoId: "repo-1",
		repoName: "helmor",
		repoInitials: "HE",
		isGit: true,
		chats: Array.from({ length: chatCount }, (_, index) => makeChat(index + 1)),
		workspaces: [],
	};
}

function renderSidebar(folder: RepositoryFolder) {
	return render(
		<TooltipProvider delayDuration={0}>
			<WorkspacesSidebar
				folders={[folder]}
				selectedWorkspaceId={null}
				selectedSessionId={null}
				addingRepository={false}
				importingRepository={false}
				recentlyAddedRepoId={null}
				creatingChatRepoId={null}
				isCloneDialogOpen={false}
				cloneDefaultDirectory={null}
				onCloneDialogOpenChange={vi.fn()}
				onAddRepository={vi.fn()}
				onOpenCloneDialog={vi.fn()}
				onSubmitClone={vi.fn()}
				onSelectChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onCreateChat={vi.fn()}
				onDeleteChat={vi.fn()}
				onRemoveProject={vi.fn()}
				isFolderExpanded={() => true}
				onToggleFolder={vi.fn()}
			/>
		</TooltipProvider>,
	);
}

describe("WorkspacesSidebar", () => {
	it("limits expanded project chats to 8 until Show more is clicked", () => {
		renderSidebar(makeFolder(10));

		expect(screen.getByText("Chat 8")).toBeInTheDocument();
		expect(screen.queryByText("Chat 9")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /show more/i }),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /show more/i }));

		expect(screen.getByText("Chat 9")).toBeInTheDocument();
		expect(screen.getByText("Chat 10")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /show more/i }),
		).not.toBeInTheDocument();
	});

	it("does not show the overflow control for 8 chats", () => {
		renderSidebar(makeFolder(8));

		expect(screen.getByText("Chat 8")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /show more/i }),
		).not.toBeInTheDocument();
	});
});
