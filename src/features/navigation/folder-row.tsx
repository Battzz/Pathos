import {
	ChevronUp,
	FolderOpen,
	LoaderCircle,
	MessageSquarePlus,
	MessageSquareX,
	MoveRight,
	Plus,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { DEFAULT_SPACE_ID, type RepositoryFolder, type Space } from "@/lib/api";
import { cn } from "@/lib/utils";
import { WorkspaceAvatar } from "./avatar";

export type FolderRowProps = {
	folder: RepositoryFolder;
	expanded: boolean;
	itemCount: number;
	onToggle: (repoId: string) => void;
	onCreateChat: (repoId: string) => void;
	onCollapseChats?: (repoId: string) => void;
	newChatShortcut?: string | null;
	onOpenInFinder?: (repoId: string) => void;
	onDeleteProjectChats?: (repoId: string) => void;
	onRemoveProject?: (repoId: string) => void;
	spaces?: Space[];
	onMoveProjectToSpace?: (repoId: string, spaceId: string) => void;
	creatingChat?: boolean;
	chatOverflowExpanded?: boolean;
	highlighted?: boolean;
	active?: boolean;
};

export const FolderRow = memo(function FolderRow({
	folder,
	expanded,
	itemCount,
	onToggle,
	onCreateChat,
	onCollapseChats,
	newChatShortcut,
	onOpenInFinder,
	onDeleteProjectChats,
	onRemoveProject,
	spaces = [],
	onMoveProjectToSpace,
	creatingChat,
	chatOverflowExpanded,
	highlighted,
	active,
}: FolderRowProps) {
	const busy = Boolean(creatingChat);
	const currentSpaceId = folder.spaceId ?? DEFAULT_SPACE_ID;
	const canMoveProject = Boolean(onMoveProjectToSpace && spaces.length > 1);
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					data-expanded={expanded ? "true" : "false"}
					data-active-project={active ? "true" : undefined}
					className={cn(
						"group/folder relative flex h-8 select-none items-center gap-1 rounded-md pr-1 pl-1.5 text-[13px] font-semibold tracking-[-0.01em] text-foreground/90 transition-colors",
						"hover:bg-accent/40 hover:text-foreground",
						"data-[expanded=true]:text-foreground",
						active && "workspace-folder-active text-foreground",
						highlighted && "pathos-project-added bg-accent/35",
					)}
				>
					<button
						type="button"
						aria-expanded={expanded}
						aria-label={`Toggle ${folder.repoName}`}
						className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer text-left"
						onClick={() => onToggle(folder.repoId)}
					>
						<WorkspaceAvatar
							repoIconSrc={folder.repoIconSrc}
							repoInitials={folder.repoInitials}
							repoName={folder.repoName}
							title={folder.repoName}
							className="size-[18px] rounded-[5px]"
							fallbackClassName="text-[8.5px]"
						/>
						<span className="truncate">{folder.repoName}</span>
						{itemCount > 0 ? (
							<span
								className={cn(
									"ml-auto inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none tabular-nums transition-all",
									"bg-foreground/[0.06] text-muted-foreground/70",
									"group-hover/folder:bg-foreground/[0.1] group-hover/folder:text-muted-foreground group-hover/folder:opacity-0",
								)}
							>
								{itemCount}
							</span>
						) : null}
					</button>

					<div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
						{chatOverflowExpanded && onCollapseChats ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label={`Hide chats in ${folder.repoName}`}
										className={cn(
											"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
											"group-hover/folder:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
										)}
										onClick={(event) => {
											event.stopPropagation();
											onCollapseChats(folder.repoId);
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
									aria-label={`New chat in ${folder.repoName}`}
									disabled={busy}
									className={cn(
										"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
										"group-hover/folder:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
										"disabled:cursor-not-allowed disabled:opacity-60",
										busy && "opacity-100",
									)}
									onClick={(event) => {
										event.stopPropagation();
										onCreateChat(folder.repoId);
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
							<TooltipContent
								side="top"
								sideOffset={4}
								className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
							>
								<span>New chat</span>
								{newChatShortcut ? (
									<InlineShortcutDisplay
										hotkey={newChatShortcut}
										className="text-tooltip-foreground/55"
									/>
								) : null}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="min-w-44">
				<ContextMenuItem onSelect={() => onCreateChat(folder.repoId)}>
					<MessageSquarePlus className="size-3.5" strokeWidth={2} />
					<span>New chat</span>
				</ContextMenuItem>
				{onOpenInFinder ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={() => onOpenInFinder(folder.repoId)}>
							<FolderOpen className="size-3.5" strokeWidth={2} />
							<span>Open in Finder</span>
						</ContextMenuItem>
					</>
				) : null}
				{canMoveProject ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<MoveRight className="size-3.5" strokeWidth={2} />
								<span>Move to Space</span>
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="min-w-44">
								<ContextMenuRadioGroup value={currentSpaceId}>
									{spaces.map((space) => (
										<ContextMenuRadioItem
											key={space.id}
											value={space.id}
											disabled={space.id === currentSpaceId}
											onSelect={() =>
												onMoveProjectToSpace?.(folder.repoId, space.id)
											}
										>
											<span className="truncate">{space.name}</span>
										</ContextMenuRadioItem>
									))}
								</ContextMenuRadioGroup>
							</ContextMenuSubContent>
						</ContextMenuSub>
					</>
				) : null}
				{onRemoveProject ? (
					<>
						<ContextMenuSeparator />
						{onDeleteProjectChats ? (
							<ContextMenuItem
								variant="destructive"
								disabled={itemCount === 0}
								onSelect={() => onDeleteProjectChats(folder.repoId)}
							>
								<MessageSquareX className="size-3.5" strokeWidth={2} />
								<span>Remove all chats</span>
							</ContextMenuItem>
						) : null}
						<ContextMenuItem
							variant="destructive"
							onSelect={() => onRemoveProject(folder.repoId)}
						>
							<Trash2 className="size-3.5" strokeWidth={2} />
							<span>Remove project</span>
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
});
