import {
	ChevronDown,
	ChevronUp,
	FolderPlus,
	Globe,
	LoaderCircle,
	MessageSquarePlus,
	Plus,
} from "lucide-react";
import {
	AnimatePresence,
	motion,
	type PanInfo,
	type Variants,
} from "motion/react";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UsageStatsIndicator } from "@/features/composer/usage-stats-indicator";
import { getShortcut } from "@/features/shortcuts/registry";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { ShortcutId } from "@/features/shortcuts/types";
import {
	DEFAULT_SPACE_ID,
	type RepositoryFolder,
	type RepositoryFolderChat,
	type Space,
} from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ChatRow } from "./chat-row";
import { CloneFromUrlDialog } from "./clone-from-url-dialog";
import { CreateSpaceButton } from "./create-space-button";
import { FolderRow } from "./folder-row";
import { SpacePageDots } from "./space-page-dots";

const MAX_COLLAPSED_CHATS = 8;
const MAX_GENERIC_CHATS_COLLAPSED = 5;
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
	genericChats?: RepositoryFolderChat[];
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
	creatingGenericChat?: boolean;
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
	onCreateGenericChat?: () => void;
	onDeleteChat: (sessionId: string) => void;
	onDeleteProjectChats: (repoId: string) => void;
	onToggleChatPin?: (chat: RepositoryFolderChat) => void;
	onRemoveProject: (repoId: string) => void;
	isFolderExpanded: (repoId: string) => boolean;
	onToggleFolder: (repoId: string) => void;
	footerControls?: ReactNode;
	accountControl?: ReactNode;
	/** Sorted spaces for the pager (Default first; user-created next). */
	spaces: Space[];
	activeSpaceId: string;
	onSelectSpace: (spaceId: string) => void;
};

