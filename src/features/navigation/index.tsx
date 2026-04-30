import {
	ChevronDown,
	FolderPlus,
	Globe,
	LoaderCircle,
	MessageSquarePlus,
} from "lucide-react";
import { memo, type ReactNode, useEffect, useState } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
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
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { RepositoryFolder, RepositoryFolderChat } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChatRow } from "./chat-row";
import { CloneFromUrlDialog } from "./clone-from-url-dialog";
import { FolderRow } from "./folder-row";

const MAX_COLLAPSED_CHATS = 8;

export type WorkspacesSidebarProps = {
	folders: RepositoryFolder[];
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	addRepositoryShortcut?: string | null;
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
	addRepositoryShortcut,
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
	onToggleChatPin,
	onRemoveProject,
	isFolderExpanded,
	onToggleFolder,
	footerControls,
	accountControl,
}: WorkspacesSidebarProps) {
	const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
	const [expandedChatRepoIds, setExpandedChatRepoIds] = useState<Set<string>>(
		() => new Set(),
	);

	useEffect(() => {
		const handler = () => setIsAddMenuOpen(true);
		window.addEventListener("pathos:open-add-repository", handler);
		return () =>
			window.removeEventListener("pathos:open-add-repository", handler);
	}, []);

	const addBusy = Boolean(addingRepository);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
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
									onRemoveProject={onRemoveProject}
									creatingChat={creatingChatRepoId === folder.repoId}
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
															onSelect={(ws, session) => {
																onPrefetchChat(ws, session);
																onSelectChat(ws, session);
															}}
															onTogglePin={onToggleChatPin}
															onDelete={onDeleteChat}
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
						<DropdownMenuContent align="start" className="min-w-44">
							<DropdownMenuItem
								disabled={addBusy}
								onSelect={() => {
									onAddRepository();
								}}
							>
								{addBusy ? (
									<LoaderCircle className="animate-spin" strokeWidth={2.1} />
								) : (
									<FolderPlus strokeWidth={2} />
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
							>
								<Globe strokeWidth={2} />
								<span>Clone from URL</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{footerControls}
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
