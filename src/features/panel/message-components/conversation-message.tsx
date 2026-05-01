import { memo, useEffect } from "react";
import { recordMessageRender } from "@/lib/dev-render-debug";
import { ChatAssistantMessage } from "./assistant-message";
import type { RenderedMessage } from "./shared";
import { ChatSystemMessage } from "./system-message";
import { ChatUserMessage } from "./user-message";

function ConversationMessage({
	message,
	previousAssistantMessage,
	previousUserMessage,
	sessionId,
	onRevertMessage,
	onSubmitEditedMessage,
	onRedoAssistantMessage,
	itemIndex,
}: {
	message: RenderedMessage;
	previousAssistantMessage?: RenderedMessage | null;
	previousUserMessage?: RenderedMessage | null;
	sessionId: string;
	onRevertMessage?: (messageId: string) => void | Promise<void>;
	onSubmitEditedMessage?: (
		messageId: string,
		prompt: string,
	) => void | Promise<void>;
	onRedoAssistantMessage?: (
		userMessageId: string,
		prompt: string,
	) => void | Promise<void>;
	itemIndex: number;
}) {
	const messageKey = message.id ?? `${message.role}:${itemIndex}`;
	useEffect(() => {
		recordMessageRender(sessionId, messageKey);
	});

	const streaming = message.role === "assistant" && message.streaming === true;

	if (message.role === "user") {
		return (
			<ChatUserMessage
				message={message}
				onRevertMessage={onRevertMessage}
				onSubmitEditedMessage={onSubmitEditedMessage}
			/>
		);
	}

	if (message.role === "assistant") {
		return <ChatAssistantMessage message={message} streaming={streaming} />;
	}

	return (
		<ChatSystemMessage
			message={message}
			previousAssistantMessage={previousAssistantMessage}
			previousUserMessage={previousUserMessage}
			onRedoAssistantMessage={onRedoAssistantMessage}
		/>
	);
}

export const MemoConversationMessage = memo(
	ConversationMessage,
	(prev, next) => {
		return (
			prev.message === next.message &&
			prev.previousAssistantMessage === next.previousAssistantMessage &&
			prev.previousUserMessage === next.previousUserMessage &&
			prev.sessionId === next.sessionId &&
			prev.onRevertMessage === next.onRevertMessage &&
			prev.onSubmitEditedMessage === next.onSubmitEditedMessage &&
			prev.onRedoAssistantMessage === next.onRedoAssistantMessage &&
			prev.itemIndex === next.itemIndex
		);
	},
);
