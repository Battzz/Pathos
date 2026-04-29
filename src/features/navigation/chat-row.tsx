import { MessageSquare, Pin, PinOff, Trash2 } from "lucide-react";
import { memo } from "react";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { RepositoryFolderChat } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ChatRowProps = {
	chat: RepositoryFolderChat;
	selected: boolean;
	onSelect: (workspaceId: string, sessionId: string) => void;
	onTogglePin?: (chat: RepositoryFolderChat) => void;
	onDelete?: (sessionId: string) => void;
};

export const ChatRow = memo(function ChatRow({
	chat,
	selected,
	onSelect,
	onTogglePin,
	onDelete,
}: ChatRowProps) {
	const hasUnread = chat.unreadCount > 0;
	const isPinned = Boolean(chat.pinnedAt);
	const ProviderIcon =
		chat.agentType === "claude"
			? ClaudeIcon
			: chat.agentType === "codex"
				? OpenAIIcon
				: MessageSquare;
	const providerLabel =
		chat.agentType === "claude"
			? "Anthropic"
			: chat.agentType === "codex"
				? "ChatGPT"
				: "Chat";
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"group/chat relative flex h-7 w-full select-none items-center gap-2 rounded-md px-2 text-[13px] cursor-pointer",
						selected
							? "workspace-row-selected text-foreground"
							: "text-foreground/80 hover:bg-accent/60",
					)}
					onClick={() => onSelect(chat.workspaceId, chat.sessionId)}
				>
					<ProviderIcon
						aria-label={providerLabel}
						className="size-3.5 shrink-0 text-muted-foreground"
						strokeWidth={2}
					/>
					<span className="truncate text-left">
						{chat.title?.trim() ? chat.title : "New chat"}
					</span>
					{isPinned ? (
						<Pin
							aria-label="Pinned"
							className="ml-auto size-3 shrink-0 text-muted-foreground"
							strokeWidth={2}
						/>
					) : null}
					{hasUnread ? (
						<span
							aria-hidden="true"
							className={cn(
								"inline-block size-1.5 rounded-full bg-primary",
								!isPinned && "ml-auto",
							)}
						/>
					) : null}
				</button>
			</ContextMenuTrigger>
			{onDelete || onTogglePin ? (
				<ContextMenuContent>
					{onTogglePin ? (
						<ContextMenuItem onSelect={() => onTogglePin(chat)}>
							{isPinned ? (
								<PinOff className="size-3.5" strokeWidth={2} />
							) : (
								<Pin className="size-3.5" strokeWidth={2} />
							)}
							<span>{isPinned ? "Unpin chat" : "Pin chat"}</span>
						</ContextMenuItem>
					) : null}
					{onDelete ? (
						<ContextMenuItem onSelect={() => onDelete(chat.sessionId)}>
							<Trash2 className="size-3.5" strokeWidth={2} />
							<span>Delete chat</span>
						</ContextMenuItem>
					) : null}
				</ContextMenuContent>
			) : null}
		</ContextMenu>
	);
});
