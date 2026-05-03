import { AlertCircle, AlertTriangle, Clock3, Info } from "lucide-react";
import { memo, Suspense, useDeferredValue } from "react";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai/reasoning";
import { LazyStreamdown } from "@/components/streamdown-loader";
import {
	type ExtendedMessagePart,
	partKey,
	type ToolCallPart,
} from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { StreamingFooter } from "../streaming-footer";
import { ImageBlock, PlanReviewCard, TodoList } from "./content-parts";
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

const PLAIN_STREAMING_TEXT_THRESHOLD = 8000;

export function shouldRenderAssistantTextAsPlain(text: string): boolean {
	if (!text) {
		return true;
	}
	return !/(^|\n)\s*(#{1,6}\s|[-+*]\s|\d+\.\s|>\s)|[`*_#[\]<>|$]|!\[|\]\(|https?:\/\/|www\./.test(
		text,
	);
}

export function shouldRenderStreamingAssistantTextAsPlain(
	text: string,
): boolean {
	return text.length > PLAIN_STREAMING_TEXT_THRESHOLD;
}

export function shouldAnimateStreamingAssistantText(_text: string): boolean {
	return false;
}

const AssistantText = memo(function AssistantText({
	text,
	streaming,
}: {
	text: string;
	streaming: boolean;
}) {
	const mode: StreamdownMode = streaming ? "streaming" : "static";
	const { settings } = useSettings();
	const deferredText = useDeferredValue(text);
	const renderedText = streaming ? deferredText : text;
	const renderPlainStreamingText =
		streaming && shouldRenderStreamingAssistantTextAsPlain(renderedText);
	const renderPlainText =
		renderPlainStreamingText || shouldRenderAssistantTextAsPlain(renderedText);
	const animated = false;

	return (
		<div
			className="conversation-markdown assistant-markdown-scale max-w-none select-text break-words text-foreground"
			style={{ fontSize: `${settings.fontSize}px` }}
		>
			{renderPlainText ? (
				<AssistantTextFallback text={renderedText} />
			) : (
				<Suspense fallback={<AssistantTextFallback text={renderedText} />}>
					<LazyStreamdown
						animated={animated}
						caret={undefined}
						className="conversation-streamdown"
						isAnimating={animated !== false}
						mode={mode}
					>
						{renderedText}
					</LazyStreamdown>
				</Suspense>
			)}
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
	streaming,
	streamingFooterStartTime,
}: {
	message: RenderedMessage;
	streaming: boolean;
	streamingFooterStartTime?: number;
}) {
	const parts = message.content as ExtendedMessagePart[];
	const { settings } = useSettings();

	return (
		<div
			data-message-id={message.id}
			data-message-role="assistant"
			className="group/assistant relative flex min-w-0 max-w-full flex-col gap-1"
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
			{streamingFooterStartTime !== undefined ? (
				<StreamingFooter startTime={streamingFooterStartTime} />
			) : null}
			{!streaming && message.status?.type === "incomplete" ? (
				<MessageStatusBadge reason={message.status.reason} />
			) : null}
		</div>
	);
}
