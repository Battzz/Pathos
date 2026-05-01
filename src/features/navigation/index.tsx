import {
	ChevronDown,
	FolderPlus,
	Globe,
	LoaderCircle,
	MessageSquarePlus,
} from "lucide-react";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UsageStatsIndicator } from "@/features/composer/usage-stats-indicator";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { RepositoryFolder, RepositoryFolderChat } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ChatRow } from "./chat-row";
import { CloneFromUrlDialog } from "./clone-from-url-dialog";
import { FolderRow } from "./folder-row";

const MAX_COLLAPSED_CHATS = 8;
const CHAT_SHORTCUT_LIMIT = 10;

type PendingSidebarRemoval =
	| { type: "chat"; chat: RepositoryFolderChat }
	| { type: "projectChats"; folder: RepositoryFolder }
	| { type: "project"; folder: RepositoryFolder };

function getRemovalConfirmationCopy(removal: PendingSidebarRemoval | null): {
	title: string;
	description: string;
	confirmLabel: string;
} {
	if (removal?.type === "chat") {
		const title = removal.chat.title?.trim() || "New chat";
		return {
			title: `Remove ${title}?`,
			description: "This permanently deletes this chat and its messages.",
			confirmLabel: "Remove chat",
		};
	}
	if (removal?.type === "projectChats") {
		return {
			title: `Remove all chats in ${removal.folder.repoName}?`,
			description:
				"This permanently deletes every chat in this project. The project itself and its files stay in place.",
			confirmLabel: "Remove chats",
		};
	}
	if (removal?.type === "project") {
		return {
			title: `Remove ${removal.folder.repoName}?`,
			description:
				"This removes the project and all of its chats from Pathos. Files on disk are not deleted.",
			confirmLabel: "Remove project",
		};
	}
	return {
		title: "Remove item?",
		description: "This action cannot be undone.",
		confirmLabel: "Remove",
	};
}

export type WorkspacesSidebarProps = {
	folders: RepositoryFolder[];
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	interactionRequiredSessionIds?: Set<string>;
	addRepositoryShortcut?: string | null;
	newChatShortcut?: string | null;
	deleteChatShortcut?: string | null;
	addingRepository: boolean;
	importingRepository: boolean;
	recentlyAddedRepoId: string | null;
	creatingChatRepoId: string | null;
	isCloneDialogOpen: boolean;
	cloneDefaultDirectory: string | null;
	onCloneDialogOpenChange: (open: boolean) => void;
	onAddRepository: () => void;
	onOpenCloneDialog: () => void;
	onSubmitClone: (args: {
		gitUrl: string;
		cloneDirectory: string;
	}) => Promise<void>;
	onSelectChat: (workspaceId: string, sessionId: string) => void;
	onPrefetchChat: (workspaceId: string, sessionId: string) => void;
	onCreateChat: (repoId: string) => void;
	onDeleteChat: (sessionId: string) => void;
	onDeleteProjectChats: (repoId: string) => void;
	onToggleChatPin?: (chat: RepositoryFolderChat) => void;
	onRemoveProject: (repoId: string) => void;
	isFolderExpanded: (repoId: string) => boolean;
	onToggleFolder: (repoId: string) => void;
	footerControls?: ReactNode;
	accountControl?: ReactNode;
};

