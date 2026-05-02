import { memo, type ReactNode, useEffect, useMemo } from "react";
import type {
	AgentProvider,
	ChangeRequestInfo,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { PathosProfiler } from "@/lib/dev-react-profiler";
import { cn } from "@/lib/utils";
import type { WorkspaceScriptType } from "@/lib/workspace-script-actions";
import { WorkspacePanelHeader } from "./header";
import { EmptyState, preloadStreamdown } from "./message-components";
import {
	ActiveThreadViewport,
	ConversationColdPlaceholder,
	type PresentedSessionPane,
} from "./thread-viewport";
import type { SessionCloseRequest } from "./use-confirm-session-close";

export {
	AssistantToolCall,
	agentChildrenBlockPropsEqual,
	assistantToolCallPropsEqual,
} from "./message-components";

type WorkspacePanelProps = {
	isShellResizing?: boolean;
	workspace: WorkspaceDetail | null;
	changeRequest?: ChangeRequestInfo | null;
	sessions: WorkspaceSessionSummary[];
	selectedSessionId: string | null;
	sessionDisplayProviders?: Record<string, AgentProvider>;
	sessionPanes: PresentedSessionPane[];
	loadingWorkspace?: boolean;
	loadingSession?: boolean;
	refreshingWorkspace?: boolean;
	refreshingSession?: boolean;
	sending?: boolean;
	sendingSessionIds?: Set<string>;
	interactionRequiredSessionIds?: Set<string>;
	onSelectSession?: (sessionId: string) => void;
	onPrefetchSession?: (sessionId: string) => void;
	onSessionsChanged?: () => void;
	onSessionRenamed?: (sessionId: string, title: string) => void;
	onWorkspaceChanged?: () => void;
	onRequestCloseSession?: (request: SessionCloseRequest) => void;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
	headerActions?: ReactNode;
	headerLeading?: ReactNode;
	newSessionShortcut?: string | null;
	missingScriptTypes?: WorkspaceScriptType[];
	onInitializeScript?: (scriptType: WorkspaceScriptType) => void;
	onRevertMessage?: (messageId: string) => void | Promise<void>;
	onSubmitEditedMessage?: (
		messageId: string,
		prompt: string,
	) => void | Promise<void>;
	onRedoAssistantMessage?: (
		userMessageId: string,
		prompt: string,
	) => void | Promise<void>;
};

function providerDisplayName(
	provider: AgentProvider | string | null | undefined,
) {
	if (provider === "codex") {
		return "OpenAI";
	}
	if (provider === "claude") {
		return "Anthropic";
	}
	return null;
}

export const WorkspacePanel = memo(function WorkspacePanel({
	isShellResizing = false,
	workspace,
	changeRequest = null,
	sessions,
	selectedSessionId,
	sessionDisplayProviders: _sessionDisplayProviders,
	sessionPanes,
	loadingWorkspace = false,
	loadingSession = false,
	refreshingWorkspace: _refreshingWorkspace = false,
	refreshingSession: _refreshingSession = false,
	sending: _sending = false,
	sendingSessionIds: _sendingSessionIds,
	interactionRequiredSessionIds: _interactionRequiredSessionIds,
	onSelectSession: _onSelectSession,
	onPrefetchSession: _onPrefetchSession,
	onSessionsChanged: _onSessionsChanged,
	onSessionRenamed: _onSessionRenamed,
	onWorkspaceChanged,
	onRequestCloseSession: _onRequestCloseSession,
	onCloneProject,
	onOpenProject,
	headerActions,
	headerLeading,
	newSessionShortcut: _newSessionShortcut,
	missingScriptTypes = [],
	onInitializeScript,
	onRevertMessage,
	onSubmitEditedMessage,
	onRedoAssistantMessage,
}: WorkspacePanelProps) {
	const selectedSession =
		sessions.find((session) => session.id === selectedSessionId) ?? null;
	const selectedProviderName = selectedSession
		? providerDisplayName(
				_sessionDisplayProviders?.[selectedSession.id] ??
					selectedSession.agentType,
			)
		: null;
	const activePane =
		sessionPanes.find((pane) => pane.presentationState === "presented") ??
		sessionPanes[0] ??
		null;
	const providerNameBySessionId = useMemo(
		() =>
			new Map(
				sessions.map((session) => [
					session.id,
					providerDisplayName(
						_sessionDisplayProviders?.[session.id] ?? session.agentType,
					),
				]),
			),
		[_sessionDisplayProviders, sessions],
	);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const idleCallbackId =
			"requestIdleCallback" in window
				? window.requestIdleCallback(() => preloadStreamdown(), {
						timeout: 1200,
					})
				: null;
		const timeoutId =
			idleCallbackId === null
				? window.setTimeout(() => preloadStreamdown(), 180)
				: null;

		return () => {
			if (idleCallbackId !== null && "cancelIdleCallback" in window) {
				window.cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
		};
	}, []);

	return (
		<PathosProfiler id="WorkspacePanel">
			<div
				data-focus-scope="chat"
				className="flex min-h-0 flex-1 flex-col bg-transparent"
			>
				<WorkspacePanelHeader
					workspace={workspace}
					changeRequest={changeRequest}
					headerActions={headerActions}
					headerLeading={headerLeading}
					onWorkspaceChanged={onWorkspaceChanged}
				/>

				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					{activePane?.hasLoaded ? (
						<div className="absolute inset-0">
							{sessionPanes.map((pane) => {
								const active = pane.presentationState === "presented";
								const paneSession =
									sessions.find((session) => session.id === pane.sessionId) ??
									null;
								return (
									<div
										key={pane.sessionId}
										aria-hidden={!active}
										className={cn(
											"absolute inset-0 flex min-h-0 flex-col",
											active
												? "visible z-10"
												: "pointer-events-none invisible z-0",
										)}
									>
										<ActiveThreadViewport
											isShellResizing={isShellResizing}
											hasSession={paneSession !== null}
											pane={pane}
											providerName={
												providerNameBySessionId.get(pane.sessionId) ?? null
											}
											onCloneProject={onCloneProject}
											workspaceLabel={
												workspace?.directoryName ?? workspace?.title ?? null
											}
											onOpenProject={onOpenProject}
											missingScriptTypes={active ? missingScriptTypes : []}
											onInitializeScript={
												active ? onInitializeScript : undefined
											}
											onRevertMessage={active ? onRevertMessage : undefined}
											onSubmitEditedMessage={
												active ? onSubmitEditedMessage : undefined
											}
											onRedoAssistantMessage={
												active ? onRedoAssistantMessage : undefined
											}
										/>
									</div>
								);
							})}
						</div>
					) : loadingWorkspace || loadingSession ? (
						<ConversationColdPlaceholder />
					) : (
						<div className="grid h-full w-full flex-1 place-items-center px-8">
							<EmptyState
								workspaceState={workspace?.state ?? null}
								hasSession={!!selectedSession}
								sessionCount={sessions.length}
								onCloneProject={onCloneProject}
								onOpenProject={onOpenProject}
								providerName={selectedProviderName}
								workspaceLabel={
									workspace?.directoryName ?? workspace?.title ?? null
								}
							/>
						</div>
					)}
				</div>
			</div>
		</PathosProfiler>
	);
});
