import { memo, type ReactNode, useEffect } from "react";
import type {
	AgentProvider,
	ChangeRequestInfo,
	WorkspaceDetail,
	WorkspaceSessionSummary,
} from "@/lib/api";
import { HelmorProfiler } from "@/lib/dev-react-profiler";
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
		<HelmorProfiler id="WorkspacePanel">
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
						<ActiveThreadViewport
							hasSession={!!selectedSession}
							pane={activePane}
							providerName={selectedProviderName}
							onCloneProject={onCloneProject}
							workspaceLabel={
								workspace?.directoryName ?? workspace?.title ?? null
							}
							onOpenProject={onOpenProject}
							missingScriptTypes={missingScriptTypes}
							onInitializeScript={onInitializeScript}
						/>
					) : loadingWorkspace || loadingSession ? (
						<ConversationColdPlaceholder />
					) : (
						<div className="flex min-h-full flex-1 items-center justify-center px-8">
							<EmptyState
								workspaceState={workspace?.state ?? null}
								hasSession={!!selectedSession}
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
		</HelmorProfiler>
	);
});
