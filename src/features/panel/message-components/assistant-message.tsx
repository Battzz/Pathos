import {
	AlertCircle,
	AlertTriangle,
	Clock3,
	Info,
	RotateCcw,
} from "lucide-react";
import { memo, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai/reasoning";
import { LazyStreamdown } from "@/components/streamdown-loader";
import { Button } from "@/components/ui/button";
import {
	type ExtendedMessagePart,
	partKey,
	type ToolCallPart,
} from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ImageBlock, PlanReviewCard, TodoList } from "./content-parts";
import {
	CopyMessageButton,
	serializeMessageForClipboard,
} from "./copy-message";
import type { RenderedMessage, StreamdownMode } from "./shared";
import {
	isCollapsedGroupPart,
	isImagePart,
	isPlanReviewPart,
	isReasoningPart,
	isTextPart,
	isTodoListPart,
	isToolCallPart,
	reasoningLifecycle,
} from "./shared";
import { AssistantToolCall, CollapsedToolGroup } from "./tool-call";

// --- AssistantText ---

const STREAMING_ANIMATED = {
	animation: "blurIn" as const,
	duration: 150,
	easing: "linear" as const,
	sep: "word" as const,
	stagger: 30,
};

const AssistantText = memo(function AssistantText({
	text,
	streaming,
}: {
	text: string;
	streaming: boolean;
}) {
	const mode: StreamdownMode = streaming ? "streaming" : "static";
	const { settings } = useSettings();

	return (
		<div
			className="conversation-markdown assistant-markdown-scale max-w-none select-text break-words text-foreground"
			style={{ fontSize: `${settings.fontSize}px` }}
		>
			<Suspense fallback={<AssistantTextFallback text={text} />}>
				<LazyStreamdown
					animated={streaming ? STREAMING_ANIMATED : false}
					caret={undefined}
					className="conversation-streamdown"
					isAnimating={streaming}
					mode={mode}
				>
					{text}
				</LazyStreamdown>
			</Suspense>
		</div>
	);
});

function AssistantTextFallback({ text }: { text: string }) {
	return (
		<div className="conversation-streamdown select-text whitespace-pre-wrap break-words">
			{text}
		</div>
	);
}

// --- MessageStatusBadge ---

function statusBadgeMeta(
	reason: string,
): { label: string; tone: string; icon: React.ReactNode } | null {
	const negativeTone = "bg-destructive/10 text-destructive";
	const warmTone = "bg-chart-5/10 text-chart-5";
	switch (reason) {
		case "max_tokens":
			return {
				label: "Output truncated",
				tone: warmTone,
				icon: <AlertTriangle className="size-3" strokeWidth={1.8} />,
			};
		case "context_window_exceeded":
			return {
				label: "Context window exceeded",
				tone: negativeTone,
				icon: <AlertCircle className="size-3" strokeWidth={1.8} />,
			};
		case "refusal":
			return {
				label: "Model declined",
				tone: warmTone,
				icon: <Info className="size-3" strokeWidth={1.8} />,
			};
		case "pause_turn":
			return {
				label: "Paused",
				tone: warmTone,
				icon: <Clock3 className="size-3" strokeWidth={1.8} />,
			};
		default:
			return {
				label: reason,
				tone: negativeTone,
				icon: <AlertCircle className="size-3" strokeWidth={1.8} />,
			};
	}
}

function MessageStatusBadge({ reason }: { reason?: string }) {
	if (!reason) {
		return null;
	}
	const meta = statusBadgeMeta(reason);
	if (!meta) {
		return null;
	}
	return (
		<div
			className={cn(
				"mt-1 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
				meta.tone,
			)}
		>
			{meta.icon}
			<span>{meta.label}</span>
		</div>
	);
}

// --- ChatAssistantMessage ---

export function ChatAssistantMessage({
	message,
	previousUserMessage,
	streaming,
	onRedoAssistantMessage,
}: {
	message: RenderedMessage;
	previousUserMessage?: RenderedMessage | null;
	streaming: boolean;
	onRedoAssistantMessage?: (
		userMessageId: string,
		prompt: string,
	) => void | Promise<void>;
}) {
	const parts = message.content as ExtendedMessagePart[];
	const { settings } = useSettings();
	const [redoing, setRedoing] = useState(false);
	const redoPrompt = useMemo(
		() =>
			previousUserMessage
				? serializeMessageForClipboard(previousUserMessage)
				: "",
		[previousUserMessage],
	);
	const canRedo = Boolean(
		!streaming &&
			previousUserMessage?.id &&
			redoPrompt.trim() &&
			onRedoAssistantMessage,
	);
	const handleRedo = useCallback(async () => {
		if (!previousUserMessage?.id || !onRedoAssistantMessage) {
			return;
		}
		const prompt = redoPrompt.trim();
		if (!prompt) {
			return;
		}
		setRedoing(true);
		try {
			await onRedoAssistantMessage(previousUserMessage.id, prompt);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to redo model run.",
			);
		} finally {
			setRedoing(false);
		}
	}, [onRedoAssistantMessage, previousUserMessage?.id, redoPrompt]);

	return (
		<div
			data-message-id={message.id}
			data-message-role="assistant"
			className="group/assistant relative flex min-w-0 max-w-full flex-col gap-1 pb-5"
		>
			{parts.map((part) => {
				const key = partKey(part);
				if (isTextPart(part)) {
					return (
						<AssistantText key={key} text={part.text} streaming={streaming} />
					);
				}
				if (isReasoningPart(part)) {
					const durationSeconds =
						typeof part.durationMs === "number"
							? Math.max(1, Math.ceil(part.durationMs / 1000))
							: undefined;
					return (
						<Reasoning
							key={key}
							lifecycle={reasoningLifecycle(part)}
							duration={durationSeconds}
						>
							<ReasoningTrigger />
							<ReasoningContent fontSize={settings.fontSize}>
								{part.text}
							</ReasoningContent>
						</Reasoning>
					);
				}
				if (isCollapsedGroupPart(part)) {
					return <CollapsedToolGroup key={key} group={part} />;
				}
				if (isToolCallPart(part)) {
					return (
						<AssistantToolCall
							key={key}
							toolName={part.toolName}
							args={part.args}
							result={part.result}
							isError={
								part.toolName === "ExitPlanMode"
									? false
									: (part as ToolCallPart).isError
							}
							streamingStatus={(part as ToolCallPart).streamingStatus}
							childParts={(part as ToolCallPart).children}
						/>
					);
				}
				if (isTodoListPart(part)) {
					return <TodoList key={key} part={part} />;
				}
				if (isImagePart(part)) {
					return <ImageBlock key={key} part={part} />;
				}
				if (isPlanReviewPart(part)) {
					return <PlanReviewCard key={key} part={part} />;
				}
				return null;
			})}
			{!streaming && message.status?.type === "incomplete" ? (
				<MessageStatusBadge reason={message.status.reason} />
			) : null}
			{!streaming ? (
				<div className="pointer-events-none absolute bottom-0 left-0 flex items-center opacity-0 group-hover/assistant:pointer-events-auto group-hover/assistant:opacity-100 group-focus-within/assistant:pointer-events-auto group-focus-within/assistant:opacity-100">
					<CopyMessageButton
						message={message}
						className="size-5 shrink-0 text-muted-foreground/28 hover:text-muted-foreground"
					/>
					{canRedo ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Redo run"
							onClick={() => {
								void handleRedo();
							}}
							disabled={redoing}
							className="size-5 shrink-0 text-muted-foreground/28 transition-none hover:text-muted-foreground"
						>
							<RotateCcw className="size-3" strokeWidth={1.8} />
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
