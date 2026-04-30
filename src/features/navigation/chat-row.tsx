import { MessageSquare, Pin, PinOff, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AsciiLoader } from "@/components/ascii-loader";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { RepositoryFolderChat } from "@/lib/api";
import { formatCompactElapsedTime } from "@/lib/compact-relative-time";
import { useSendingSessionIds } from "@/lib/sending-sessions-context";
import { cn } from "@/lib/utils";

export type ChatRowProps = {
	chat: RepositoryFolderChat;
	selected: boolean;
	onSelect: (workspaceId: string, sessionId: string) => void;
	onTogglePin?: (chat: RepositoryFolderChat) => void;
	onDelete?: (sessionId: string) => void;
};

function useChatActivityTime(chat: RepositoryFolderChat): string | null {
	const activityIso =
		chat.lastUserMessageAt ?? chat.updatedAt ?? chat.createdAt;
	const [nowTick, setNowTick] = useState(0);

	useEffect(() => {
		if (!activityIso) return;
		const interval = window.setInterval(() => {
			setNowTick((tick) => tick + 1);
		}, 60_000);
		return () => window.clearInterval(interval);
	}, [activityIso]);

	return useMemo(
		() => formatCompactElapsedTime(activityIso),
		[activityIso, nowTick],
	);
}

export const ChatRow = memo(function ChatRow({
	chat,
	selected,
	onSelect,
	onTogglePin,
	onDelete,
}: ChatRowProps) {
	const hasUnread = chat.unreadCount > 0;
	const isPinned = Boolean(chat.pinnedAt);
	const activityTime = useChatActivityTime(chat);
	const sendingSessionIds = useSendingSessionIds();
	const isSending = sendingSessionIds.has(chat.sessionId);
	const [checkPhase, setCheckPhase] = useState<"visible" | "fading" | null>(
		null,
	);
	const prevSendingRef = useRef(isSending);

	useEffect(() => {
		const wasSending = prevSendingRef.current;
		prevSendingRef.current = isSending;
		if (!wasSending || isSending || selected) return;
		setCheckPhase("visible");
		const fadeTimer = window.setTimeout(() => setCheckPhase("fading"), 2000);
		const clearTimer = window.setTimeout(() => setCheckPhase(null), 2600);
		return () => {
			window.clearTimeout(fadeTimer);
			window.clearTimeout(clearTimer);
		};
	}, [isSending, selected]);

	useEffect(() => {
		if (selected) setCheckPhase(null);
	}, [selected]);

	const showCheck = checkPhase !== null && !selected && !isSending;
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
				<div className="group/chat relative h-7 w-full">
					<button
						type="button"
						className={cn(
							"flex h-7 w-full select-none items-center gap-2 rounded-md px-2 text-[13px] cursor-pointer",
							selected
								? "workspace-row-selected text-foreground"
								: "text-foreground/80 hover:bg-accent/60",
						)}
						onClick={() => onSelect(chat.workspaceId, chat.sessionId)}
					>
						{isSending ? (
							<AsciiLoader
								className={cn(
									"size-3.5 shrink-0 text-[13px] text-muted-foreground transition-opacity",
									onTogglePin && "group-hover/chat:opacity-0",
								)}
							/>
						) : showCheck ? (
							<svg
								aria-label="Run complete"
								role="img"
								viewBox="0 0 12 12"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								strokeLinecap="round"
								strokeLinejoin="round"
								className={cn(
									"size-3.5 shrink-0 text-emerald-500 transition-opacity duration-500",
									checkPhase === "fading" && "opacity-0",
									onTogglePin && "group-hover/chat:opacity-0",
								)}
							>
								<path d="M2.5 6.25 L5 8.5 L9.5 3.75" />
							</svg>
						) : (
							<ProviderIcon
								aria-label={providerLabel}
								className={cn(
									"size-3.5 shrink-0 text-muted-foreground transition-opacity",
									onTogglePin && "group-hover/chat:opacity-0",
								)}
								strokeWidth={2}
							/>
						)}
						<span className="min-w-0 flex-1 truncate text-left">
							{chat.title?.trim() ? chat.title : "New chat"}
						</span>
						{activityTime ? (
							<span
								className={cn(
									"shrink-0 text-[11px] leading-none tabular-nums text-muted-foreground/65 transition-opacity",
									onDelete &&
										"group-hover/chat:opacity-0 group-focus-within/chat:opacity-0",
								)}
							>
								{activityTime}
							</span>
						) : null}
						{isPinned ? (
							<Pin
								aria-label="Pinned"
								className="size-3 shrink-0 text-muted-foreground transition-opacity group-hover/chat:opacity-0"
								strokeWidth={2}
							/>
						) : null}
						{hasUnread ? (
							<span
								aria-hidden="true"
								className="inline-block size-1.5 shrink-0 rounded-full bg-primary transition-opacity group-hover/chat:opacity-0"
							/>
						) : null}
					</button>
					{onTogglePin ? (
						<button
							type="button"
							aria-label={isPinned ? "Unpin chat" : "Pin chat"}
							className="absolute left-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/chat:opacity-100 cursor-pointer"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								onTogglePin(chat);
							}}
						>
							{isPinned ? (
								<PinOff className="size-3.5" strokeWidth={2} />
							) : (
								<Pin className="size-3.5" strokeWidth={2} />
							)}
						</button>
					) : null}
					{onDelete ? (
						<button
							type="button"
							aria-label="Delete chat"
							className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/chat:opacity-100 cursor-pointer"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								onDelete(chat.sessionId);
							}}
						>
							<Trash2 className="size-3.5" strokeWidth={2} />
						</button>
					) : null}
				</div>
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
