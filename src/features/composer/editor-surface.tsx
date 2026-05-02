import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
	$getRoot,
	$isElementNode,
	$isTextNode,
	type LexicalEditor,
} from "lexical";
import { type MutableRefObject, memo, useEffect, useRef } from "react";
import { ShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { CandidateDirectory, SlashCommandEntry } from "@/lib/api";
import type { ComposerCustomTag } from "@/lib/composer-insert";
import { cn } from "@/lib/utils";
import { $insertAddDirTrigger } from "./editor/add-dir/insert";
import { AddDirTriggerNode } from "./editor/add-dir/trigger-node";
import {
	type AddDirPickerEntry,
	AddDirTypeaheadPlugin,
} from "./editor/add-dir/typeahead-plugin";
import { CustomTagBadgeNode } from "./editor/custom-tag-badge-node";
import { FileBadgeNode } from "./editor/file-badge-node";
import { ImageBadgeNode } from "./editor/image-badge-node";
import { AutoResizePlugin } from "./editor/plugins/auto-resize-plugin";
import { CompositionGuardPlugin } from "./editor/plugins/composition-guard-plugin";
import { DraftPersistencePlugin } from "./editor/plugins/draft-persistence-plugin";
import { DropFilePlugin } from "./editor/plugins/drop-file-plugin";
import { EditablePlugin } from "./editor/plugins/editable-plugin";
import { EditorRefPlugin } from "./editor/plugins/editor-ref-plugin";
import { FileMentionPlugin } from "./editor/plugins/file-mention-plugin";
import { HasContentPlugin } from "./editor/plugins/has-content-plugin";
import { PasteImagePlugin } from "./editor/plugins/paste-image-plugin";
import { SlashCommandPlugin } from "./editor/plugins/slash-command-plugin";
import { SubmitPlugin } from "./editor/plugins/submit-plugin";

const COMPOSER_INPUT_MIN_HEIGHT = 32;
const COMPOSER_INPUT_MAX_HEIGHT = 120;

const EDITOR_THEME = {
	root: "composer-editor",
	paragraph: "composer-paragraph",
};

function onEditorError(error: Error) {
	console.error("[Composer Lexical]", error);
}

function getLastTextNode(rootElement: HTMLElement): Text | null {
	const nodeFilter = rootElement.ownerDocument.defaultView?.NodeFilter;
	if (!nodeFilter) return null;
	const walker = rootElement.ownerDocument.createTreeWalker(
		rootElement,
		nodeFilter.SHOW_TEXT,
	);
	let lastText: Text | null = null;
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (node.textContent) {
			lastText = node as Text;
		}
	}
	return lastText;
}

function focusRootElementAtEnd(rootElement: HTMLElement) {
	rootElement.focus({ preventScroll: true });
	const lastText = getLastTextNode(rootElement);
	if (!lastText) return;
	const selection = rootElement.ownerDocument.defaultView?.getSelection();
	if (!selection) return;
	const offset = lastText.textContent?.length ?? 0;
	const range = rootElement.ownerDocument.createRange();
	range.setStart(lastText, offset);
	range.setEnd(lastText, offset);
	selection.removeAllRanges();
	selection.addRange(range);
}

type ComposerEditorSurfaceProps = {
	composerRootRef: MutableRefObject<HTMLDivElement | null>;
	editorRef: MutableRefObject<LexicalEditor | null>;
	disabled: boolean;
	inputDisabled: boolean;
	hasPlanReview: boolean;
	permissionMode: string;
	showFocusHint: boolean;
	focusShortcut?: string | null;
	slashCommands: readonly SlashCommandEntry[];
	slashCommandsLoading: boolean;
	slashCommandsError: boolean;
	onRetrySlashCommands?: () => void;
	workspaceRootPath: string | null;
	linkedDirectories: readonly string[];
	addDirCandidates: readonly CandidateDirectory[];
	onPickAddDir: (entry: AddDirPickerEntry) => void;
	onSubmit: () => void;
	onSubmitOpposite: () => void;
	toggleFollowUpShortcut?: string | null;
	submitDisabledForPlugin: boolean;
	contextKey: string;
	restoreDraft?: string | null;
	restoreImages: string[];
	restoreFiles: string[];
	restoreCustomTags: ComposerCustomTag[];
	restoreNonce: number;
	onHasContentChange: (hasContent: boolean) => void;
	onInputFocusChange: (focused: boolean) => void;
};

