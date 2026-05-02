import { $getRoot, type LexicalEditor } from "lexical";
import { ArrowUp, Map as MapIcon, Plus, Square, Zap } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModelIcon } from "@/components/model-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShimmerText } from "@/components/ui/shimmer-text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PendingDeferredTool } from "@/features/conversation/pending-deferred-tool";
import type { PendingElicitation } from "@/features/conversation/pending-elicitation";
import { humanizeBranch } from "@/features/navigation/shared";
import { normalizeShortcutEvent } from "@/features/shortcuts/format";
import type {
	AgentModelSection,
	CandidateDirectory,
	SlashCommandEntry,
} from "@/lib/api";
import type {
	ComposerCustomTag,
	ResolvedComposerInsertRequest,
} from "@/lib/composer-insert";
import { recordComposerRender } from "@/lib/dev-render-debug";
import { cn } from "@/lib/utils";
import { clampEffort } from "@/lib/workspace-helpers";
import { ComposerButton } from "./button";
import { ContextBar } from "./context-bar";
import { ContextUsageRing } from "./context-usage-ring";
import type {
	DeferredToolResponseHandler,
	DeferredToolResponseOptions,
} from "./deferred-tool";
import { DeferredToolPanel } from "./deferred-tool-panel";
import { clearPersistedDraft } from "./draft-storage";
import type { AddDirPickerEntry } from "./editor/add-dir/typeahead-plugin";
import { $extractComposerContent } from "./editor/utils";
import { $appendComposerInsertItems } from "./editor-ops";
import { ComposerEditorSurface } from "./editor-surface";
import type { ElicitationResponseHandler } from "./elicitation";
import { ElicitationPanel } from "./elicitation-panel";
import { FastModeLottieIcon } from "./fast-mode-lottie-icon";

const OPEN_SETTINGS_EVENT = "pathos:open-settings";
const EMPTY_RESTORE_IMAGES: string[] = [];
const EMPTY_RESTORE_FILES: string[] = [];
const EMPTY_RESTORE_CUSTOM_TAGS: ComposerCustomTag[] = [];
const EMPTY_PENDING_INSERT_REQUESTS: ResolvedComposerInsertRequest[] = [];

type WorkspaceComposerProps = {
	contextKey: string;
	onSubmit: (
		prompt: string,
		imagePaths: string[],
		filePaths: string[],
		customTags: ComposerCustomTag[],
		options?: {
			permissionModeOverride?: string;
			/** Submit with the opposite follow-up behavior (queue ↔ steer)
			 *  for this single message, leaving the persistent setting alone. */
			oppositeFollowUp?: boolean;
		},
	) => void;
	disabled?: boolean;
	submitDisabled?: boolean;
	onStop?: () => void;
	sending?: boolean;
	selectedModelId: string | null;
	modelSections: AgentModelSection[];
	modelsLoading?: boolean;
	onSelectModel: (modelId: string) => void;
	provider?: string;
	effortLevel: string;
	onSelectEffort: (level: string) => void;
	permissionMode: string;
	onChangePermissionMode: (mode: string) => void;
	fastMode?: boolean;
	showFastModePrelude?: boolean;
	onChangeFastMode?: (enabled: boolean) => void;
	sendError?: string | null;
	restoreDraft?: string | null;
	restoreImages?: string[];
	restoreFiles?: string[];
	restoreCustomTags?: ComposerCustomTag[];
	restoreNonce?: number;
	pendingInsertRequests?: ResolvedComposerInsertRequest[];
	onPendingInsertRequestsConsumed?: (ids: string[]) => void;
	slashCommands?: readonly SlashCommandEntry[];
	slashCommandsLoading?: boolean;
	slashCommandsError?: boolean;
	onRetrySlashCommands?: () => void;
	workspaceRootPath?: string | null;
	linkedDirectories?: readonly string[];
	onRemoveLinkedDirectory?: (path: string) => void;
	linkedDirectoriesDisabled?: boolean;
	/** Quick-pick workspace suggestions shown in the /add-dir popup. */
	addDirCandidates?: readonly CandidateDirectory[];
	/** Called when the user selects an entry from the /add-dir popup. */
	onPickAddDir?: (entry: AddDirPickerEntry) => void;
	pendingElicitation?: PendingElicitation | null;
	onElicitationResponse?: ElicitationResponseHandler;
	elicitationResponsePending?: boolean;
	pendingDeferredTool?: PendingDeferredTool | null;
	onDeferredToolResponse?: DeferredToolResponseHandler;
	hasPlanReview?: boolean;
	/** When true, the ring is always rendered next to the send button.
	 *  When false (the default), the ring auto-reveals only after usage
	 *  crosses the threshold defined inside the ring component. */
	alwaysShowContextUsage?: boolean;
	/** Pathos session id for the context-usage ring. */
	sessionId?: string | null;
	/** Provider's own session id (Claude Code UUID). Threaded into the
	 *  context-usage ring for its hover-triggered live fetch. */
	providerSessionId?: string | null;
	/** Agent provider for this session — gates the Claude-only rich fetch. */
	agentType?: "claude" | "codex" | null;
	focusShortcut?: string | null;
	togglePlanShortcut?: string | null;
	/** Hotkey that submits the current draft with the opposite follow-up
	 *  behavior (queue ↔ steer) for one message. */
	toggleFollowUpShortcut?: string | null;
	/** True when a composer attachment is visually joined to the top edge. */
	topAttached?: boolean;
};

