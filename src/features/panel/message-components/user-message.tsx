import {
	Check,
	FileText,
	ImageIcon,
	PencilLine,
	RotateCcw,
	SendHorizontal,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	createFilePreviewLoader,
	InlineBadge,
} from "@/components/inline-badge";
import { Button } from "@/components/ui/button";
import type { MessagePart } from "@/lib/api";
import { formatCompactElapsedTime } from "@/lib/compact-relative-time";
import { basename } from "@/lib/path-util";
import { useSettings } from "@/lib/settings";
import {
	CopyMessageButton,
	serializeMessageForClipboard,
} from "./copy-message";
import type { RenderedMessage } from "./shared";
import { isFileMentionPart, isTextPart } from "./shared";

const USER_FILE_RE = /@(\/\S+)(?=\s|$)/gi;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico)$/i;

type UserContentSegment =
	| { type: "text"; value: string }
	| { type: "image"; value: string }
	| { type: "file"; value: string };

function splitUserContent(text: string): UserContentSegment[] {
	const segments: UserContentSegment[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(USER_FILE_RE)) {
		const matchIndex = match.index ?? 0;
		const before = text.slice(lastIndex, matchIndex);
		if (before) {
			segments.push({ type: "text", value: before });
		}
		const filePath = match[1];
		segments.push({
			type: IMAGE_EXT_RE.test(filePath) ? "image" : "file",
			value: filePath,
		});
		lastIndex = matchIndex + match[0].length;
	}
	const after = text.slice(lastIndex);
	if (after) {
		segments.push({ type: "text", value: after });
	}
	return segments;
}

const UserTextInline = memo(function UserTextInline({
	text,
}: {
	text: string;
}) {
	const segments = useMemo(() => splitUserContent(text), [text]);
	if (
		!segments.some(
			(segment) => segment.type === "image" || segment.type === "file",
		)
	) {
		return <>{text}</>;
	}
	return (
		<>
			{segments.map((segment, index) => {
				if (segment.type === "image") {
					return (
						<BubbleImageBadge
							key={`${segment.value}-${index}`}
							path={segment.value}
						/>
					);
				}
				if (segment.type === "file") {
					return (
						<BubbleFileBadge
							key={`${segment.value}-${index}`}
							path={segment.value}
						/>
					);
				}
				return <span key={index}>{segment.value}</span>;
			})}
		</>
	);
});

function BubbleFileBadge({ path }: { path: string }) {
	const fileName = basename(path);
	const previewLoader = useMemo(() => createFilePreviewLoader(path), [path]);
	return (
		<InlineBadge
			nonSelectable={false}
			icon={
				<FileText
					className="size-3.5 shrink-0 text-muted-foreground"
					strokeWidth={1.8}
				/>
			}
			label={fileName}
			previewLoader={previewLoader}
		/>
	);
}

function BubbleImageBadge({ path }: { path: string }) {
	const fileName = basename(path);
	return (
		<InlineBadge
			nonSelectable={false}
			icon={
				<ImageIcon
					className="size-3.5 shrink-0 text-chart-3"
					strokeWidth={1.8}
				/>
			}
			label={fileName}
			preview={{ kind: "image", title: fileName, path }}
		/>
	);
}

function useMessageAge(createdAt?: string): string | null {
	const [nowTick, setNowTick] = useState(0);

	useEffect(() => {
		if (!createdAt) return;
		const interval = window.setInterval(() => {
			setNowTick((tick) => tick + 1);
		}, 60_000);
		return () => window.clearInterval(interval);
	}, [createdAt]);

	return useMemo(
		() => formatCompactElapsedTime(createdAt),
		[createdAt, nowTick],
	);
}

