import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RepositoryFolder, RepositoryFolderChat } from "@/lib/api";
import {
	type AppSettings,
	DEFAULT_SETTINGS,
	SettingsContext,
} from "@/lib/settings";
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

function renderSidebar(
	folder: RepositoryFolder,
	options: {
		settings?: AppSettings;
		genericChats?: RepositoryFolderChat[];
		onCreateGenericChat?: () => void;
		onDeleteChat?: (sessionId: string) => void;
		onDeleteProjectChats?: (repoId: string) => void;
		onRemoveProject?: (repoId: string) => void;
		onPrefetchChat?: (workspaceId: string, sessionId: string) => void;
		onSelectChat?: (workspaceId: string, sessionId: string) => void;
	} = {},
) {
	const onDeleteChat = options.onDeleteChat ?? vi.fn();
	const onDeleteProjectChats = options.onDeleteProjectChats ?? vi.fn();
	const onRemoveProject = options.onRemoveProject ?? vi.fn();
	const onCreateGenericChat = options.onCreateGenericChat ?? vi.fn();
	const onPrefetchChat = options.onPrefetchChat ?? vi.fn();
	const onSelectChat = options.onSelectChat ?? vi.fn();
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<SettingsContext.Provider
				value={{
					settings: options.settings ?? DEFAULT_SETTINGS,
					isLoaded: true,
					updateSettings: vi.fn(),
				}}
			>
				<TooltipProvider delayDuration={0}>
					<WorkspacesSidebar
						folders={[folder]}
						genericChats={options.genericChats ?? []}
						selectedWorkspaceId={null}
						selectedSessionId={null}
						addingRepository={false}
						importingRepository={false}
						recentlyAddedRepoId={null}
						creatingChatRepoId={null}
						creatingGenericChat={false}
						isCloneDialogOpen={false}
						cloneDefaultDirectory={null}
						onCloneDialogOpenChange={vi.fn()}
						onAddRepository={vi.fn()}
						onOpenCloneDialog={vi.fn()}
						onSubmitClone={vi.fn()}
						onSelectChat={onSelectChat}
						onPrefetchChat={onPrefetchChat}
						onCreateChat={vi.fn()}
						onCreateGenericChat={onCreateGenericChat}
						onDeleteChat={onDeleteChat}
						onDeleteProjectChats={onDeleteProjectChats}
						onRemoveProject={onRemoveProject}
						isFolderExpanded={() => true}
						onToggleFolder={vi.fn()}
					/>
				</TooltipProvider>
			</SettingsContext.Provider>
		</QueryClientProvider>,
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

	it("can re-hide expanded chats from the project row", () => {
		renderSidebar(makeFolder(10));

		fireEvent.click(screen.getByRole("button", { name: /show more/i }));

		expect(screen.getByText("Chat 10")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /hide chats/i }));

		expect(screen.getByText("Chat 8")).toBeInTheDocument();
		expect(screen.queryByText("Chat 9")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /show more/i }),
		).toBeInTheDocument();
	});

	it("does not show the overflow control for 8 chats", () => {
		renderSidebar(makeFolder(8));

		expect(screen.getByText("Chat 8")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /show more/i }),
		).not.toBeInTheDocument();
	});

	it("confirms before deleting an individual chat by default", () => {
		const onDeleteChat = vi.fn();
		renderSidebar(makeFolder(1), { onDeleteChat });

		fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));

		expect(screen.getByText("Remove Chat 1?")).toBeInTheDocument();
		expect(onDeleteChat).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Remove chat" }));

		expect(onDeleteChat).toHaveBeenCalledWith("session-1");
	});

	it("confirms before removing all project chats by default", () => {
		const onDeleteProjectChats = vi.fn();
		renderSidebar(makeFolder(1), { onDeleteProjectChats });

		fireEvent.contextMenu(screen.getByText("helmor"));
		fireEvent.click(screen.getByText("Remove all chats"));

		expect(screen.getByText("Remove all chats in helmor?")).toBeInTheDocument();
		expect(onDeleteProjectChats).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Remove chats" }));

		expect(onDeleteProjectChats).toHaveBeenCalledWith("repo-1");
	});

	it("confirms before removing a project by default", () => {
		const onRemoveProject = vi.fn();
		renderSidebar(makeFolder(1), { onRemoveProject });

		fireEvent.contextMenu(screen.getByText("helmor"));
		fireEvent.click(screen.getByText("Remove project"));

		expect(screen.getByText("Remove helmor?")).toBeInTheDocument();
		expect(onRemoveProject).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Remove project" }));

		expect(onRemoveProject).toHaveBeenCalledWith("repo-1");
	});

	it("deletes an individual chat immediately when sidebar confirmations are disabled", () => {
		const onDeleteChat = vi.fn();
		renderSidebar(makeFolder(1), {
			settings: {
				...DEFAULT_SETTINGS,
				confirmDestructiveSidebarActions: false,
			},
			onDeleteChat,
		});

		fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));

		expect(onDeleteChat).toHaveBeenCalledWith("session-1");
		expect(screen.queryByText("Remove Chat 1?")).not.toBeInTheDocument();
	});

	it("shows Cmd-number hints and selects the matching visible chat", () => {
		const onPrefetchChat = vi.fn();
		const onSelectChat = vi.fn();
		renderSidebar(makeFolder(10), { onPrefetchChat, onSelectChat });

		expect(screen.queryByLabelText("Cmd+1")).not.toBeInTheDocument();

		fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });

		expect(screen.getByLabelText("Cmd+1")).toBeInTheDocument();
		expect(screen.getByLabelText("Cmd+8")).toBeInTheDocument();
		expect(screen.queryByLabelText("Cmd+9")).not.toBeInTheDocument();

		fireEvent.keyDown(window, { key: "3", code: "Digit3", metaKey: true });

		expect(onPrefetchChat).toHaveBeenCalledWith("workspace-3", "session-3");
		expect(onSelectChat).toHaveBeenCalledWith("workspace-3", "session-3");

		fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft" });

		expect(screen.queryByLabelText("Cmd+1")).not.toBeInTheDocument();
	});

	it("renders generic chats above the footer and can start one", () => {
		const onCreateGenericChat = vi.fn();
		const onSelectChat = vi.fn();
		const genericChat = {
			...makeChat(99),
			sessionId: "generic-session",
			workspaceId: "generic-workspace",
			title: "General question",
		};
		renderSidebar(makeFolder(0), {
			genericChats: [genericChat],
			onCreateGenericChat,
			onSelectChat,
		});

		fireEvent.click(screen.getByText("General question"));

		expect(onSelectChat).toHaveBeenCalledWith(
			"generic-workspace",
			"generic-session",
		);

		fireEvent.click(screen.getByRole("button", { name: "New generic chat" }));

		expect(onCreateGenericChat).toHaveBeenCalled();
	});
});