const EMPTY_SLASH_COMMANDS: readonly SlashCommandEntry[] = [];
const EMPTY_LINKED_DIRECTORIES: readonly string[] = [];
const EMPTY_CANDIDATE_DIRECTORIES: readonly CandidateDirectory[] = [];
const noopPickAddDir = (_entry: AddDirPickerEntry) => {};
const noopDeferredToolResponse = (
	_deferred: PendingDeferredTool,
	_behavior: "allow" | "deny",
	_options?: DeferredToolResponseOptions,
) => {};
const noopElicitationResponse: ElicitationResponseHandler = () => {};

export const WorkspaceComposer = memo(function WorkspaceComposer({
	contextKey,
	onSubmit,
	disabled = false,
	submitDisabled = false,
	onStop,
	sending = false,
	selectedModelId,
	modelSections,
	modelsLoading = false,
	onSelectModel,
	provider: _provider = "claude",
	effortLevel,
	onSelectEffort,
	permissionMode,
	onChangePermissionMode,
	fastMode = false,
	showFastModePrelude = false,
	onChangeFastMode,
	sendError,
	restoreDraft,
	restoreImages = EMPTY_RESTORE_IMAGES,
	restoreFiles = EMPTY_RESTORE_FILES,
	restoreCustomTags = EMPTY_RESTORE_CUSTOM_TAGS,
	restoreNonce = 0,
	pendingInsertRequests = EMPTY_PENDING_INSERT_REQUESTS,
	onPendingInsertRequestsConsumed,
	slashCommands = EMPTY_SLASH_COMMANDS,
	slashCommandsLoading = false,
	slashCommandsError = false,
	onRetrySlashCommands,
	workspaceRootPath = null,
	linkedDirectories = EMPTY_LINKED_DIRECTORIES,
	onRemoveLinkedDirectory,
	linkedDirectoriesDisabled = false,
	addDirCandidates = EMPTY_CANDIDATE_DIRECTORIES,
	onPickAddDir = noopPickAddDir,
	pendingElicitation = null,
	onElicitationResponse = noopElicitationResponse,
	elicitationResponsePending = false,
	pendingDeferredTool = null,
	onDeferredToolResponse = noopDeferredToolResponse,
	hasPlanReview = false,
	alwaysShowContextUsage = false,
	sessionId = null,
	providerSessionId = null,
	agentType = null,
	focusShortcut = null,
	togglePlanShortcut = null,
	toggleFollowUpShortcut = null,
	topAttached = false,
}: WorkspaceComposerProps) {
	const instanceIdRef = useRef(
		`composer-${Math.random().toString(36).slice(2, 10)}`,
	);
	useEffect(() => {
		recordComposerRender(contextKey, instanceIdRef.current);
	});
	const editorRef = useRef<LexicalEditor | null>(null);
	// Root element of the composer surface. Used as the portal anchor for the
	// slash/@ typeahead popups so they hug the top edge of the composer box
	// (with an 8px gap) instead of the caret tracking div Lexical creates on
	// `document.body` — the tracking div follows the caret, which sits *inside*
	// the composer padding and would put the popup's bottom edge underneath the
	// composer rim.
	const composerRootRef = useRef<HTMLDivElement | null>(null);
	const consumedInsertRequestIdsRef = useRef<Set<string>>(new Set());
	const [hasContent, setHasContent] = useState(false);
	const [isInputFocused, setIsInputFocused] = useState(false);
	const [effortPickerOpen, setEffortPickerOpen] = useState(false);
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [toolbarTooltipSuppressed, setToolbarTooltipSuppressed] =
		useState(false);
	const selectedModel = useMemo(() => {
		for (const section of modelSections) {
			for (const option of section.options) {
				if (option.id === selectedModelId) return option;
			}
		}
		return null;
	}, [modelSections, selectedModelId]);
	const hasConfiguredClaudeProviderModels = useMemo(
		() =>
			modelSections.some(
				(section) =>
					section.id === "claude" &&
					section.options.some((option) => Boolean(option.providerKey)),
			),
		[modelSections],
	);
	const availableEffortLevels = useMemo(
		() => selectedModel?.effortLevels ?? [],
		[selectedModel],
	);
	const supportsEffort = availableEffortLevels.length > 0;
	const supportsFastMode = selectedModel?.supportsFastMode === true;
	const supportsContextUsage = selectedModel?.supportsContextUsage !== false;
	const effectiveEffort = useMemo(
		() => clampEffort(effortLevel, availableEffortLevels),
		[effortLevel, availableEffortLevels],
	);
	// When model changes and effort gets clamped, write it back — but only
	// after model metadata has loaded and the model exposes effort levels,
	// otherwise we'd loop on a value the user can't even change.
	useEffect(() => {
		if (!selectedModel) return;
		if (!supportsEffort) return;
		if (effectiveEffort !== effortLevel) {
			onSelectEffort(effectiveEffort);
		}
	}, [
		selectedModel,
		supportsEffort,
		effectiveEffort,
		effortLevel,
		onSelectEffort,
	]);
	const hasPendingElicitation = pendingElicitation !== null;
	const hasPendingDeferredTool = pendingDeferredTool !== null;
	const hasPendingInteraction = hasPendingElicitation || hasPendingDeferredTool;
	const inputDisabled = disabled || hasPendingInteraction;
	const toolbarDisabled = disabled || hasPendingInteraction;
	useEffect(() => {
		const handleOpenModelPicker = () => {
			if (toolbarDisabled) return;
			setModelPickerOpen(true);
		};
		window.addEventListener("pathos:open-model-picker", handleOpenModelPicker);
		return () =>
			window.removeEventListener(
				"pathos:open-model-picker",
				handleOpenModelPicker,
			);
	}, [toolbarDisabled]);
	const handleOpenModelSettings = useCallback(() => {
		setToolbarTooltipSuppressed(true);
		setModelPickerOpen(false);
		window.dispatchEvent(
			new CustomEvent(OPEN_SETTINGS_EVENT, {
				detail: { section: "model" },
			}),
		);
	}, []);
	const handleToolbarTriggerPointerDown = useCallback(() => {
		setToolbarTooltipSuppressed(true);
	}, []);
	const handleToolbarPointerMove = useCallback(() => {
		if (effortPickerOpen || modelPickerOpen) return;
		setToolbarTooltipSuppressed(false);
	}, [effortPickerOpen, modelPickerOpen]);
	const handleEffortPickerOpenChange = useCallback((open: boolean) => {
		setToolbarTooltipSuppressed(true);
		setEffortPickerOpen(open);
	}, []);
	const handleModelPickerOpenChange = useCallback((open: boolean) => {
		setToolbarTooltipSuppressed(true);
		setModelPickerOpen(open);
	}, []);
	const handleSelectEffortOption = useCallback(
		(level: string) => {
			setToolbarTooltipSuppressed(true);
			onSelectEffort(level);
		},
		[onSelectEffort],
	);
	const handleSelectModelOption = useCallback(
		(modelId: string) => {
			setToolbarTooltipSuppressed(true);
			onSelectModel(modelId);
		},
		[onSelectModel],
	);
	const composerToolbarTriggerClassName =
		"cursor-pointer rounded-[9px] px-1 py-0.5 text-[13px] font-medium transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-0";
	// Shared gate for Send and Steer — the only difference is whether a
	// stream is currently running. When sending, ⌘Enter / Enter still
	// fires `handleSubmit`; the use-streaming hook dispatches to the
	// steer path based on `sendingContextKeys`.
	const submitEnabled =
		!disabled &&
		!submitDisabled &&
		!hasPendingInteraction &&
		Boolean(selectedModel) &&
		hasContent;
	const sendDisabled = !submitEnabled || sending;
	const steerDisabled = !submitEnabled || !sending;
	const submitDisabledForPlugin = !submitEnabled;
	const showFocusHint =
		!isInputFocused && !hasContent && !inputDisabled && Boolean(focusShortcut);

	useEffect(() => {
		const pendingIds = new Set(
			pendingInsertRequests.map((request) => request.id),
		);
		for (const id of consumedInsertRequestIdsRef.current) {
			if (!pendingIds.has(id)) {
				consumedInsertRequestIdsRef.current.delete(id);
			}
		}

		const unconsumed = pendingInsertRequests.filter(
			(request) => !consumedInsertRequestIdsRef.current.has(request.id),
		);
		if (unconsumed.length === 0) {
			return;
		}

		const editor = editorRef.current;
		if (!editor) {
			return;
		}

		const consumedIds: string[] = [];
		editor.update(() => {
			for (const request of unconsumed) {
				$appendComposerInsertItems(request.items);
				consumedInsertRequestIdsRef.current.add(request.id);
				consumedIds.push(request.id);
			}
		});

		if (consumedIds.length > 0) {
			onPendingInsertRequestsConsumed?.(consumedIds);
		}
	}, [onPendingInsertRequestsConsumed, pendingInsertRequests]);

	const handlePlanImplement = useCallback(() => {
		if (!hasPlanReview) return;
		onChangePermissionMode("bypassPermissions");
		clearPersistedDraft(contextKey);
		onSubmit("Go ahead with the plan.", [], [], [], {
			permissionModeOverride: "bypassPermissions",
		});
	}, [contextKey, hasPlanReview, onChangePermissionMode, onSubmit]);

	const handlePlanRequestChanges = useCallback(() => {
		if (!hasPlanReview) return;
		const editor = editorRef.current;
		let feedback = "";
		if (editor) {
			editor.read(() => {
				feedback = $extractComposerContent().text;
			});
		}
		if (!feedback.trim()) return;
		onSubmit(feedback.trim(), [], [], [], {
			permissionModeOverride: "plan",
		});
		if (editor) {
			editor.update(() => {
				$getRoot().clear();
			});
			clearPersistedDraft(contextKey);
			setHasContent(false);
		}
	}, [hasPlanReview, onSubmit, contextKey]);

	const submitDraft = useCallback(
		(options?: { oppositeFollowUp?: boolean }) => {
			const editor = editorRef.current;
			if (!editor) return;
			let prompt = "";
			let images: string[] = [];
			let files: string[] = [];
			let customTags: ComposerCustomTag[] = [];
			editor.read(() => {
				const result = $extractComposerContent();
				prompt = result.text;
				images = result.images;
				files = result.files;
				customTags = result.customTags;
			});
			if (
				!prompt &&
				images.length === 0 &&
				files.length === 0 &&
				customTags.length === 0
			)
				return;
			if (options?.oppositeFollowUp) {
				onSubmit(prompt, images, files, customTags, {
					oppositeFollowUp: true,
				});
			} else {
				onSubmit(prompt, images, files, customTags);
			}
			editor.update(() => {
				$getRoot().clear();
			});
			clearPersistedDraft(contextKey);
			setHasContent(false);
		},
		[onSubmit, contextKey],
	);

	const handleSubmit = useCallback(() => {
		submitDraft();
	}, [submitDraft]);

	const handleSubmitOpposite = useCallback(() => {
		submitDraft({ oppositeFollowUp: true });
	}, [submitDraft]);

	const handleComposerKeyDownCapture = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (inputDisabled) return;
			const hotkey = normalizeShortcutEvent(event.nativeEvent);
			if (!hotkey) return;

			// Toggle follow-up behavior for one message. Skip when the
			// hotkey is Enter-based — SubmitPlugin handles those via
			// Lexical's KEY_ENTER_COMMAND so we don't double-fire.
			if (
				toggleFollowUpShortcut &&
				hotkey === toggleFollowUpShortcut &&
				event.nativeEvent.key !== "Enter"
			) {
				event.preventDefault();
				event.stopPropagation();
				if (submitEnabled) handleSubmitOpposite();
				return;
			}

			if (togglePlanShortcut && hotkey === togglePlanShortcut) {
				event.preventDefault();
				event.stopPropagation();
				onChangePermissionMode(permissionMode === "plan" ? "default" : "plan");
			}
		},
		[
			inputDisabled,
			onChangePermissionMode,
			permissionMode,
			togglePlanShortcut,
			toggleFollowUpShortcut,
			handleSubmitOpposite,
			submitEnabled,
		],
	);

	return (
		<div
			ref={composerRootRef}
			aria-label="Workspace composer"
			data-focus-scope="composer"
			onKeyDownCapture={handleComposerKeyDownCapture}
			className={cn(
				"relative flex flex-col border border-border/40 bg-sidebar shadow-[0_-1px_8px_rgba(0,0,0,0.05),0_0_0_1px_rgba(255,255,255,0.02)]",
				topAttached ? "rounded-b-2xl" : "rounded-2xl",
				// Pending-interaction panels fill the shell edge-to-edge and own
				// their own internal padding; the default composer gets the
				// legacy px-4 pt-3 pb-3 breathing room.
				hasPendingInteraction ? "p-0" : "px-4 pb-3 pt-3",
				inputDisabled &&
					!hasPendingInteraction &&
					"cursor-not-allowed opacity-60",
			)}
		>
			<label htmlFor="workspace-input" className="sr-only">
				Workspace input
			</label>

			{hasPendingElicitation ? (
				<ElicitationPanel
					elicitation={pendingElicitation!}
					disabled={disabled || elicitationResponsePending}
					onResponse={onElicitationResponse}
				/>
			) : hasPendingDeferredTool ? (
				<DeferredToolPanel
					deferred={pendingDeferredTool!}
					disabled={disabled}
					onResponse={onDeferredToolResponse}
				/>
			) : (
				<>
					{onRemoveLinkedDirectory ? (
						<ContextBar
							directories={linkedDirectories.map((path) => {
								const match = addDirCandidates.find(
									(c) => c.absolutePath === path,
								);
								// Display name follows the sidebar's rule
								// (`row-item.tsx`): if the workspace has a branch,
								// show the humanized last segment of the branch
								// (`natllian/refactor-messages` → `Refactor
								// Messages`). Otherwise fall back to the workspace
								// title. For Browse-picked arbitrary paths the
								// match is absent and ContextBar falls back to the
								// basename of `path`.
								const name = match?.branch
									? humanizeBranch(match.branch)
									: match?.title;
								return {
									path,
									name,
									branch: match?.branch ?? null,
									repoIconSrc: match?.repoIconSrc ?? null,
									repoInitials: match?.repoInitials ?? null,
									repoName: match?.repoName ?? null,
								};
							})}
							onRemove={onRemoveLinkedDirectory}
							disabled={linkedDirectoriesDisabled}
						/>
					) : null}
					<ComposerEditorSurface
						composerRootRef={composerRootRef}
						editorRef={editorRef}
						disabled={disabled}
						inputDisabled={inputDisabled}
						hasPlanReview={hasPlanReview}
						permissionMode={permissionMode}
						showFocusHint={showFocusHint}
						focusShortcut={focusShortcut}
						slashCommands={slashCommands}
						slashCommandsLoading={slashCommandsLoading}
						slashCommandsError={slashCommandsError}
						onRetrySlashCommands={onRetrySlashCommands}
						workspaceRootPath={workspaceRootPath}
						linkedDirectories={linkedDirectories}
						addDirCandidates={addDirCandidates}
						onPickAddDir={onPickAddDir}
						onSubmit={handleSubmit}
						onSubmitOpposite={handleSubmitOpposite}
						toggleFollowUpShortcut={toggleFollowUpShortcut}
						submitDisabledForPlugin={submitDisabledForPlugin}
						contextKey={contextKey}
						restoreDraft={restoreDraft}
						restoreImages={restoreImages}
						restoreFiles={restoreFiles}
						restoreCustomTags={restoreCustomTags}
						restoreNonce={restoreNonce}
						onHasContentChange={setHasContent}
						onInputFocusChange={setIsInputFocused}
					/>

					{sendError ? (
						<div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
							{sendError}
						</div>
					) : null}

					<div className="mt-2.5 flex items-end justify-between gap-3">
						<div
							className="flex flex-wrap items-center gap-2"
							onPointerMove={handleToolbarPointerMove}
						>
							{modelsLoading ? (
								<ShimmerText className="px-1 py-0.5 text-[13px] text-muted-foreground">
									Loading models…
								</ShimmerText>
							) : (
								<>
									<DropdownMenu
										open={modelPickerOpen}
										onOpenChange={handleModelPickerOpenChange}
									>
										<Tooltip
											open={
												modelPickerOpen || toolbarTooltipSuppressed
													? false
													: undefined
											}
										>
											<TooltipTrigger asChild>
												<DropdownMenuTrigger
													disabled={toolbarDisabled}
													onPointerDown={handleToolbarTriggerPointerDown}
													className={cn(
														`flex items-center gap-1.5 text-muted-foreground ${composerToolbarTriggerClassName}`,
														toolbarDisabled &&
															"cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground",
													)}
												>
													<ModelIcon
														model={selectedModel}
														className="size-[16px]"
													/>
													<span>
														{selectedModel?.label ??
															selectedModelId ??
															"Select model"}
													</span>
												</DropdownMenuTrigger>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<span>Change model</span>
											</TooltipContent>
										</Tooltip>

										<DropdownMenuContent
											side="top"
											align="start"
											sideOffset={4}
											className="min-w-[13rem]"
										>
											<DropdownMenuLabel>Provider</DropdownMenuLabel>
											{modelSections.map((section) => (
												<DropdownMenuSub key={section.id}>
													<DropdownMenuSubTrigger
														disabled={
															toolbarDisabled || section.options.length === 0
														}
														className="gap-3"
													>
														<span className="flex size-4 items-center justify-center text-muted-foreground">
															<ModelIcon
																model={section.options[0] ?? null}
																className="size-4"
															/>
														</span>
														<span className="min-w-0 truncate">
															{section.label}
														</span>
													</DropdownMenuSubTrigger>
													<DropdownMenuSubContent
														alignOffset={-24}
														collisionPadding={12}
														sideOffset={6}
														className="mb-3 min-w-[17rem]"
													>
														<DropdownMenuLabel>
															{section.label}
														</DropdownMenuLabel>
														<DropdownMenuGroup>
															{section.options.map((option) => (
																<DropdownMenuItem
																	key={option.id}
																	disabled={toolbarDisabled}
																	onClick={() => {
																		handleSelectModelOption(option.id);
																	}}
																	className="flex items-center justify-between gap-3"
																>
																	<div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-3">
																		<span className="flex size-4 items-center justify-center text-muted-foreground">
																			<ModelIcon
																				model={option}
																				className="size-4"
																			/>
																		</span>
																		<span className="truncate font-mono tabular-nums">
																			{option.label}
																		</span>
																	</div>
																</DropdownMenuItem>
															))}
															{section.id === "claude" &&
															!hasConfiguredClaudeProviderModels ? (
																<>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		onClick={handleOpenModelSettings}
																		className="flex items-center gap-3"
																	>
																		<span className="flex size-4 items-center justify-center text-muted-foreground">
																			<Plus
																				className="size-4"
																				strokeWidth={1.8}
																			/>
																		</span>
																		<span className="font-mono tabular-nums">
																			Add custom model...
																		</span>
																	</DropdownMenuItem>
																</>
															) : null}
														</DropdownMenuGroup>
													</DropdownMenuSubContent>
												</DropdownMenuSub>
											))}
										</DropdownMenuContent>
									</DropdownMenu>

									{onChangeFastMode && supportsFastMode && (
										<Tooltip
											open={toolbarTooltipSuppressed ? false : undefined}
										>
											<TooltipTrigger asChild>
												<ComposerButton
													aria-label="Fast mode"
													disabled={toolbarDisabled}
													onPointerDown={handleToolbarTriggerPointerDown}
													className={cn(
														`relative gap-1 px-1.5 text-[11px] ${composerToolbarTriggerClassName}`,
														fastMode
															? "text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
															: "text-muted-foreground",
														toolbarDisabled
															? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground"
															: null,
													)}
													onClick={() => onChangeFastMode(!fastMode)}
												>
													<span className="relative block size-[16px]">
														<Zap
															className={cn(
																"absolute inset-0 z-0 size-[16px]",
																fastMode ? null : "opacity-55",
															)}
															strokeWidth={1.8}
														/>
														{showFastModePrelude ? (
															<FastModeLottieIcon className="absolute inset-[-5px] z-10 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
														) : null}
													</span>
													{fastMode ? <span>Fast</span> : null}
												</ComposerButton>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<span>Fast mode{fastMode ? " (on)" : ""}</span>
											</TooltipContent>
										</Tooltip>
									)}

									{supportsEffort && (
										<DropdownMenu
											open={effortPickerOpen}
											onOpenChange={handleEffortPickerOpenChange}
										>
											<Tooltip
												open={
													effortPickerOpen || toolbarTooltipSuppressed
														? false
														: undefined
												}
											>
												<TooltipTrigger asChild>
													<DropdownMenuTrigger
														disabled={toolbarDisabled}
														onPointerDown={handleToolbarTriggerPointerDown}
														aria-label={`Reasoning effort: ${
															effectiveEffort === "xhigh"
																? "Extra High"
																: effectiveEffort
														}`}
														className={cn(
															`flex items-center ${composerToolbarTriggerClassName}`,
															effectiveEffort === "max" ||
																effectiveEffort === "xhigh"
																? "effort-max-text"
																: "text-muted-foreground",
															toolbarDisabled
																? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground"
																: null,
														)}
													>
														<EffortBarsIcon
															index={availableEffortLevels.indexOf(
																effectiveEffort,
															)}
															total={availableEffortLevels.length}
														/>
													</DropdownMenuTrigger>
												</TooltipTrigger>
												<TooltipContent side="top" sideOffset={4}>
													<span>
														Reasoning effort:{" "}
														<span className="capitalize">
															{effectiveEffort === "xhigh"
																? "Extra High"
																: effectiveEffort}
														</span>
													</span>
												</TooltipContent>
											</Tooltip>
											<DropdownMenuContent
												side="top"
												align="start"
												sideOffset={4}
												className="min-w-[11rem]"
											>
												<DropdownMenuGroup>
													<DropdownMenuLabel>Effort</DropdownMenuLabel>
													{availableEffortLevels.map((level, index) => (
														<DropdownMenuItem
															key={level}
															disabled={toolbarDisabled}
															onClick={() => handleSelectEffortOption(level)}
															className={cn(
																"flex items-center gap-2.5 focus:bg-accent/25",
																level === effectiveEffort &&
																	"bg-foreground/[0.04]",
															)}
														>
															<EffortBarsIcon
																index={index}
																total={availableEffortLevels.length}
															/>
															<span className="capitalize">
																{level === "xhigh" ? "Extra High" : level}
															</span>
														</DropdownMenuItem>
													))}
												</DropdownMenuGroup>
											</DropdownMenuContent>
										</DropdownMenu>
									)}

									<Tooltip open={toolbarTooltipSuppressed ? false : undefined}>
										<TooltipTrigger asChild>
											<ComposerButton
												aria-label="Plan mode"
												disabled={toolbarDisabled}
												onPointerDown={handleToolbarTriggerPointerDown}
												className={cn(
													`gap-1 px-1.5 text-[11px] ${composerToolbarTriggerClassName}`,
													permissionMode === "plan"
														? "text-emerald-500 hover:text-emerald-500"
														: "text-muted-foreground/70 hover:text-muted-foreground/70",
												)}
												onClick={() =>
													onChangePermissionMode(
														permissionMode === "plan"
															? "bypassPermissions"
															: "plan",
													)
												}
											>
												<MapIcon className="size-[16px]" strokeWidth={1.8} />
												{permissionMode === "plan" ? <span>Plan</span> : null}
											</ComposerButton>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={4}>
											<span>
												Plan mode{permissionMode === "plan" ? " (on)" : ""}
											</span>
										</TooltipContent>
									</Tooltip>
								</>
							)}
						</div>

						<div className="flex items-center gap-1">
							{sessionId && supportsContextUsage ? (
								<ContextUsageRing
									sessionId={sessionId}
									providerSessionId={providerSessionId}
									composerModelId={selectedModel?.id ?? null}
									cwd={workspaceRootPath}
									agentType={agentType}
									alwaysShow={alwaysShowContextUsage}
									disabled={disabled}
								/>
							) : null}
							{/* Trailing actions sit behind a visible outline/border, while the
							    indicators to the left don't — that pulls the perceived gap in
							    by ~6 px. ml-1.5 reserves the missing space so the row reads as
							    evenly spaced. */}
							{hasPlanReview && permissionMode === "plan" ? (
								<div className="ml-1.5 flex items-center gap-2">
									{hasContent ? (
										<Button
											variant="ghost"
											size="sm"
											aria-label="Request Changes"
											onClick={handlePlanRequestChanges}
											disabled={disabled}
											className="my-0.5 h-7 cursor-pointer rounded-lg px-2 text-[12px] transition-none text-muted-foreground hover:text-foreground"
										>
											Request Changes
										</Button>
									) : null}
									<Button
										variant="default"
										size="sm"
										aria-label="Implement"
										onClick={handlePlanImplement}
										disabled={disabled}
										className="my-0.5 h-7 cursor-pointer rounded-lg px-2 text-[12px] transition-none"
									>
										Implement
									</Button>
								</div>
							) : sending ? (
								<div className="ml-1.5 flex items-center">
									{hasContent ? (
										<Button
											variant="destructive"
											size="icon"
											aria-label="Send"
											onClick={handleSubmit}
											disabled={steerDisabled}
											className="rounded-[9px]"
										>
											<ArrowUp className="size-[15px]" strokeWidth={2.2} />
										</Button>
									) : (
										<Button
											variant="destructive"
											size="icon"
											aria-label="Stop"
											onClick={onStop}
											disabled={disabled || submitDisabled}
											className="rounded-[9px]"
										>
											<Square className="size-3 fill-current" strokeWidth={0} />
										</Button>
									)}
								</div>
							) : (
								<Button
									variant="outline"
									size="icon"
									aria-label="Send"
									onClick={handleSubmit}
									disabled={sendDisabled}
									className="ml-1.5 rounded-[9px]"
								>
									<ArrowUp className="size-[15px]" strokeWidth={2.2} />
								</Button>
							)}
						</div>
					</div>
				</>
			)}

			{sendError && hasPendingElicitation ? (
				<div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
					{sendError}
				</div>
			) : null}
		</div>
	);
});

function EffortBarsIcon({ index, total }: { index: number; total: number }) {
	const bars = Math.max(total, 1);
	const barWidth = 2;
	const gap = 1.5;
	const totalWidth = bars * barWidth + (bars - 1) * gap;
	const startX = (16 - totalWidth) / 2;
	const baseY = 13;
	const minHeight = 3;
	const maxHeight = 10;
	const heightStep = bars > 1 ? (maxHeight - minHeight) / (bars - 1) : 0;

	return (
		<svg
			viewBox="0 0 16 16"
			className="size-[20px] shrink-0"
			fill="currentColor"
			aria-hidden="true"
		>
			{Array.from({ length: bars }, (_, i) => {
				const height = minHeight + i * heightStep;
				const x = startX + i * (barWidth + gap);
				const lit = i <= index;
				return (
					<rect
						key={`bar-${i}`}
						x={x}
						y={baseY - height}
						width={barWidth}
						height={height}
						rx="0.5"
						opacity={lit ? 1 : 0.25}
					/>
				);
			})}
		</svg>
	);
}
