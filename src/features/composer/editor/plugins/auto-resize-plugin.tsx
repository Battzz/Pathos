/**
 * Lexical plugin: auto-resize editor height based on content,
 * clamped between min and max height.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

export function AutoResizePlugin({
	minHeight = 64,
	maxHeight = 240,
}: {
	minHeight?: number;
	maxHeight?: number;
}) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		return editor.registerUpdateListener(() => {
			const rootEl = editor.getRootElement();
			if (!rootEl) return;
			const previousScrollTop = rootEl.scrollTop;
			const wasPinnedToBottom =
				rootEl.scrollHeight - rootEl.clientHeight - previousScrollTop <= 2;

			rootEl.style.height = "auto";
			const next = Math.min(rootEl.scrollHeight, maxHeight);
			rootEl.style.height = `${Math.max(next, minHeight)}px`;
			rootEl.scrollTop = wasPinnedToBottom
				? rootEl.scrollHeight
				: previousScrollTop;
		});
	}, [editor, minHeight, maxHeight]);

	return null;
}
