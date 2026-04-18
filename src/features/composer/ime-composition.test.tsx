/**
 * Regression tests for the CJK IME (Input Method Editor) Enter-key bug.
 *
 * Why this exists: when a user is composing text with an IME — Chinese
 * pinyin, Japanese kana, Korean Hangul — and presses Enter to confirm a
 * candidate from the IME suggestion popup, the browser fires a `keydown`
 * for that Enter with `event.isComposing === true` (and Safari/legacy
 * paths additionally use `keyCode === 229`). Lexical's own keydown
 * handler bails when `editor.isComposing()` is true, but Chrome fires
 * `compositionend` BEFORE that final `keydown`, so by the time our
 * SubmitPlugin sees the event Lexical's internal composition flag has
 * already been cleared. Without checking `event.isComposing` /
 * `event.keyCode === 229` ourselves, we accidentally submit a
 * half-typed message — one of the most common i18n bugs in chat UIs.
 *
 * Prior art across the ecosystem (all the same bug):
 *   https://meta.discourse.org/t/ime-composition-enter-key-triggers-message-send-instead-of-confirming-input/385840
 *   https://github.com/menloresearch/jan/pull/6109
 *   https://github.com/open-webui/open-webui/issues/16608
 *   https://github.com/jupyterlab/jupyter-ai/issues/1534
 *   https://github.com/openai/codex/issues/7441
 *
 * Canonical fix: in the Enter handler, bail out when
 *   event.isComposing || event.keyCode === 229
 */

import { QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentModelSection } from "@/lib/api";
import { createHelmorQueryClient } from "@/lib/query-client";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
	convertFileSrc: vi.fn((path: string) => `asset://localhost${path}`),
	Channel: class {
		onmessage: ((event: unknown) => void) | null = null;
	},
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn(),
}));

vi.mock("@/components/ai/code-block", () => ({
	CodeBlock: ({ code, language }: { code: string; language?: string }) => (
		<div data-testid="code-block">
			{language ?? "code"}::{code}
		</div>
	),
}));

import { WorkspaceComposer } from "./index";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
});

const MODEL_SECTIONS = [
	{
		id: "claude",
		label: "Claude",
		options: [
			{
				id: "opus-1m",
				provider: "claude",
				label: "Opus 4.7 1M",
				cliModel: "opus-1m",
				effortLevels: ["low", "medium", "high", "max"],
				supportsFastMode: true,
			},
		],
	},
] satisfies AgentModelSection[];

function renderComposer({ onSubmit }: { onSubmit: () => void }) {
	const queryClient = createHelmorQueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<WorkspaceComposer
				contextKey="session:ime-test"
				onSubmit={onSubmit}
				disabled={false}
				submitDisabled={false}
				sending={false}
				selectedModelId="opus-1m"
				modelSections={MODEL_SECTIONS}
				onSelectModel={vi.fn()}
				provider="claude"
				effortLevel="high"
				onSelectEffort={vi.fn()}
				permissionMode="acceptEdits"
				onChangePermissionMode={vi.fn()}
				restoreImages={[]}
				restoreFiles={[]}
				restoreCustomTags={[]}
				pendingInsertRequests={[
					{
						id: "ime-insert-1",
						workspaceId: "workspace-1",
						sessionId: "session:ime-test",
						behavior: "append",
						createdAt: 0,
						items: [
							{
								kind: "custom-tag",
								key: "ime-tag-1",
								label: "中文消息",
								submitText: "你好，请帮我修复这个 bug。",
							},
						],
					},
				]}
				onPendingInsertRequestsConsumed={vi.fn()}
			/>
		</QueryClientProvider>,
	);
}

describe("WorkspaceComposer — CJK IME composition", () => {
	it("does NOT submit when Enter confirms a Chinese IME candidate (isComposing=true)", async () => {
		const handleSubmit = vi.fn();
		renderComposer({ onSubmit: handleSubmit });

		// Wait until the inserted custom-tag has populated the editor and the
		// Send button is enabled — i.e. submission is otherwise possible.
		await waitFor(() => {
			expect(screen.getByLabelText("Send")).toBeEnabled();
		});

		const editor = screen.getByLabelText("Workspace input");

		// Realistic IME flow: user types pinyin "nihao" with a Chinese IME,
		// the IME shows candidates, then the user presses Enter to confirm
		// the highlighted candidate "你好". In Chrome the browser fires:
		//   1. compositionstart            (IME begins)
		//   2. compositionupdate("nihao")  (pinyin buffer updates)
		//   3. compositionend("你好")      (clears editor.isComposing())
		//   4. keydown Enter, isComposing=true, keyCode=229
		//
		// Step 4 is the one that triggers the bug: Lexical no longer thinks
		// it is composing (step 3 cleared its flag), so it dispatches
		// KEY_ENTER_COMMAND — and our SubmitPlugin currently has no IME
		// guard, so onSubmit fires even though the user only meant to
		// confirm the IME candidate.
		fireEvent.compositionStart(editor, { data: "" });
		fireEvent.compositionUpdate(editor, { data: "nihao" });
		fireEvent.compositionEnd(editor, { data: "你好" });
		fireEvent.keyDown(editor, {
			key: "Enter",
			code: "Enter",
			keyCode: 229,
			isComposing: true,
			bubbles: true,
		});

		// RED today — SubmitPlugin ignores event.isComposing and submits.
		expect(handleSubmit).not.toHaveBeenCalled();
	});

	it("DOES submit on a normal Enter outside IME composition (sanity check)", async () => {
		const handleSubmit = vi.fn();
		renderComposer({ onSubmit: handleSubmit });

		await waitFor(() => {
			expect(screen.getByLabelText("Send")).toBeEnabled();
		});

		const editor = screen.getByLabelText("Workspace input");

		fireEvent.keyDown(editor, {
			key: "Enter",
			code: "Enter",
			keyCode: 13,
			isComposing: false,
			bubbles: true,
		});

		await waitFor(() => {
			expect(handleSubmit).toHaveBeenCalled();
		});
	});
});