export function ChatUserMessage({
	message,
	onRevertMessage,
	onSubmitEditedMessage,
}: {
	message: RenderedMessage;
	onRevertMessage?: (messageId: string) => void | Promise<void>;
	onSubmitEditedMessage?: (
		messageId: string,
		prompt: string,
	) => void | Promise<void>;
}) {
	const parts = message.content as MessagePart[];
	const { settings } = useSettings();
	const messageAge = useMessageAge(message.createdAt);
	const editorRef = useRef<HTMLTextAreaElement | null>(null);
	const [reverting, setReverting] = useState(false);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const editableText = useMemo(
		() => serializeMessageForClipboard(message),
		[message],
	);
	const canRevert = Boolean(message.id && onRevertMessage);
	const canEdit = Boolean(
		message.id &&
			onRevertMessage &&
			onSubmitEditedMessage &&
			editableText.trim(),
	);

	useEffect(() => {
		if (!editing) return;
		editorRef.current?.focus();
		editorRef.current?.setSelectionRange(draft.length, draft.length);
	}, [draft.length, editing]);

	const handleRevert = useCallback(async () => {
		if (!message.id || !onRevertMessage) {
			return;
		}
		setReverting(true);
		try {
			await onRevertMessage(message.id);
			toast.success("Chat rewound to this message.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to rewind chat messages.",
			);
		} finally {
			setReverting(false);
		}
	}, [message.id, onRevertMessage]);

	const handleStartEdit = useCallback(() => {
		setDraft(editableText);
		setEditing(true);
	}, [editableText]);

	const handleCancelEdit = useCallback(() => {
		setEditing(false);
		setDraft("");
	}, []);

	const handleSubmitEdit = useCallback(async () => {
		if (!message.id || !onSubmitEditedMessage) return;
		const nextPrompt = draft.trim();
		if (!nextPrompt) return;
		setReverting(true);
		try {
			await onSubmitEditedMessage(message.id, nextPrompt);
			setEditing(false);
			setDraft("");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to send edited message.",
			);
		} finally {
			setReverting(false);
		}
	}, [draft, message.id, onSubmitEditedMessage]);

	return (
		<div
			data-message-id={message.id}
			data-message-role="user"
			className="group/user flex min-w-0 justify-end"
		>
			<div
				className={
					editing
						? "relative flex w-[min(42rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)] min-w-0 flex-col items-end pb-5"
						: "relative flex max-w-[75%] min-w-0 flex-col items-end pb-5"
				}
			>
				{editing ? (
					<div
						className="group/edit relative w-full origin-top animate-in fade-in slide-in-from-bottom-1 overflow-hidden rounded-lg border border-primary/30 bg-card shadow-[0_0_0_1px_var(--color-primary)/0.04,0_8px_24px_-12px_var(--color-primary)/0.18] ring-1 ring-primary/10 backdrop-blur-sm duration-150"
						style={{ fontSize: `${settings.fontSize}px` }}
					>
						{/* Left accent — a revision mark */}
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-primary/0 via-primary/70 to-primary/0"
						/>

						{/* Eyebrow: status + character count */}
						<div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1">
							<div className="flex items-center gap-1.5">
								<span className="relative flex size-1.5 items-center justify-center">
									<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/50" />
									<span className="relative inline-flex size-1.5 rounded-full bg-primary" />
								</span>
								<span className="font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-primary/80">
									Revising
								</span>
							</div>
							<span className="font-mono text-[10px] tabular-nums leading-none text-muted-foreground/60">
								{draft.length.toLocaleString()}
								<span className="text-muted-foreground/30"> ch</span>
							</span>
						</div>

						<textarea
							ref={editorRef}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
									event.preventDefault();
									void handleSubmitEdit();
								}
								if (event.key === "Escape") {
									event.preventDefault();
									handleCancelEdit();
								}
							}}
							className="block max-h-[42vh] min-h-28 w-full resize-y border-0 bg-transparent px-4 pt-1 pb-3 leading-7 text-foreground outline-none placeholder:text-muted-foreground/45"
							aria-label="Edit message"
							placeholder="Refine your message…"
							disabled={reverting}
						/>

						<div className="flex items-center justify-between gap-3 border-border/50 border-t bg-muted/20 px-3 py-2">
							<div className="hidden items-center gap-2 font-mono text-[10.5px] tabular-nums text-muted-foreground/60 sm:flex">
								<span className="inline-flex items-center gap-1">
									<kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border/70 bg-card px-1 text-[10px] leading-none text-foreground/70 shadow-[0_1px_0_var(--color-border)]">
										⌘
									</kbd>
									<kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border/70 bg-card px-1 text-[10px] leading-none text-foreground/70 shadow-[0_1px_0_var(--color-border)]">
										↵
									</kbd>
									<span className="text-muted-foreground/55">save</span>
								</span>
								<span className="text-muted-foreground/25">·</span>
								<span className="inline-flex items-center gap-1">
									<kbd className="inline-flex h-4 items-center justify-center rounded-[3px] border border-border/70 bg-card px-1 text-[10px] leading-none text-foreground/70 shadow-[0_1px_0_var(--color-border)]">
										esc
									</kbd>
									<span className="text-muted-foreground/55">cancel</span>
								</span>
							</div>
							<div className="flex items-center gap-1.5 sm:ml-auto">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-label="Cancel edit"
									onClick={handleCancelEdit}
									disabled={reverting}
									className="h-7 gap-1 px-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
								>
									<X className="size-3" strokeWidth={2} />
									Cancel
								</Button>
								<Button
									type="button"
									variant="default"
									size="sm"
									aria-label="Send edited message"
									onClick={() => {
										void handleSubmitEdit();
									}}
									disabled={reverting || draft.trim().length === 0}
									className="h-7 gap-1.5 px-2.5 font-mono text-[11px] uppercase tracking-wider text-primary-foreground"
								>
									{reverting ? (
										<>
											<Check className="size-3" strokeWidth={2.4} />
											Sending
										</>
									) : (
										<>
											<SendHorizontal className="size-3" strokeWidth={2.4} />
											Rewind &amp; Send
										</>
									)}
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div
						className="conversation-body-text w-full select-text overflow-hidden rounded-md bg-accent/55 px-3 py-2 leading-7"
						style={{ fontSize: `${settings.fontSize}px` }}
					>
						<p className="whitespace-pre-wrap break-words">
							{parts.map((part, index) => {
								if (isTextPart(part)) {
									return <UserTextInline key={index} text={part.text} />;
								}
								if (isFileMentionPart(part)) {
									return <BubbleFileBadge key={index} path={part.path} />;
								}
								return null;
							})}
						</p>
					</div>
				)}
				{messageAge && !editing ? (
					<span className="pointer-events-none absolute right-1 bottom-0 flex h-5 items-center text-[11px] leading-none tabular-nums text-muted-foreground/55 transition-opacity group-hover/user:opacity-0 group-focus-within/user:opacity-0">
						{messageAge}
					</span>
				) : null}
				{!editing ? (
					<div className="pointer-events-none absolute right-1 bottom-0 flex items-center justify-end opacity-0 group-hover/user:pointer-events-auto group-hover/user:opacity-100 group-focus-within/user:pointer-events-auto group-focus-within/user:opacity-100">
						{canRevert ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label="Rewind chat"
								onClick={() => {
									void handleRevert();
								}}
								disabled={reverting}
								className="size-5 shrink-0 text-muted-foreground/28 transition-none hover:text-muted-foreground"
							>
								<RotateCcw className="size-3" strokeWidth={1.8} />
							</Button>
						) : null}
						{canEdit ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label="Edit and rewind message"
								onClick={handleStartEdit}
								disabled={reverting}
								className="size-5 shrink-0 text-muted-foreground/28 transition-none hover:text-muted-foreground"
							>
								<PencilLine className="size-3" strokeWidth={1.8} />
							</Button>
						) : null}
						<CopyMessageButton
							message={message}
							className="size-5 shrink-0 text-muted-foreground/28 hover:text-muted-foreground"
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}
