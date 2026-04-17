import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { renderWithProviders } from "@/test/render-with-providers";
import { _resetForTesting } from "../script-store";
import { SetupTab } from "./setup";

// ── Mocks ────────────────────────────────────────────────────────────────────

const apiMocks = vi.hoisted(() => ({
	executeRepoScript: vi.fn(),
	stopRepoScript: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		executeRepoScript: apiMocks.executeRepoScript,
		stopRepoScript: apiMocks.stopRepoScript,
	};
});

vi.mock("@/components/terminal-output", () => ({
	TerminalOutput: ({ className }: { className?: string }) => (
		<div data-testid="terminal" className={className} />
	),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaults = {
	repoId: "repo-1",
	workspaceId: "ws-1" as string | null,
	setupScript: "echo hello" as string | null,
	isActive: true,
	onOpenSettings: vi.fn(),
};

function renderSetup(overrides: Partial<typeof defaults> = {}) {
	const props = { ...defaults, ...overrides };
	return renderWithProviders(
		<Tabs defaultValue="setup">
			<SetupTab {...props} />
		</Tabs>,
	);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SetupTab", () => {
	beforeEach(() => {
		apiMocks.executeRepoScript.mockReset().mockResolvedValue(undefined);
		apiMocks.stopRepoScript.mockReset().mockResolvedValue(true);
	});

	afterEach(() => {
		_resetForTesting();
		vi.restoreAllMocks();
		cleanup();
	});

	// ── Empty / idle states ────────────────────────────────────────────────

	it("shows empty state when no script is configured", () => {
		renderSetup({ setupScript: null });

		expect(screen.getByText("No setup script configured")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /open settings/i }),
		).toBeInTheDocument();
	});

	it("shows 'Run setup' when script exists but hasn't run yet", () => {
		renderSetup();

		expect(
			screen.getByRole("button", { name: /run setup/i }),
		).toBeInTheDocument();
	});

	// ── Manual run / stop / rerun ──────────────────────────────────────────

	it("clicking 'Run setup' calls executeRepoScript", async () => {
		const user = userEvent.setup();
		renderSetup();

		await user.click(screen.getByRole("button", { name: /run setup/i }));

		expect(apiMocks.executeRepoScript).toHaveBeenCalledWith(
			"repo-1",
			"setup",
			expect.any(Function),
			"ws-1",
		);
	});

	it("shows Stop button while running", async () => {
		const user = userEvent.setup();
		renderSetup();

		await user.click(screen.getByRole("button", { name: /run setup/i }));

		expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
	});

	it("Stop button calls stopRepoScript with workspace id", async () => {
		const user = userEvent.setup();
		renderSetup();

		await user.click(screen.getByRole("button", { name: /run setup/i }));
		await user.click(screen.getByRole("button", { name: /stop/i }));

		expect(apiMocks.stopRepoScript).toHaveBeenCalledWith(
			"repo-1",
			"setup",
			"ws-1",
		);
	});

	it("shows 'Rerun setup' button after script exits", async () => {
		const user = userEvent.setup();

		let onEvent: (e: unknown) => void = () => {};
		apiMocks.executeRepoScript.mockImplementation(
			(_r: string, _t: string, cb: (e: unknown) => void) => {
				onEvent = cb;
				return Promise.resolve();
			},
		);

		renderSetup();
		await user.click(screen.getByRole("button", { name: /run setup/i }));

		// Simulate the exited event from the backend.
		onEvent({ type: "exited", code: 0 });

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /rerun setup/i }),
			).toBeInTheDocument();
		});
	});
});
