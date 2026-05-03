import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type LexicalEditor,
} from "lexical";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoResizePlugin } from "./auto-resize-plugin";
import { EditorRefPlugin } from "./editor-ref-plugin";

afterEach(() => {
	cleanup();
});

function renderAutoResizeHarness() {
	const editorRef = { current: null as LexicalEditor | null };

	render(
		<LexicalComposer
			initialConfig={{
				namespace: "AutoResizePluginTest",
				onError: vi.fn(),
				nodes: [],
			}}
		>
			<PlainTextPlugin
				contentEditable={<ContentEditable aria-label="Composer input" />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<AutoResizePlugin minHeight={32} maxHeight={120} />
			<EditorRefPlugin editorRef={editorRef} />
		</LexicalComposer>,
	);

	return editorRef;
}

function setReadonlyNumber(
	element: HTMLElement,
	key: "clientHeight" | "scrollHeight",
	value: number,
) {
	Object.defineProperty(element, key, {
		configurable: true,
		get: () => value,
	});
}

describe("AutoResizePlugin", () => {
	it("preserves manual scroll position when editing away from the bottom", async () => {
		const editorRef = renderAutoResizeHarness();
		const rootEl = screen.getByLabelText("Composer input");

		await waitFor(() => {
			expect(editorRef.current).not.toBeNull();
		});

		setReadonlyNumber(rootEl, "clientHeight", 120);
		setReadonlyNumber(rootEl, "scrollHeight", 360);
		rootEl.scrollTop = 48;

		await act(async () => {
			editorRef.current?.update(() => {
				const root = $getRoot();
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode("top edit"));
				root.clear();
				root.append(paragraph);
			});
		});

		expect(rootEl.scrollTop).toBe(48);
	});

	it("keeps the editor pinned to the bottom when it was already there", async () => {
		const editorRef = renderAutoResizeHarness();
		const rootEl = screen.getByLabelText("Composer input");

		await waitFor(() => {
			expect(editorRef.current).not.toBeNull();
		});

		setReadonlyNumber(rootEl, "clientHeight", 120);
		setReadonlyNumber(rootEl, "scrollHeight", 360);
		rootEl.scrollTop = 240;

		await act(async () => {
			editorRef.current?.update(() => {
				const root = $getRoot();
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode("bottom edit"));
				root.clear();
				root.append(paragraph);
			});
		});

		expect(rootEl.scrollTop).toBe(360);
	});
});