export const WorkspacesSidebar = memo(function WorkspacesSidebar({
	folders,
	genericChats = [],
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
	creatingGenericChat = false,
	isCloneDialogOpen,
	cloneDefaultDirectory,
	onCloneDialogOpenChange,
	onAddRepository,
	onOpenCloneDialog,
	onSubmitClone,
	onSelectChat,
	onPrefetchChat,
	onCreateChat,
	onCreateGenericChat,
	onDeleteChat,
	onDeleteProjectChats,
	onToggleChatPin,
	onRemoveProject,
	isFolderExpanded,
	onToggleFolder,
	footerControls,
	accountControl,
	spaces,
	activeSpaceId,
	onSelectSpace,
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

	// Folders are fetched once for every Space, then filtered client-side
	// per page. This keeps the existing optimistic-update paths in
	// `App.tsx` and `use-streaming.ts` (which mutate the unscoped query
	// key) working without a per-space cache fanout.
	const visibleFolders = useMemo(() => {
		return folders.filter(
			(folder) => (folder.spaceId ?? DEFAULT_SPACE_ID) === activeSpaceId,
		);
	}, [folders, activeSpaceId]);

	// Direction of the page transition: -1 when we're moving to a space
	// that sits earlier in the list, +1 when later. AnimatePresence reads
	// it via the `custom` prop so the exit/enter offsets line up with the
	// user's gesture.
	const activeIndex = useMemo(() => {
		const index = spaces.findIndex((space) => space.id === activeSpaceId);
		return index === -1 ? 0 : index;
	}, [spaces, activeSpaceId]);
	const [direction, setDirection] = useState(0);
	const goToSpace = (spaceId: string) => {
		const nextIndex = spaces.findIndex((space) => space.id === spaceId);
		setDirection(nextIndex < activeIndex ? -1 : 1);
		onSelectSpace(spaceId);
	};

	// Per-position hotkey for the dot tooltip + accessible label. We expose
	// the first 9 positions because the registry only seeds `Mod+1..Mod+9`;
	// any space beyond that just shows its name in the tooltip.
	const spaceShortcutHotkeys = useMemo(
		() =>
			Array.from({ length: 9 }, (_, i) =>
				getShortcut(settings.shortcuts, `space.switch.${i + 1}` as ShortcutId),
			),
		[settings.shortcuts],
	);

	const shortcutChats = useMemo(
		() =>
			visibleFolders
				.flatMap((folder) => {
					if (!isFolderExpanded(folder.repoId)) return [];
					const visibleChats = expandedChatRepoIds.has(folder.repoId)
						? folder.chats
						: folder.chats.slice(0, MAX_COLLAPSED_CHATS);
					return visibleChats;
				})
				.concat(genericChats)
				.slice(0, CHAT_SHORTCUT_LIMIT),
		[expandedChatRepoIds, visibleFolders, genericChats, isFolderExpanded],
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
					"scrollbar-stable min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
					"pr-1 pl-2",
				)}
			>
				<ProjectsHeader
					addBusy={addBusy}
					addRepositoryShortcut={addRepositoryShortcut}
					importingRepository={importingRepository}
					isAddMenuOpen={isAddMenuOpen}
					onAddMenuOpenChange={setIsAddMenuOpen}
					onAddRepository={onAddRepository}
					onOpenCloneDialog={onOpenCloneDialog}
				/>
				<SpacePager
					activeSpaceId={activeSpaceId}
					direction={direction}
					spaces={spaces}
					onSwipe={goToSpace}
				>
					{visibleFolders.length === 0 ? null : (
						<ul className="flex flex-col gap-0.5 pb-2 pt-1">
							{importingRepository ? <PendingProjectRow /> : null}
							{visibleFolders.map((folder) => (
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
																		shortcutIndexBySessionId.get(
																			chat.sessionId,
																		);
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
					{visibleFolders.length === 0 ? <EmptySpacePlaceholder /> : null}
				</SpacePager>
			</div>
			{onCreateGenericChat ? (
				<GenericChatsSection
					chats={genericChats}
					selectedWorkspaceId={selectedWorkspaceId}
					selectedSessionId={selectedSessionId}
					interactionRequiredSessionIds={interactionRequiredSessionIds}
					shortcutIndexBySessionId={shortcutIndexBySessionId}
					showChatShortcuts={showChatShortcuts}
					deleteChatShortcut={deleteChatShortcut}
					creating={creatingGenericChat}
					onCreateChat={onCreateGenericChat}
					onSelectChat={(workspaceId, sessionId) => {
						onPrefetchChat(workspaceId, sessionId);
						onSelectChat(workspaceId, sessionId);
					}}
					onToggleChatPin={onToggleChatPin}
					onDeleteChat={removeChat}
				/>
			) : null}
			<div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-3 pt-1">
				<div className="flex items-center gap-[2px]">
					{footerControls}
					{accountControl}
				</div>
				<SpacePageDots
					spaces={spaces}
					activeSpaceId={activeSpaceId}
					onSelect={goToSpace}
					hotkeys={spaceShortcutHotkeys}
					className="shrink-0"
					trailing={
						<CreateSpaceButton
							onSpaceCreated={(space) => {
								setDirection(1);
								onSelectSpace(space.id);
							}}
						/>
					}
				/>
				<div className="flex items-center gap-[2px]">
					<UsageStatsIndicator />
				</div>
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

function ProjectsHeader({
	addBusy,
	addRepositoryShortcut,
	importingRepository,
	isAddMenuOpen,
	onAddMenuOpenChange,
	onAddRepository,
	onOpenCloneDialog,
}: {
	addBusy: boolean;
	addRepositoryShortcut?: string | null;
	importingRepository: boolean;
	isAddMenuOpen: boolean;
	onAddMenuOpenChange: (open: boolean) => void;
	onAddRepository: () => void;
	onOpenCloneDialog: () => void;
}) {
	return (
		<div className="flex h-7 select-none items-center gap-2 px-1.5 pt-1">
			<span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
				Projects
			</span>
			<DropdownMenu open={isAddMenuOpen} onOpenChange={onAddMenuOpenChange}>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Add project"
								disabled={addBusy}
								className={cn(
									"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors",
									"hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									"disabled:cursor-not-allowed disabled:opacity-60",
								)}
							>
								{addBusy ? (
									<LoaderCircle
										className="size-3.5 animate-spin"
										strokeWidth={2.1}
									/>
								) : (
									<FolderPlus className="size-3.5" strokeWidth={2} />
								)}
							</button>
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
				<DropdownMenuContent align="end" sideOffset={6} className="min-w-44">
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

function GenericChatsSection({
	chats,
	selectedWorkspaceId,
	selectedSessionId,
	interactionRequiredSessionIds,
	shortcutIndexBySessionId,
	showChatShortcuts,
	deleteChatShortcut,
	creating,
	onCreateChat,
	onSelectChat,
	onToggleChatPin,
	onDeleteChat,
}: {
	chats: RepositoryFolderChat[];
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	interactionRequiredSessionIds?: Set<string>;
	shortcutIndexBySessionId: Map<string, number>;
	showChatShortcuts: boolean;
	deleteChatShortcut?: string | null;
	creating: boolean;
	onCreateChat: () => void;
	onSelectChat: (workspaceId: string, sessionId: string) => void;
	onToggleChatPin?: (chat: RepositoryFolderChat) => void;
	onDeleteChat: (chat: RepositoryFolderChat) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	const [overflowExpanded, setOverflowExpanded] = useState(false);
	const hasOverflow = chats.length > MAX_GENERIC_CHATS_COLLAPSED;
	const visibleChats =
		expanded && !overflowExpanded
			? chats.slice(0, MAX_GENERIC_CHATS_COLLAPSED)
			: chats;
	const showOverflowToggle = expanded && hasOverflow && overflowExpanded;
	const busy = creating;
	return (
		<div className="shrink-0 px-2 pb-1 pt-1">
			<div
				data-expanded={expanded ? "true" : "false"}
				className={cn(
					"group/chats relative flex h-7 select-none items-center gap-2 rounded-md px-1.5 transition-colors",
					"hover:bg-accent/40",
				)}
			>
				<button
					type="button"
					aria-expanded={expanded}
					aria-label="Toggle chats"
					className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70"
					onClick={() => setExpanded((value) => !value)}
				>
					<span className="min-w-0 flex-1 truncate">Chats</span>
					{chats.length > 0 ? (
						<span
							className={cn(
								"ml-auto inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none tabular-nums transition-all",
								"bg-foreground/[0.06] text-muted-foreground/70",
								"group-hover/chats:opacity-0",
							)}
						>
							{chats.length}
						</span>
					) : null}
				</button>

				<div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
					{showOverflowToggle ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Hide chats"
									className={cn(
										"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
										"group-hover/chats:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									)}
									onClick={(event) => {
										event.stopPropagation();
										setOverflowExpanded(false);
									}}
								>
									<ChevronUp className="size-3.5" strokeWidth={2.2} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" sideOffset={4}>
								Hide chats
							</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label="New generic chat"
								disabled={busy}
								className={cn(
									"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
									"group-hover/chats:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									"disabled:cursor-not-allowed disabled:opacity-60",
									busy && "opacity-100",
								)}
								onClick={(event) => {
									event.stopPropagation();
									if (!expanded) {
										setExpanded(true);
									}
									onCreateChat();
								}}
							>
								{busy ? (
									<LoaderCircle
										className="size-3.5 animate-spin"
										strokeWidth={2.1}
									/>
								) : (
									<Plus className="size-3.5" strokeWidth={2.4} />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							New chat
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
			{expanded && chats.length > 0 ? (
				<div
					className="relative ml-[6px] flex flex-col gap-0.5 pb-1 pl-3"
					style={{
						backgroundImage:
							"linear-gradient(to bottom, color-mix(in oklch, var(--border) 70%, transparent) 0%, color-mix(in oklch, var(--border) 70%, transparent) 100%)",
						backgroundSize: "1px calc(100% - 8px)",
						backgroundPosition: "0 4px",
						backgroundRepeat: "no-repeat",
					}}
				>
					{visibleChats.map((chat) => (
						<ChatRow
							key={chat.sessionId}
							chat={chat}
							selected={
								selectedWorkspaceId === chat.workspaceId &&
								selectedSessionId === chat.sessionId
							}
							isInteractionRequired={
								interactionRequiredSessionIds?.has(chat.sessionId) ?? false
							}
							shortcutLabel={(() => {
								const shortcutIndex = shortcutIndexBySessionId.get(
									chat.sessionId,
								);
								if (shortcutIndex === undefined) return null;
								return `Cmd+${shortcutIndex === 9 ? 0 : shortcutIndex + 1}`;
							})()}
							showShortcutHint={showChatShortcuts}
							deleteChatShortcut={deleteChatShortcut}
							onSelect={onSelectChat}
							onTogglePin={onToggleChatPin}
							onDelete={() => onDeleteChat(chat)}
						/>
					))}
					{hasOverflow && !overflowExpanded ? (
						<ShowMoreChatsButton
							hiddenCount={chats.length - MAX_GENERIC_CHATS_COLLAPSED}
							onClick={() => setOverflowExpanded(true)}
						/>
					) : null}
				</div>
			) : null}
		</div>
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

/**
 * Pager wrapper around the active Space's project list. The container
 * stays in place; only the inner pane animates so collapsing folders
 * inside the active page doesn't push the dots / footer around.
 *
 * Drag thresholds are tuned for trackpad two-finger gestures: 60px of
 * travel OR 500px/s velocity is enough to commit. Below that, the page
 * springs back. With a single space, drag is disabled — there's nowhere
 * to swipe to.
 */
const SWIPE_DISTANCE_PX = 60;
const SWIPE_VELOCITY_PX_PER_S = 500;

function SpacePager({
	activeSpaceId,
	direction,
	spaces,
	onSwipe,
	children,
}: {
	activeSpaceId: string;
	direction: number;
	spaces: Space[];
	onSwipe: (spaceId: string) => void;
	children: ReactNode;
}) {
	const activeIndex = spaces.findIndex((space) => space.id === activeSpaceId);
	const dragEnabled = spaces.length > 1;

	const handleDragEnd = (
		_event: PointerEvent | MouseEvent | TouchEvent,
		info: PanInfo,
	) => {
		if (!dragEnabled || activeIndex === -1) return;
		const swipedRight =
			info.offset.x > SWIPE_DISTANCE_PX ||
			info.velocity.x > SWIPE_VELOCITY_PX_PER_S;
		const swipedLeft =
			info.offset.x < -SWIPE_DISTANCE_PX ||
			info.velocity.x < -SWIPE_VELOCITY_PX_PER_S;
		if (swipedLeft && activeIndex < spaces.length - 1) {
			onSwipe(spaces[activeIndex + 1].id);
		} else if (swipedRight && activeIndex > 0) {
			onSwipe(spaces[activeIndex - 1].id);
		}
	};

	return (
		<div className="relative w-full">
			<AnimatePresence custom={direction} initial={false} mode="popLayout">
				<motion.div
					key={activeSpaceId}
					custom={direction}
					drag={dragEnabled ? "x" : false}
					dragConstraints={{ left: 0, right: 0 }}
					dragElastic={0.2}
					onDragEnd={handleDragEnd}
					variants={pagerVariants}
					initial="enter"
					animate="center"
					exit="exit"
					transition={{ duration: 0.18, ease: "easeOut" }}
					// touch-pan-y leaves vertical scrolling to the parent
					// scroll container while still capturing horizontal
					// pan gestures for the pager.
					className="touch-pan-y"
				>
					{children}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

const pagerVariants: Variants = {
	enter: (direction: number) => ({ x: direction * 24, opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (direction: number) => ({ x: -direction * 24, opacity: 0 }),
};

function EmptySpacePlaceholder() {
	// Quiet placeholder. The user already has the top-of-list "Add
	// project" affordance from `ProjectsHeader`; doubling it up here
	// just clutters the empty page (and clashes with the existing
	// "Add project" accessible name in tests).
	return (
		<div className="flex flex-col items-start gap-1 px-1 pt-2 pb-3">
			<p className="text-app-foreground/60 text-[12px] leading-snug">
				No projects in this Space yet.
			</p>
			<p className="text-app-foreground/40 text-[11px] leading-snug">
				Use the + button above to add one.
			</p>
		</div>
	);
}
