import {
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

export type WorkspacesSidebarProps = {
	folders: RepositoryFolder[];
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	addRepositoryShortcut?: string | null;
	addingRepository: boolean;
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

			<div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto pr-1 pl-2 [scrollbar-width:thin]">
				{folders.length === 0 ? (
					<EmptySidebar onAddRepository={onAddRepository} />
				) : (
					<ul className="flex flex-col gap-0.5 pb-2 pt-1">
						{folders.map((folder) => (
							<li key={folder.repoId} className="flex flex-col">
								<FolderRow
									folder={folder}
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
											folder.chats.map((chat) => (
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
											))
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
								onSelect={() => {
									onAddRepository();
								}}
							>
								<FolderPlus strokeWidth={2} />
								<span>Open project</span>
							</DropdownMenuItem>
							<DropdownMenuItem
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

function EmptySidebar({ onAddRepository }: { onAddRepository: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 px-6 pt-16 text-center">
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
				className="mt-1 cursor-pointer"
			>
				<FolderPlus className="size-3.5" strokeWidth={2} />
				<span>Open project</span>
			</Button>
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
