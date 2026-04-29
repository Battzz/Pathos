import {
	ChevronRight,
	FolderOpen,
	LoaderCircle,
	MessageSquarePlus,
	Plus,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { RepositoryFolder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { WorkspaceAvatar } from "./avatar";

export type FolderRowProps = {
	folder: RepositoryFolder;
	expanded: boolean;
	itemCount: number;
	onToggle: (repoId: string) => void;
	onCreateChat: (repoId: string) => void;
	onOpenInFinder?: (repoId: string) => void;
	onRemoveProject?: (repoId: string) => void;
	creatingChat?: boolean;
};

export const FolderRow = memo(function FolderRow({
	folder,
	expanded,
	itemCount,
	onToggle,
	onCreateChat,
	onOpenInFinder,
	onRemoveProject,
	creatingChat,
}: FolderRowProps) {
	const busy = Boolean(creatingChat);
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group/folder flex h-8 select-none items-center gap-1 rounded-md px-1.5 text-[13px] font-semibold tracking-[-0.01em] text-foreground hover:bg-accent/60",
					)}
				>
					<button
						type="button"
						aria-expanded={expanded}
						aria-label={`Toggle ${folder.repoName}`}
						className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer text-left"
						onClick={() => onToggle(folder.repoId)}
					>
						<ChevronRight
							className={cn(
								"size-3.5 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-90",
							)}
							strokeWidth={2}
						/>
						<WorkspaceAvatar
							repoIconSrc={folder.repoIconSrc}
							repoInitials={folder.repoInitials}
							repoName={folder.repoName}
							title={folder.repoName}
							className="size-4 rounded-[4px]"
							fallbackClassName="text-[7px]"
						/>
						<span className="truncate">{folder.repoName}</span>
						{itemCount > 0 ? (
							<span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover/folder:opacity-100">
								{itemCount}
							</span>
						) : null}
					</button>

					<Button
						type="button"
						aria-label={`New chat in ${folder.repoName}`}
						variant="ghost"
						size="icon-xs"
						disabled={busy}
						className={cn(
							"text-muted-foreground opacity-0 transition-opacity group-hover/folder:opacity-100",
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
					</Button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
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
				{onRemoveProject ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							className="text-destructive focus:text-destructive"
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
