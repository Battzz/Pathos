import {
	Check,
	FileText,
	ImageIcon,
	PencilLine,
	RotateCcw,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	createFilePreviewLoader,
	InlineBadge,
} from "@/components/inline-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

type UserMessageRevertAction = "revert" | "edit";

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
	const [pendingAction, setPendingAction] =
		useState<UserMessageRevertAction | null>(null);
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

	const handleConfirmRevert = useCallback(async () => {
		if (!message.id || !pendingAction || !onRevertMessage) {
			return;
		}
		setReverting(true);
		try {
			await onRevertMessage(message.id);
			if (pendingAction === "edit") {
				setDraft(editableText);
				setEditing(true);
			} else {
				toast.success("Chat rewound to this message.");
			}
			setPendingAction(null);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to rewind chat messages.",
			);
		} finally {
			setReverting(false);
		}
	}, [editableText, message.id, onRevertMessage, pendingAction]);

	const handleSubmitEdit = useCallback(async () => {
		if (!message.id || !onSubmitEditedMessage) return;
		const nextPrompt = draft.trim();
		if (!nextPrompt) return;
		setReverting(true);
		try {
			await onSubmitEditedMessage(message.id, nextPrompt);
			setEditing(false);
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

	const dialogTitle =
		pendingAction === "edit" ? "Rewind and edit message?" : "Rewind chat?";
	const dialogDescription =
		pendingAction === "edit"
			? "This will delete newer chat messages, make this the last message, and open it for editing inline."
			: "This will delete newer chat messages and make this the last message in the conversation.";
	const dialogConfirmLabel =
		pendingAction === "edit" ? "Rewind and Edit" : "Rewind";

	return (
		<>
			<div
				data-message-id={message.id}
				data-message-role="user"
				className="group/user flex min-w-0 justify-end"
			>
				<div className="relative flex max-w-[75%] min-w-0 flex-col items-end pb-5">
					{editing ? (
						<div
							className="w-full rounded-md bg-accent/55 p-2"
							style={{ fontSize: `${settings.fontSize}px` }}
						>
							<textarea
								ref={editorRef}
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								onKeyDown={(event) => {
									if (
										(event.metaKey || event.ctrlKey) &&
										event.key === "Enter"
									) {
										event.preventDefault();
										void handleSubmitEdit();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										setEditing(false);
										setDraft("");
									}
								}}
								className="max-h-[40vh] min-h-24 w-full resize-y rounded-md border border-border/70 bg-background/70 px-2.5 py-2 leading-6 text-foreground outline-none focus:border-ring"
								aria-label="Edit message"
								disabled={reverting}
							/>
							<div className="mt-2 flex justify-end gap-1.5">
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Cancel edit"
									onClick={() => {
										setEditing(false);
										setDraft("");
									}}
									disabled={reverting}
									className="text-muted-foreground hover:text-foreground"
								>
									<X className="size-3.5" strokeWidth={1.8} />
								</Button>
								<Button
									type="button"
									variant="default"
									size="icon-xs"
									aria-label="Send edited message"
									onClick={() => {
										void handleSubmitEdit();
									}}
									disabled={reverting || draft.trim().length === 0}
									className="text-primary-foreground"
								>
									<Check className="size-3.5" strokeWidth={2} />
								</Button>
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
					{messageAge ? (
						<span className="pointer-events-none absolute right-1 bottom-0 flex h-5 items-center text-[11px] leading-none tabular-nums text-muted-foreground/55 transition-opacity group-hover/user:opacity-0 group-focus-within/user:opacity-0">
							{messageAge}
						</span>
					) : null}
					<div className="pointer-events-none absolute right-1 bottom-0 flex items-center justify-end opacity-0 group-hover/user:pointer-events-auto group-hover/user:opacity-100 group-focus-within/user:pointer-events-auto group-focus-within/user:opacity-100">
						{canRevert ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label="Rewind chat"
								onClick={() => setPendingAction("revert")}
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
								onClick={() => setPendingAction("edit")}
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
				</div>
			</div>
			<ConfirmDialog
				open={pendingAction !== null}
				onOpenChange={(open) => {
					if (!open && !reverting) {
						setPendingAction(null);
					}
				}}
				title={dialogTitle}
				description={dialogDescription}
				confirmLabel={dialogConfirmLabel}
				onConfirm={() => {
					void handleConfirmRevert();
				}}
				loading={reverting}
			/>
		</>
	);
}
