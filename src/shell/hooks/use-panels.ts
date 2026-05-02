import {
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { suspendTerminalFit } from "@/components/terminal-fit-suspension";
import {
	clampSidebarWidth,
	getInitialSidebarWidth,
	INSPECTOR_WIDTH_STORAGE_KEY,
	SIDEBAR_RESIZE_STEP,
	SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/shell/layout";

type ResizeTarget = "sidebar" | "inspector";

type ResizeState = {
	initialWidth: number;
	pointerX: number;
	target: ResizeTarget;
};

const SIDEBAR_WIDTH_VAR = "--pathos-sidebar-width";
const INSPECTOR_WIDTH_VAR = "--pathos-inspector-width";
const THREAD_FROZEN_WIDTH_VAR = "--pathos-thread-frozen-width";

type ShellPanelStyle = CSSProperties & {
	[SIDEBAR_WIDTH_VAR]: string;
	[INSPECTOR_WIDTH_VAR]: string;
};

export function useShellPanels() {
	const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [inspectorWidth, setInspectorWidth] = useState(() =>
		getInitialSidebarWidth(INSPECTOR_WIDTH_STORAGE_KEY),
	);
	const [resizeState, setResizeState] = useState<ResizeState | null>(null);
	const shellPanelsRef = useRef<HTMLDivElement | null>(null);
	const shellPanelsStyle = useMemo<ShellPanelStyle>(
		() => ({
			[SIDEBAR_WIDTH_VAR]: `${sidebarWidth}px`,
			[INSPECTOR_WIDTH_VAR]: `${inspectorWidth}px`,
		}),
		[sidebarWidth, inspectorWidth],
	);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				SIDEBAR_WIDTH_STORAGE_KEY,
				String(sidebarWidth),
			);
		} catch (error) {
			console.error(
				`[pathos] sidebar width save failed for "${SIDEBAR_WIDTH_STORAGE_KEY}"`,
				error,
			);
		}
	}, [sidebarWidth]);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				INSPECTOR_WIDTH_STORAGE_KEY,
				String(inspectorWidth),
			);
		} catch (error) {
			console.error(
				`[pathos] inspector width save failed for "${INSPECTOR_WIDTH_STORAGE_KEY}"`,
				error,
			);
		}
	}, [inspectorWidth]);

	useEffect(() => {
		if (!resizeState) {
			return;
		}

		let pendingWidth: number | null = null;
		let finalWidth = resizeState.initialWidth;
		let rafId: number | null = null;
		const releaseTerminalFit = suspendTerminalFit();
		const widthVariable =
			resizeState.target === "sidebar"
				? SIDEBAR_WIDTH_VAR
				: INSPECTOR_WIDTH_VAR;
		const flush = () => {
			rafId = null;
			if (pendingWidth === null) return;
			const nextWidth = pendingWidth;
			pendingWidth = null;
			finalWidth = nextWidth;
			shellPanelsRef.current?.style.setProperty(
				widthVariable,
				`${nextWidth}px`,
			);
		};

		const handleMouseMove = (event: globalThis.MouseEvent) => {
			const deltaX = event.clientX - resizeState.pointerX;
			const rawWidth =
				resizeState.target === "sidebar"
					? resizeState.initialWidth + deltaX
					: resizeState.initialWidth - deltaX;
			pendingWidth = clampSidebarWidth(rawWidth);
			if (rafId === null) {
				rafId = window.requestAnimationFrame(flush);
			}
		};
		const handleMouseUp = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
			flush();
			if (resizeState.target === "sidebar") {
				setSidebarWidth(finalWidth);
			} else {
				setInspectorWidth(finalWidth);
			}
			setResizeState(null);
		};
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		const shellPanels = shellPanelsRef.current;
		const threadStacks = shellPanels
			? Array.from(
					shellPanels.querySelectorAll<HTMLElement>(
						"[data-pathos-thread-stack]",
					),
				)
			: [];

		for (const stack of threadStacks) {
			const width = stack.clientWidth;
			if (width > 0) {
				stack.style.setProperty(THREAD_FROZEN_WIDTH_VAR, `${width}px`);
			}
		}
		shellPanels?.setAttribute("data-pathos-shell-resizing", "true");
		document.body.style.cursor = "ew-resize";
		document.body.style.userSelect = "none";

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
			releaseTerminalFit();
			shellPanels?.removeAttribute("data-pathos-shell-resizing");
			for (const stack of threadStacks) {
				stack.style.removeProperty(THREAD_FROZEN_WIDTH_VAR);
			}
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [resizeState]);

	const handleResizeStart = useCallback(
		(target: ResizeTarget) => (event: MouseEvent<HTMLDivElement>) => {
			event.preventDefault();
			setResizeState({
				initialWidth: target === "sidebar" ? sidebarWidth : inspectorWidth,
				pointerX: event.clientX,
				target,
			});
		},
		[sidebarWidth, inspectorWidth],
	);

	const handleResizeKeyDown = useCallback(
		(target: ResizeTarget) => (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				if (target === "sidebar") {
					setSidebarWidth((currentWidth) =>
						clampSidebarWidth(currentWidth - SIDEBAR_RESIZE_STEP),
					);
					return;
				}

				setInspectorWidth((currentWidth) =>
					clampSidebarWidth(currentWidth + SIDEBAR_RESIZE_STEP),
				);
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				if (target === "sidebar") {
					setSidebarWidth((currentWidth) =>
						clampSidebarWidth(currentWidth + SIDEBAR_RESIZE_STEP),
					);
					return;
				}

				setInspectorWidth((currentWidth) =>
					clampSidebarWidth(currentWidth - SIDEBAR_RESIZE_STEP),
				);
			}
		},
		[],
	);

	return {
		handleResizeKeyDown,
		handleResizeStart,
		inspectorWidth,
		isInspectorResizing: resizeState?.target === "inspector",
		isSidebarResizing: resizeState?.target === "sidebar",
		sidebarCollapsed,
		sidebarWidth,
		setInspectorWidth,
		setSidebarCollapsed,
		setSidebarWidth,
		shellPanelsRef,
		shellPanelsStyle,
	};
}
