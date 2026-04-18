/**
 * Regression tests for the CJK IME "switch-mid-composition" space-leak bug.
 *
 * Why this exists: when a user types under an active Chinese pinyin IME and
 * the IME segments their input (e.g. `helmor` → candidate row shows
 * `he | lmor`), if the user **switches IMEs** (Shift / Ctrl+Space / Cmd+Space
 * to flip to English) WITHOUT pressing Enter to confirm or Esc to cancel,
 * the OS force-commits the IME's pending buffer into the contenteditable —
 * with the IME's own segmentation spaces preserved as ASCII U+0020s. The
 * editor ends up with `he lmor` instead of the `helmor` the user actually
 * typed.
 *
 * The browser-level event surface for this is genuinely under-specified:
 *   - W3C UI Events says nothing normative about IME-switch interruption.
 *   - Chromium typically fires `compositionend` with `event.data` = the raw
 *     buffer (including the IME's segmentation spaces).
 *   - WebKit (Helmor's Tauri target) sometimes does not fire `compositionend`
 *     at all and lets the text arrive only through `input` events
 *     (WebKit bug 164369).
 *   - Firefox sometimes leaves the widget stuck in composing mode forever
 *     with no `compositionend` (Mozilla bug 1219438).
 *
 * The cross-cutting consensus from the rich-text-editor world (ProseMirror,
 * Quill, CKEditor 5, Draft.js, Marijn Haverbeke's CodeMirror 6 notes) is
 * "do NOT trust `compositionend.data`; reconcile against the DOM." Lexical
 * sits on the wrong side of that line: `$onCompositionEndImpl` calls
 * `$updateSelectedTextFromDOM(true, editor, data)` and writes whatever
 * the IME left in `data` straight into the model — no ASCII-vs-CJK check,
 * no IME-segmentation-space heuristic, no DOM diff. That is the proximate
 * cause of this bug in our composer.
 *
 * Two pieces of prior art directly inform the test design:
 *   - catnose99/use-chat-submit listens to `compositioncancel` (the event
 *     Chromium fires when the IME is force-switched mid-composition).
 *   - React PR #12563 (Korean IME compositionend.data fix) is the canonical
 *     example of "trust nativeEvent.data over the reconstructed buffer."
 *
 * The safe transformation: `data.replace(/\s+/g, '')` IFF the data is pure
 * printable ASCII. Pinyin / Zhuyin / Wubi / Cangjie candidate buffers never
 * contain intentional ASCII spaces — every U+0020 in the buffer is an
 * IME-injected segmentation separator. The regression test below pins this
 * conditional behavior down so a future "just strip every space" fix can't
 * silently nuke a user's legitimate Chinese-with-spaces input.
 *
 * jsdom note: jsdom doesn't simulate an OS IME, so we mimic what an IME
 * does at the DOM layer ourselves — we write the segmented buffer directly
 * into the contenteditable's text node, then dispatch the composition
 * events Lexical actually listens to. Probed and confirmed: this faithfully
 * reproduces the editor end-state we observe in production WebKit.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

// jsdom doesn't implement Range.getBoundingClientRect, which Lexical's
// post-commit selection update calls. The call happens AFTER we've already
// asserted on textContent, but it raises an unhandled exception in the
// test runner. Stubbing keeps the noise out without affecting behavior.
beforeAll(() => {
	if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
		Range.prototype.getBoundingClientRect = () =>
			({
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				toJSON: () => ({}),
			}) as DOMRect;
	}
	if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
		Range.prototype.getClientRects = () =>
			({
				length: 0,
				item: () => null,
				[Symbol.iterator]: function* () {},
			}) as unknown as DOMRectList;
	}
});

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

function renderComposer() {
	const queryClient = createHelmorQueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<WorkspaceComposer
				contextKey="session:ime-switch-test"
				onSubmit={vi.fn()}
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
			/>
		</QueryClientProvider>,
	);
}

/**
 * Mimic an OS-level IME interaction at the DOM layer.
 *
 * Real flow: user types raw keys → IME intercepts and shows segmented
 * candidates in the IME popup → IME writes the running buffer into the
 * contenteditable as plain text → user switches IME → OS commits the
 * buffer and the browser fires compositionend with `data` = the buffer.
 *
 * jsdom doesn't simulate any of that, so we simulate the *editor-visible*
 * outcome: write the segmented buffer into the paragraph text node and
 * then dispatch the composition events Lexical actually listens to.
 */
function simulateImeSwitchCommit(editor: HTMLElement, segmentedBuffer: string) {
	const paragraph = editor.querySelector("p");
	if (!paragraph) {
		throw new Error(
			"Composer paragraph element not found — Lexical didn't mount?",
		);
	}
	fireEvent.compositionStart(editor, { data: "" });
	paragraph.textContent = segmentedBuffer;
	fireEvent.compositionUpdate(editor, { data: segmentedBuffer });
	fireEvent.compositionEnd(editor, { data: segmentedBuffer });
}

describe("WorkspaceComposer — IME switch mid-composition leaves segmentation spaces", () => {
	it("strips IME segmentation spaces when a pure-ASCII pinyin buffer is force-committed", async () => {
		renderComposer();
		const editor = await screen.findByLabelText("Workspace input");
		editor.focus();

		// User typed "helmor" with Chinese pinyin IME active. The IME
		// segmented it as `he | lmor` (visible in the candidate strip).
		// User pressed Shift to switch to English IME without confirming
		// — OS commits the segmented buffer "he lmor" with the inserted
		// space.
		simulateImeSwitchCommit(editor, "he lmor");

		// What the user expects to see: "helmor" (the raw keystrokes they
		// actually typed). What's broken today: Lexical writes "he lmor".
		expect(editor.textContent).toBe("helmor");
	});

	it("strips IME segmentation spaces from a multi-word English buffer (`useState` segmented as `use state`)", async () => {
		renderComposer();
		const editor = await screen.findByLabelText("Workspace input");
		editor.focus();

		simulateImeSwitchCommit(editor, "use state");

		expect(editor.textContent).toBe("usestate");
	});

	// Regression guard for the upcoming fix.
	//
	// The cheap fix is `data.replace(/\s+/g, '')` — but applied
	// unconditionally that nukes legitimate spaces in any compositionend
	// payload, including normal CJK candidates that *do* contain a real
	// space (mixed-script commits like "你好 world" are valid). This test
	// pins down the conditional shape of the fix: only strip when the
	// committed `data` is pure printable ASCII (which is the IME-segmented
	// pinyin / wubi / zhuyin / cangjie buffer signature — those engines
	// never emit candidates with intentional ASCII spaces).
	//
	// Today this passes because Lexical writes the data verbatim; after
	// the fix this MUST keep passing because the strip is guarded on
	// "ASCII-only data." If a future refactor drops the guard, the test
	// turns red and we know we just broke every CJK user's mixed-script
	// input.
	it("regression: a compositionend payload that contains CJK characters preserves its spaces verbatim", async () => {
		renderComposer();
		const editor = await screen.findByLabelText("Workspace input");
		editor.focus();

		// Realistic mixed-script commit — IME confirmed the candidate
		// "你好 world" (CJK + intentional space + Latin), the space here
		// is NOT IME segmentation, it is what the user wanted.
		simulateImeSwitchCommit(editor, "你好 world");

		expect(editor.textContent).toBe("你好 world");
	});
});
