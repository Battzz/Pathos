import { invoke } from "@tauri-apps/api/core";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { WorkspacePanel } from "./features/panel";
import { renderWithProviders } from "./test/render-with-providers";

vi.mock("./App.css", () => ({}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn(),
}));

const SIDEBAR_WIDTH_STORAGE_KEY = "pathos.workspaceSidebarWidth";
const INSPECTOR_WIDTH_STORAGE_KEY = "pathos.workspaceInspectorWidth";

describe("App", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it.skip("toggles the inspector tabs section while leaving the first two panels expanded", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("main", { name: "Application shell" });
		await user.click(
			screen.getByRole("button", { name: "Expand right sidebar" }),
		);

		// Default: tabs section collapsed; changes + actions bodies present.
		expect(screen.getByLabelText("Changes panel body")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions panel body")).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Inspector tabs body"),
		).not.toBeInTheDocument();

		// Clicking the toggle expands the tabs body.
		await user.click(screen.getByLabelText("Toggle inspector tabs section"));

		expect(screen.getByLabelText("Changes panel body")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions panel body")).toBeInTheDocument();
		expect(screen.getByLabelText("Inspector tabs body")).toBeInTheDocument();

		// Clicking again collapses it back.
		await user.click(screen.getByLabelText("Toggle inspector tabs section"));

		expect(screen.getByLabelText("Changes panel body")).toBeInTheDocument();
		expect(screen.getByLabelText("Actions panel body")).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Inspector tabs body"),
		).not.toBeInTheDocument();
	});

	it("resizes the sidebar and persists the width", async () => {
		render(<App />);
		await screen.findByRole("main", { name: "Application shell" });

		const sidebar = screen.getByLabelText("Workspace sidebar");
		const resizeHandle = screen.getByRole("separator", {
			name: "Resize sidebar",
		});

		fireEvent.mouseDown(resizeHandle, { clientX: 336 });

		await waitFor(() => {
			expect(document.body.style.cursor).toBe("ew-resize");
		});

		fireEvent.mouseMove(window, { clientX: 360 });

		await waitFor(() => {
			expect(sidebar).toHaveStyle({ width: "360px" });
			expect(resizeHandle).toHaveAttribute("aria-valuenow", "360");
		});

		fireEvent.mouseUp(window);

		await waitFor(() => {
			expect(document.body.style.cursor).toBe("");
		});

		expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("360");
	});

	it.skip("resizes the inspector sidebar and persists the width", async () => {
		render(<App />);
		await screen.findByRole("main", { name: "Application shell" });
		fireEvent.click(
			screen.getByRole("button", { name: "Expand right sidebar" }),
		);

		const inspector = screen.getByLabelText("Inspector sidebar");
		const resizeHandle = screen.getByRole("separator", {
			name: "Resize inspector sidebar",
		});

		fireEvent.mouseDown(resizeHandle, { clientX: 1200 });

		await waitFor(() => {
			expect(document.body.style.cursor).toBe("ew-resize");
		});

		fireEvent.mouseMove(window, { clientX: 1172 });

		await waitFor(() => {
			expect(inspector).toHaveStyle({ width: "364px" });
			expect(resizeHandle).toHaveAttribute("aria-valuenow", "364");
		});

		fireEvent.mouseUp(window);

		await waitFor(() => {
			expect(document.body.style.cursor).toBe("");
		});

		expect(window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY)).toBe(
			"364",
		);
	});

	it("restores the saved sidebar width from localStorage", async () => {
		window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "404");
		window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, "388");

		render(<App />);
		await screen.findByRole("main", { name: "Application shell" });

		expect(screen.getByLabelText("Workspace sidebar")).toHaveStyle({
			width: "404px",
		});
		expect(
			screen.getByRole("separator", { name: "Resize sidebar" }),
		).toHaveAttribute("aria-valuenow", "404");
	});

	it("shows the update button beside the sidebar toggle when an update is ready", async () => {
		const invokeMock = vi.mocked(invoke);
		const baseInvokeImpl = invokeMock.getMockImplementation();

		invokeMock.mockImplementation(
			async (command: string, ...args: unknown[]) => {
				if (command === "get_app_update_status") {
					return {
						stage: "downloaded",
						configured: true,
						autoUpdateEnabled: true,
						update: {
							currentVersion: "1.0.0",
							version: "1.1.0",
							releaseUrl: "https://example.com/release",
						},
						lastError: null,
						lastAttemptAt: null,
						downloadedAt: "2026-04-23T00:00:00Z",
					};
				}

				return baseInvokeImpl?.(command, args[0] as undefined);
			},
		);

		try {
			const user = userEvent.setup();
			render(<App />);
			await screen.findByRole("main", { name: "Application shell" });

			expect(
				screen.getByRole("button", { name: "Update Pathos to 1.1.0" }),
			).toBeInTheDocument();

			await user.click(
				screen.getByRole("button", { name: "Collapse left sidebar" }),
			);

			expect(
				screen.getByRole("button", { name: "Update Pathos to 1.1.0" }),
			).toBeInTheDocument();
		} finally {
			invokeMock.mockImplementation(baseInvokeImpl ?? (async () => undefined));
		}
	});

	it.skip("shows unread indicators in inactive session tabs", () => {
		renderWithProviders(
			<WorkspacePanel
				workspace={null}
				sessions={[
					{
						id: "session-1",
						workspaceId: "workspace-1",
						title: "Unread session",
						agentType: "claude",
						status: "idle",
						permissionMode: "default",
						unreadCount: 1,
						fastMode: false,
						createdAt: "2026-04-03T00:00:00Z",
						updatedAt: "2026-04-03T00:00:00Z",
						isHidden: false,
						active: false,
					},
				]}
				selectedSessionId={null}
				sessionPanes={[
					{
						sessionId: "session-1",
						messages: [],
						sending: false,
						hasLoaded: true,
						presentationState: "presented",
					},
				]}
			/>,
		);

		expect(screen.getByLabelText("Unread session")).toBeInTheDocument();
	});

	it("keeps large threads on the progressive viewport while sending", () => {
		const messages = Array.from({ length: 30 }, (_, index) => ({
			role: "assistant" as const,
			id: `assistant-${index}`,
			createdAt: `2026-04-03T00:00:${String(index).padStart(2, "0")}Z`,
			content: [
				{
					type: "text" as const,
					id: `assistant-${index}:txt:0`,
					text: `message ${index} `.repeat(8),
				},
			],
			status: { type: "complete" as const, reason: "stop" as const },
		}));

		renderWithProviders(
			<WorkspacePanel
				workspace={null}
				sessions={[
					{
						id: "session-1",
						workspaceId: "workspace-1",
						title: "Streaming session",
						agentType: "claude",
						status: "idle",
						permissionMode: "default",
						unreadCount: 0,
						fastMode: false,
						createdAt: "2026-04-03T00:00:00Z",
						updatedAt: "2026-04-03T00:00:00Z",
						isHidden: false,
						active: true,
					},
				]}
				selectedSessionId="session-1"
				sending
				sessionPanes={[
					{
						sessionId: "session-1",
						messages,
						sending: true,
						hasLoaded: true,
						presentationState: "presented",
					},
				]}
			/>,
		);

		expect(
			screen.getByLabelText("Conversation rows for session session-1"),
		).toBeInTheDocument();
	});
});