// Keep the Lexical tree behind its own memo boundary so toolbar-only state
// changes in WorkspaceComposer do not re-render editor plugins.
export const ComposerEditorSurface = memo(function ComposerEditorSurface({
	composerRootRef,
	editorRef,
	disabled,
	inputDisabled,
	hasPlanReview,
	permissionMode,
	showFocusHint,
	focusShortcut,
	slashCommands,
	slashCommandsLoading,
	slashCommandsError,
	onRetrySlashCommands,
	workspaceRootPath,
	linkedDirectories,
	addDirCandidates,
	onPickAddDir,
	onSubmit,
	onSubmitOpposite,
	toggleFollowUpShortcut,
	submitDisabledForPlugin,
	contextKey,
	restoreDraft,
	restoreImages,
	restoreFiles,
	restoreCustomTags,
	restoreNonce,
	onHasContentChange,
	onInputFocusChange,
}: ComposerEditorSurfaceProps) {
	const initialConfig = useRef({
		namespace: "WorkspaceComposer",
		theme: EDITOR_THEME,
		nodes: [
			ImageBadgeNode,
			FileBadgeNode,
			CustomTagBadgeNode,
			AddDirTriggerNode,
		],
		onError: onEditorError,
	}).current;

	useEffect(() => {
		const handleFocusComposer = () => {
			if (disabled) return;
			const editor = editorRef.current;
			if (editor) {
				editor.update(
					() => {
						const root = $getRoot();
						const lastText = root.getLastDescendant();
						if ($isTextNode(lastText)) {
							const offset = lastText.getTextContentSize();
							lastText.select(offset, offset);
							return;
						}
						const lastChild = root.getLastChild();
						if ($isElementNode(lastChild)) {
							lastChild.selectEnd();
							return;
						}
						root.selectEnd();
					},
					{
						onUpdate: () => {
							const rootElement = editor.getRootElement();
							if (rootElement) focusRootElementAtEnd(rootElement);
						},
					},
				);
				return;
			}
			composerRootRef.current
				?.querySelector<HTMLElement>("[contenteditable='true']")
				?.focus();
		};

		window.addEventListener("pathos:focus-composer", handleFocusComposer);
		return () =>
			window.removeEventListener("pathos:focus-composer", handleFocusComposer);
	}, [composerRootRef, disabled, editorRef]);

	return (
		<LexicalComposer initialConfig={initialConfig}>
			<div
				className="relative"
				onFocusCapture={() => onInputFocusChange(true)}
				onBlurCapture={(event) => {
					if (
						event.currentTarget.contains(event.relatedTarget as Node | null)
					) {
						return;
					}
					onInputFocusChange(false);
				}}
			>
				<PlainTextPlugin
					contentEditable={
						<ContentEditable
							id="workspace-input"
							aria-label="Workspace input"
							aria-multiline
							className={cn(
								"composer-editor min-h-[32px] max-h-[120px] resize-none overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[14px] leading-5 tracking-[-0.01em] text-foreground outline-none",
								showFocusHint && "pr-14",
							)}
						/>
					}
					placeholder={
						<div className="pointer-events-none absolute left-0 top-0 text-[14px] leading-5 tracking-[-0.01em] text-muted-foreground/70">
							{hasPlanReview && permissionMode === "plan"
								? "Describe what to change, then click Request Changes"
								: "Ask to make changes, @mention files, run /commands"}
						</div>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				{showFocusHint && focusShortcut ? (
					<div className="pointer-events-none absolute right-0 top-0 hidden h-5 items-center sm:flex">
						<ShortcutDisplay hotkey={focusShortcut} />
					</div>
				) : null}
			</div>
			<HistoryPlugin />
			<SlashCommandPlugin
				commands={slashCommands}
				isLoading={slashCommandsLoading}
				isError={slashCommandsError}
				onRetry={onRetrySlashCommands}
				onClientAction={(name, nodeToReplace) => {
					if (name === "add-dir" && editorRef.current) {
						$insertAddDirTrigger(editorRef.current, nodeToReplace);
					}
				}}
				popupAnchorRef={composerRootRef}
			/>
			<AddDirTypeaheadPlugin
				candidates={addDirCandidates}
				linkedDirectories={linkedDirectories}
				onPick={onPickAddDir}
				popupAnchorRef={composerRootRef}
			/>
			<FileMentionPlugin
				workspaceRootPath={workspaceRootPath}
				popupAnchorRef={composerRootRef}
			/>
			<SubmitPlugin
				onSubmit={onSubmit}
				onSubmitOpposite={onSubmitOpposite}
				toggleHotkey={toggleFollowUpShortcut}
				disabled={submitDisabledForPlugin}
			/>
			<CompositionGuardPlugin />
			<PasteImagePlugin />
			<DropFilePlugin />
			<AutoResizePlugin
				minHeight={COMPOSER_INPUT_MIN_HEIGHT}
				maxHeight={COMPOSER_INPUT_MAX_HEIGHT}
			/>
			<EditorRefPlugin editorRef={editorRef} />
			<DraftPersistencePlugin
				contextKey={contextKey}
				restoreDraft={restoreDraft}
				restoreImages={restoreImages}
				restoreFiles={restoreFiles}
				restoreCustomTags={restoreCustomTags}
				restoreNonce={restoreNonce}
			/>
			<EditablePlugin disabled={inputDisabled} />
			<HasContentPlugin onChange={onHasContentChange} />
		</LexicalComposer>
	);
});
