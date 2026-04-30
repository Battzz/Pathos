import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import {
	InspectorTabsSection,
	TABS_BLUR_HOLD_UNTIL_MS,
	TABS_HOVER_ACTIVATION_MS,
	TABS_HOVER_ZOOM_MULTIPLIER,
} from "./layout";

describe("InspectorTabsSection", () => {
	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	it("does not re-trigger blur when moving from header back into body while zoomed", () => {
		vi.useFakeTimers();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const filterLayer = tabsBody.parentElement as HTMLElement;
		const header = screen.getByRole("tablist").parentElement as HTMLElement;

		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
		});

		expect(filterLayer).toHaveStyle({ filter: "blur(6px)" });

		act(() => {
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});

		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });

		fireEvent.mouseEnter(header);
		fireEvent.mouseEnter(tabsBody);

		expect(filterLayer).toHaveStyle({ filter: "blur(0)" });
	});

	it("stays zoomed when the active tab becomes non-zoomable until the pointer leaves", () => {
		vi.useFakeTimers();

		const view = renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="run"
				onTabChange={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const expectedZoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

		fireEvent.mouseEnter(zoomContainer);
		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
			vi.advanceTimersByTime(TABS_BLUR_HOLD_UNTIL_MS);
		});

		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		view.rerender(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="setup"
				onTabChange={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand={false}
			>
				<div>Placeholder body</div>
			</InspectorTabsSection>,
		);

		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		fireEvent.mouseLeave(zoomContainer);

		expect(zoomContainer.firstElementChild?.firstElementChild).toHaveStyle({
			filter: "blur(6px)",
		});
	});

	it("clears hover zoom before the chevron collapse toggle runs", () => {
		vi.useFakeTimers();
		const onToggle = vi.fn();

		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={onToggle}
				activeTab="run"
				onTabChange={vi.fn()}
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		const tabsBody = screen.getByLabelText("Inspector tabs body");
		const zoomContainer = screen.getByLabelText("Inspector section Tabs")
			.parentElement as HTMLElement;
		const expectedZoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

		fireEvent.mouseEnter(zoomContainer);
		fireEvent.mouseEnter(tabsBody);
		act(() => {
			vi.advanceTimersByTime(TABS_HOVER_ACTIVATION_MS);
		});

		expect(zoomContainer).toHaveStyle({ width: expectedZoomedSize });

		fireEvent.click(
			screen.getByRole("button", { name: "Toggle inspector tabs section" }),
		);

		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(zoomContainer).toHaveStyle({ width: "100%" });
	});

	it("keeps primary Setup and Run icons visible when scripts are not configured", () => {
		renderWithProviders(
			<InspectorTabsSection
				wrapperRef={createRef<HTMLDivElement>()}
				open
				onToggle={vi.fn()}
				activeTab="setup"
				onTabChange={vi.fn()}
				setupStatus="no-script"
				runStatus="no-script"
				terminalInstances={[]}
				onAddTerminal={vi.fn()}
				onCloseTerminal={vi.fn()}
				canSpawnTerminal={false}
				canHoverExpand={false}
			>
				<div>Terminal body</div>
			</InspectorTabsSection>,
		);

		expect(
			screen.getByRole("tab", { name: "Setup" }).querySelector("svg"),
		).toBeTruthy();
		expect(
			screen.getByRole("tab", { name: "Run" }).querySelector("svg"),
		).toBeTruthy();
	});
});
