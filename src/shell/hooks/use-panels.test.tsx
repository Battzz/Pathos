import { act, renderHook, waitFor } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTerminalFitSuspended } from "@/components/terminal-fit-suspension";
import {
	DEFAULT_SIDEBAR_WIDTH,
	SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/shell/layout";
import { useShellPanels } from "./use-panels";

describe("useShellPanels", () => {
	const originalRequestAnimationFrame = window.requestAnimationFrame;
	const originalCancelAnimationFrame = window.cancelAnimationFrame;

	beforeEach(() => {
		window.localStorage.clear();
		window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		window.cancelAnimationFrame = vi.fn();
	});

	afterEach(() => {
		window.requestAnimationFrame = originalRequestAnimationFrame;
		window.cancelAnimationFrame = originalCancelAnimationFrame;
		vi.restoreAllMocks();
		window.localStorage.clear();
	});

	it("resizes through CSS variables during drag and commits React state on mouseup", async () => {
		const { result } = renderHook(() => useShellPanels());
		const shell = document.createElement("div");

		act(() => {
			result.current.shellPanelsRef.current = shell;
		});

		act(() => {
			result.current.handleResizeStart("sidebar")({
				clientX: 100,
				preventDefault: vi.fn(),
			} as unknown as ReactMouseEvent<HTMLDivElement>);
		});
		expect(isTerminalFitSuspended()).toBe(true);

		act(() => {
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
		});

		expect(shell.style.getPropertyValue("--pathos-sidebar-width")).toBe(
			`${DEFAULT_SIDEBAR_WIDTH + 50}px`,
		);
		expect(result.current.sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH);
		expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).not.toBe(
			String(DEFAULT_SIDEBAR_WIDTH + 50),
		);

		act(() => {
			window.dispatchEvent(new MouseEvent("mouseup"));
		});
		expect(isTerminalFitSuspended()).toBe(false);

		expect(result.current.sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH + 50);
		await waitFor(() => {
			expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
				String(DEFAULT_SIDEBAR_WIDTH + 50),
			);
		});
	});
});
