import { useState } from "react";
import type {
	CommitButtonState,
	WorkspaceCommitButtonMode,
} from "@/features/commit/button";
import type { PullRequestInfo } from "@/lib/api";
import type { DiffOpenOptions } from "@/lib/editor-session";
import { cn } from "@/lib/utils";
import { useWorkspaceInspectorSidebar } from "./hooks/use-inspector";
import { useScriptStatus } from "./hooks/use-script-status";
import { useSetupAutoRun } from "./hooks/use-setup-auto-run";
import { HorizontalResizeHandle, InspectorTabsSection } from "./layout";
import type { ScriptStatus } from "./script-store";
import { ActionsSection } from "./sections/actions";
import { ChangesSection } from "./sections/changes";
import { OpenDevServerButton, RunTab } from "./sections/run";
import { SetupTab } from "./sections/setup";

type WorkspaceInspectorSidebarProps = {
	workspaceId?: string | null;
	repoId?: string | null;
	workspaceRootPath?: string | null;
	workspaceBranch?: string | null;
	workspaceTargetBranch?: string | null;
	workspaceRemote?: string | null;
	workspaceState?: string | null;
	editorMode: boolean;
	activeEditorPath?: string | null;
	onOpenEditorFile(path: string, options?: DiffOpenOptions): void;
	onOpenMockReview?: (path: string) => void;
	onCommitAction?: (mode: WorkspaceCommitButtonMode) => Promise<void>;
	currentSessionId?: string | null;
	onQueuePendingPromptForSession?: (request: {
		sessionId: string;
		prompt: string;
		modelId?: string | null;
		permissionMode?: string | null;
		forceQueue?: boolean;
	}) => void;
	commitButtonMode?: WorkspaceCommitButtonMode;
	commitButtonState?: CommitButtonState;
	prInfo?: PullRequestInfo | null;
	onOpenSettings?: () => void;
};

export function WorkspaceInspectorSidebar({
	workspaceId,
	workspaceRootPath,
	workspaceTargetBranch,
	workspaceRemote,
	workspaceState,
	repoId,
	editorMode,
	activeEditorPath,
	onOpenEditorFile,
	onCommitAction,
	currentSessionId,
	onQueuePendingPromptForSession,
	commitButtonMode,
	commitButtonState,
	prInfo,
	onOpenSettings,
}: WorkspaceInspectorSidebarProps) {
	const {
		actionsHeight,
		actionsRef,
		activeTab,
		changes,
		changesHeight,
		containerRef,
		flashingPaths,
		handleResizeStart,
		handleToggleTabs,
		isActionsResizing,
		isResizing,
		isTabsResizing,
		repoScripts,
		scriptsLoaded,
		setActiveTab,
		tabsOpen,
		tabsWrapperRef,
	} = useWorkspaceInspectorSidebar({
		workspaceRootPath,
		workspaceId: workspaceId ?? null,
		repoId: repoId ?? null,
	});

	// Fire setup auto-run / auto-complete at the sidebar level so it runs even
	// when the Setup tab isn't mounted (tabsOpen=false).
	useSetupAutoRun({
		repoId: repoId ?? null,
		workspaceId: workspaceId ?? null,
		workspaceState: workspaceState ?? null,
		setupScript: repoScripts?.setupScript ?? null,
		scriptsLoaded,
	});

	// Run-script state lifted to the sidebar so the tab header can render
	// the "Open dev server" shortcut. The button only appears while the
	// run script is actually running (a "resident" dev server). Once it's
	// visible it self-tunes: disabled "Open" until a URL is detected in
	// stdout, "Open:PORT" for a single URL, or a hover picker for 2+.
	const [runStatus, setRunStatus] = useState<ScriptStatus>("idle");
	const [runUrls, setRunUrls] = useState<string[]>([]);

	const runTabActions =
		runStatus === "running" ? <OpenDevServerButton urls={runUrls} /> : null;

	// Per-tab status for the small indicator rendered next to each tab label.
	// Subscribes at the sidebar level so the icons stay live even when the
	// tab body itself is collapsed / not mounted.
	const setupScriptState = useScriptStatus(
		workspaceId ?? null,
		"setup",
		!!repoScripts?.setupScript?.trim(),
	);
	const runScriptState = useScriptStatus(
		workspaceId ?? null,
		"run",
		!!repoScripts?.runScript?.trim(),
	);

	// Only allow hover-to-zoom when the active tab has real terminal output.
	// "idle" = script configured but never run; "no-script" = nothing to run.
	// In both cases the body is a placeholder (Run / Open-settings button)
	// that doesn't benefit from — and shouldn't trigger — the enlargement.
	const activeTabState =
		activeTab === "setup" ? setupScriptState : runScriptState;
	const canHoverExpand =
		activeTabState === "running" ||
		activeTabState === "success" ||
		activeTabState === "failure";

	const handleOpenSettings = onOpenSettings ?? (() => {});

	return (
		<div
			ref={containerRef}
			className={cn(
				"flex h-full min-h-0 flex-col bg-sidebar",
				isResizing && "select-none",
			)}
		>
			<ChangesSection
				bodyHeight={changesHeight}
				workspaceId={workspaceId ?? null}
				workspaceRootPath={workspaceRootPath ?? null}
				workspaceTargetBranch={workspaceTargetBranch ?? null}
				changes={changes}
				editorMode={editorMode}
				activeEditorPath={activeEditorPath}
				onOpenEditorFile={onOpenEditorFile}
				flashingPaths={flashingPaths}
				onCommitAction={onCommitAction}
				commitButtonMode={commitButtonMode}
				commitButtonState={commitButtonState}
				prInfo={prInfo ?? null}
			/>

			<HorizontalResizeHandle
				onMouseDown={handleResizeStart("actions")}
				isActive={isActionsResizing}
			/>

			<ActionsSection
				workspaceId={workspaceId ?? null}
				repoId={repoId ?? null}
				workspaceRemote={workspaceRemote ?? null}
				sectionRef={actionsRef}
				bodyHeight={actionsHeight}
				expanded={!tabsOpen}
				onCommitAction={onCommitAction}
				currentSessionId={currentSessionId ?? null}
				onQueuePendingPromptForSession={onQueuePendingPromptForSession}
				commitButtonMode={commitButtonMode}
				commitButtonState={commitButtonState}
				prInfo={prInfo ?? null}
			/>

			{tabsOpen && (
				<HorizontalResizeHandle
					onMouseDown={handleResizeStart("tabs")}
					isActive={isTabsResizing}
				/>
			)}

			<InspectorTabsSection
				wrapperRef={tabsWrapperRef}
				open={tabsOpen}
				onToggle={handleToggleTabs}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				tabActions={runTabActions}
				setupScriptState={setupScriptState}
				runScriptState={runScriptState}
				canHoverExpand={canHoverExpand}
			>
				<SetupTab
					repoId={repoId ?? null}
					workspaceId={workspaceId ?? null}
					setupScript={repoScripts?.setupScript ?? null}
					isActive={activeTab === "setup"}
					onOpenSettings={handleOpenSettings}
				/>
				<RunTab
					repoId={repoId ?? null}
					workspaceId={workspaceId ?? null}
					runScript={repoScripts?.runScript ?? null}
					isActive={activeTab === "run"}
					onOpenSettings={handleOpenSettings}
					onStatusChange={setRunStatus}
					onUrlsChange={setRunUrls}
				/>
			</InspectorTabsSection>
		</div>
	);
}