export const WorkspacesSidebar = memo(function WorkspacesSidebar({
	folders,
	selectedWorkspaceId,
	selectedSessionId,
	interactionRequiredSessionIds,
	addRepositoryShortcut,
	newChatShortcut = "Mod+T",
	deleteChatShortcut = "Mod+W",
	addingRepository,
	importingRepository,
	recentlyAddedRepoId,
	creatingChatRepoId,
	isCloneDialogOpen,
	cloneDefaultDirectory,
	onCloneDialogOpenChange,
	onAddRepository,
	onOpenCloneDialog,
	onSubmitClone,
	onSelectChat,
	onPrefetchChat,
	onCreateChat,
	onDeleteChat,
	onDeleteProjectChats,
	onToggleChatPin,
	onRemoveProject,
	isFolderExpanded,
	onToggleFolder,
	footerControls,
	accountControl,
}: WorkspacesSidebarProps) {
	const { settings } = useSettings();
	const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
	const [expandedChatRepoIds, setExpandedChatRepoIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [showChatShortcuts, setShowChatShortcuts] = useState(false);
	const [pendingRemoval, setPendingRemoval] =
		useState<PendingSidebarRemoval | null>(null);

	const confirmSidebarRemoval = settings.confirmDestructiveSidebarActions;
	const removeChat = (chat: RepositoryFolderChat) => {
		if (confirmSidebarRemoval) {
			setPendingRemoval({ type: "chat", chat });
			return;
		}
		onDeleteChat(chat.sessionId);
	};
	const removeProjectChats = (folder: RepositoryFolder) => {
		if (confirmSidebarRemoval) {
			setPendingRemoval({ type: "projectChats", folder });
			return;
		}
		onDeleteProjectChats(folder.repoId);
	};
	const removeProject = (folder: RepositoryFolder) => {
		if (confirmSidebarRemoval) {
			setPendingRemoval({ type: "project", folder });
			return;
		}
		onRemoveProject(folder.repoId);
	};
	const confirmationCopy = getRemovalConfirmationCopy(pendingRemoval);

	useEffect(() => {
		const handler = () => setIsAddMenuOpen(true);
		window.addEventListener("pathos:open-add-repository", handler);
		return () =>
			window.removeEventListener("pathos:open-add-repository", handler);
	}, []);

	const shortcutChats = useMemo(
		() =>
			folders
				.flatMap((folder) => {
					if (!isFolderExpanded(folder.repoId)) return [];
					const visibleChats = expandedChatRepoIds.has(folder.repoId)
						? folder.chats
						: folder.chats.slice(0, MAX_COLLAPSED_CHATS);
					return visibleChats;
				})
				.slice(0, CHAT_SHORTCUT_LIMIT),
		[expandedChatRepoIds, folders, isFolderExpanded],
	);
	const shortcutIndexBySessionId = useMemo(
		() =>
			new Map(
				shortcutChats.map((chat, index) => [chat.sessionId, index] as const),
			),
		[shortcutChats],
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Meta") {
				setShowChatShortcuts(true);
				return;
			}

			if (
				!event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey ||
				shortcutChats.length === 0
			) {
				return;
			}

			const digit = event.code.startsWith("Digit")
				? event.code.slice(5)
				: event.code.startsWith("Numpad")
					? event.code.slice(6)
					: null;
			if (!digit || !/^\d$/.test(digit)) return;

			const index = digit === "0" ? 9 : Number(digit) - 1;
			const chat = shortcutChats[index];
			if (!chat) return;

			event.preventDefault();
			event.stopPropagation();
			onPrefetchChat(chat.workspaceId, chat.sessionId);
			onSelectChat(chat.workspaceId, chat.sessionId);
		};
		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key === "Meta") {
				setShowChatShortcuts(false);
			}
		};
		const handleBlur = () => setShowChatShortcuts(false);

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("keyup", handleKeyUp, true);
		window.addEventListener("blur", handleBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("keyup", handleKeyUp, true);
			window.removeEventListener("blur", handleBlur);
		};
	}, [onPrefetchChat, onSelectChat, shortcutChats]);

	const addBusy = Boolean(addingRepository);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<ConfirmDialog
				open={pendingRemoval !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingRemoval(null);
					}
				}}
				title={confirmationCopy.title}
				description={confirmationCopy.description}
				confirmLabel={confirmationCopy.confirmLabel}
				onConfirm={() => {
					if (pendingRemoval?.type === "chat") {
						onDeleteChat(pendingRemoval.chat.sessionId);
					} else if (pendingRemoval?.type === "projectChats") {
						onDeleteProjectChats(pendingRemoval.folder.repoId);
					} else if (pendingRemoval?.type === "project") {
						onRemoveProject(pendingRemoval.folder.repoId);
					}
					setPendingRemoval(null);
				}}
			/>
			<CloneFromUrlDialog
				open={isCloneDialogOpen}
				onOpenChange={onCloneDialogOpenChange}
				defaultCloneDirectory={cloneDefaultDirectory}
				onSubmit={onSubmitClone}
			/>

			<div
				data-slot="window-safe-top"
				className="flex h-9 shrink-0 items-center pr-3"
			>
				<TrafficLightSpacer side="left" width={94} />
				<div data-tauri-drag-region className="h-full flex-1" />
			</div>

			<div
				className={cn(
					"scrollbar-stable min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]",
					folders.length === 0
						? "flex items-center justify-center px-6"
						: "pr-1 pl-2",
				)}
			>
				{folders.length === 0 ? (
					<EmptySidebar
						onAddRepository={onAddRepository}
						addingRepository={addingRepository}
						importingRepository={importingRepository}
					/>
				) : (
					<ul className="flex flex-col gap-0.5 pb-2 pt-1">
						{importingRepository ? <PendingProjectRow /> : null}
						{folders.map((folder) => (
							<li key={folder.repoId} className="flex flex-col">
								<FolderRow
									folder={folder}
									highlighted={recentlyAddedRepoId === folder.repoId}
									expanded={isFolderExpanded(folder.repoId)}
									itemCount={folder.chats.length}
									onToggle={onToggleFolder}
									onCreateChat={onCreateChat}
									newChatShortcut={newChatShortcut}
									onCollapseChats={(repoId) => {
										setExpandedChatRepoIds((repoIds) => {
											const next = new Set(repoIds);
											next.delete(repoId);
											return next;
										});
									}}
									onDeleteProjectChats={() => removeProjectChats(folder)}
									onRemoveProject={() => removeProject(folder)}
									creatingChat={creatingChatRepoId === folder.repoId}
									chatOverflowExpanded={
										folder.chats.length > MAX_COLLAPSED_CHATS &&
										expandedChatRepoIds.has(folder.repoId)
									}
								/>
								{isFolderExpanded(folder.repoId) ? (
									<div
										className="relative ml-[14px] flex flex-col gap-0.5 pb-1 pl-3"
										style={{
											backgroundImage:
												"linear-gradient(to bottom, color-mix(in oklch, var(--border) 70%, transparent) 0%, color-mix(in oklch, var(--border) 70%, transparent) 100%)",
											backgroundSize: "1px calc(100% - 8px)",
											backgroundPosition: "0 4px",
											backgroundRepeat: "no-repeat",
										}}
									>
										{folder.chats.length === 0 ? (
											<FolderEmptyState
												onCreateChat={() => onCreateChat(folder.repoId)}
												busy={creatingChatRepoId === folder.repoId}
											/>
										) : (
											<>
												{folder.chats
													.slice(
														0,
														expandedChatRepoIds.has(folder.repoId)
															? folder.chats.length
															: MAX_COLLAPSED_CHATS,
													)
													.map((chat) => (
														<ChatRow
															key={chat.sessionId}
															chat={chat}
															selected={
																selectedWorkspaceId === chat.workspaceId &&
																selectedSessionId === chat.sessionId
															}
															isInteractionRequired={
																interactionRequiredSessionIds?.has(
																	chat.sessionId,
																) ?? false
															}
															shortcutLabel={(() => {
																const shortcutIndex =
																	shortcutIndexBySessionId.get(chat.sessionId);
																if (shortcutIndex === undefined) return null;
																return `Cmd+${shortcutIndex === 9 ? 0 : shortcutIndex + 1}`;
															})()}
															showShortcutHint={showChatShortcuts}
															deleteChatShortcut={deleteChatShortcut}
															onSelect={(ws, session) => {
																onPrefetchChat(ws, session);
																onSelectChat(ws, session);
															}}
															onTogglePin={onToggleChatPin}
															onDelete={() => removeChat(chat)}
														/>
													))}
												{folder.chats.length > MAX_COLLAPSED_CHATS &&
												!expandedChatRepoIds.has(folder.repoId) ? (
													<ShowMoreChatsButton
														hiddenCount={
															folder.chats.length - MAX_COLLAPSED_CHATS
														}
														onClick={() => {
															setExpandedChatRepoIds((repoIds) => {
																const next = new Set(repoIds);
																next.add(folder.repoId);
																return next;
															});
														}}
													/>
												) : null}
											</>
										)}
									</div>
								) : null}
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="flex shrink-0 items-center justify-between px-3 pb-3 pt-1">
				<div className="flex items-center gap-[2px]">
					{footerControls}
					<Separator orientation="vertical" className="mx-1 h-4 self-center!" />
					<DropdownMenu open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										aria-label="Add project"
										variant="ghost"
										size="icon"
										disabled={addBusy}
										className={cn(
											"text-muted-foreground hover:text-foreground",
											addBusy && "cursor-not-allowed opacity-60",
										)}
									>
										{addBusy ? (
											<LoaderCircle
												className="size-[15px] animate-spin"
												strokeWidth={2.1}
											/>
										) : (
											<FolderPlus className="size-[15px]" strokeWidth={1.8} />
										)}
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent
								side="top"
								sideOffset={4}
								className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
							>
								<span>Add project</span>
								{addRepositoryShortcut ? (
									<InlineShortcutDisplay
										hotkey={addRepositoryShortcut}
										className="text-tooltip-foreground/55"
									/>
								) : null}
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent
							align="start"
							sideOffset={6}
							className="min-w-44"
						>
							<DropdownMenuItem
								disabled={addBusy}
								onSelect={() => {
									onAddRepository();
								}}
								className="cursor-pointer gap-1.5 px-2 py-1 text-[13px] leading-5"
							>
								{addBusy ? (
									<LoaderCircle
										className="size-3.5 animate-spin"
										strokeWidth={2.1}
									/>
								) : (
									<FolderPlus className="size-3.5" strokeWidth={2} />
								)}
								<span>
									{importingRepository ? "Adding project..." : "Open project"}
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={addBusy}
								onSelect={() => {
									onOpenCloneDialog();
								}}
								className="cursor-pointer gap-1.5 px-2 py-1 text-[13px] leading-5"
							>
								<Globe className="size-3.5" strokeWidth={2} />
								<span>Clone from URL</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<UsageStatsIndicator />
				</div>
				{accountControl}
			</div>
		</div>
	);
});

function ShowMoreChatsButton({
	hiddenCount,
	onClick,
}: {
	hiddenCount: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="mx-0 my-0.5 flex h-7 items-center gap-2 rounded-md px-2 text-[12px] font-medium text-muted-foreground/75 transition-colors cursor-pointer hover:bg-accent/30 hover:text-foreground/90"
			onClick={onClick}
		>
			<ChevronDown className="size-3.5 shrink-0" strokeWidth={2} />
			<span className="tracking-[-0.005em]">Show more</span>
			<span className="ml-auto text-[11px] tabular-nums text-muted-foreground/55">
				{hiddenCount}
			</span>
		</button>
	);
}

function EmptySidebar({
	onAddRepository,
	addingRepository,
	importingRepository,
}: {
	onAddRepository: () => void;
	addingRepository: boolean;
	importingRepository: boolean;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 text-center">
			<div className="relative">
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-10 rounded-full blur-2xl"
					style={{
						background:
							"radial-gradient(circle at center, color-mix(in oklch, var(--foreground) 8%, transparent), transparent 70%)",
					}}
				/>
				<div className="flex size-12 items-center justify-center rounded-xl border border-border/60 bg-foreground/[0.02]">
					<FolderPlus
						className="size-5 text-muted-foreground/70"
						strokeWidth={1.5}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-[13px] font-medium text-foreground/85">
					No projects yet
				</p>
				<p className="text-[12px] leading-relaxed text-muted-foreground/75">
					Open a folder to start a chat.
				</p>
			</div>
			<Button
				type="button"
				size="sm"
				variant="secondary"
				onClick={onAddRepository}
				disabled={addingRepository}
				className="mt-1 cursor-pointer"
			>
				{addingRepository ? (
					<LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.1} />
				) : (
					<FolderPlus className="size-3.5" strokeWidth={2} />
				)}
				<span>
					{importingRepository ? "Adding project..." : "Open project"}
				</span>
			</Button>
		</div>
	);
}

function PendingProjectRow() {
	return (
		<li className="flex flex-col">
			<div className="mx-0.5 flex h-8 items-center gap-2 rounded-md border border-border/45 bg-accent/25 px-2 text-[13px] font-medium text-muted-foreground">
				<LoaderCircle
					className="size-3.5 shrink-0 animate-spin"
					strokeWidth={2.1}
				/>
				<span className="truncate">Adding project...</span>
			</div>
		</li>
	);
}

function FolderEmptyState({
	onCreateChat,
	busy,
}: {
	onCreateChat: () => void;
	busy: boolean;
}) {
	return (
		<button
			type="button"
			disabled={busy}
			className={cn(
				"group/empty mx-0 my-0.5 flex h-7 items-center gap-2 rounded-md border border-dashed border-border/50 bg-transparent px-2 text-[12px] text-muted-foreground/70 transition-colors cursor-pointer",
				"hover:border-border/80 hover:bg-accent/30 hover:text-foreground/90",
				"disabled:cursor-not-allowed disabled:opacity-60",
			)}
			onClick={onCreateChat}
		>
			<MessageSquarePlus
				className="size-3.5 shrink-0 transition-transform group-hover/empty:scale-110"
				strokeWidth={2}
			/>
			<span className="tracking-[-0.005em]">New chat</span>
		</button>
	);
}
