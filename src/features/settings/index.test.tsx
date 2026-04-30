import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	type AppSettings,
	DEFAULT_SETTINGS,
	SettingsContext,
} from "@/lib/settings";
import { SettingsButton, SettingsDialog } from ".";

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});
}

function withProviders(
	ui: ReactNode,
	queryClient = createTestQueryClient(),
	options: {
		settings?: AppSettings;
		tooltip?: boolean;
		updateSettings?: (patch: Partial<AppSettings>) => void | Promise<void>;
	} = {},
) {
	const tree = (
		<SettingsContext.Provider
			value={{
				settings: options.settings ?? DEFAULT_SETTINGS,
				isLoaded: true,
				updateSettings: options.updateSettings ?? vi.fn(),
			}}
		>
			<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
		</SettingsContext.Provider>
	);

	return options.tooltip === false ? (
		tree
	) : (
		<TooltipProvider>{tree}</TooltipProvider>
	);
}

function renderWithProviders(ui: ReactNode) {
	return render(withProviders(ui));
}

beforeEach(() => {
	vi.mocked(invoke).mockClear();
});

describe("SettingsButton", () => {
	it("calls its click handler without forwarding the click event", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();

		render(
			<TooltipProvider>
				<SettingsButton onClick={onClick} />
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button"));

		expect(onClick).toHaveBeenCalledOnce();
		expect(onClick).toHaveBeenCalledWith();
	});
});

describe("SettingsDialog", () => {
	it("renders the general settings section when opened normally", () => {
		render(
			withProviders(
				<SettingsDialog
					open
					workspaceId={null}
					workspaceRepoId={null}
					onClose={vi.fn()}
				/>,
				createTestQueryClient(),
				{ tooltip: false },
			),
		);

		expect(screen.getByText("Desktop Notifications")).toBeInTheDocument();
	});

	it("does not leave an empty panel for an unavailable repository section", async () => {
		renderWithProviders(
			<SettingsDialog
				open
				workspaceId="workspace-1"
				workspaceRepoId="missing-repo"
				initialSection="repo:missing-repo"
				onClose={vi.fn()}
			/>,
		);

		expect(
			await screen.findByText(/Repository unavailable|Loading repository/),
		).toBeInTheDocument();
	});

	it("resets back to general when reopened without an initial section", () => {
		const queryClient = createTestQueryClient();
		const { rerender } = render(
			withProviders(
				<SettingsDialog
					open
					workspaceId="workspace-1"
					workspaceRepoId="missing-repo"
					initialSection="repo:missing-repo"
					onClose={vi.fn()}
				/>,
				queryClient,
			),
		);

		rerender(
			withProviders(
				<SettingsDialog
					open
					workspaceId={null}
					workspaceRepoId={null}
					onClose={vi.fn()}
				/>,
				queryClient,
			),
		);

		expect(screen.getAllByText("Desktop Notifications").length).toBeGreaterThan(
			0,
		);
	});

	it("plays the selected notification sound directly from the test button", async () => {
		const user = userEvent.setup();
		render(
			withProviders(
				<SettingsDialog
					open
					workspaceId={null}
					workspaceRepoId={null}
					onClose={vi.fn()}
				/>,
				createTestQueryClient(),
				{
					settings: { ...DEFAULT_SETTINGS, notificationSound: "Submarine" },
				},
			),
		);

		await user.click(
			screen.getByRole("button", { name: "Test notification sound" }),
		);

		expect(invoke).toHaveBeenCalledWith("play_notification_sound", {
			sound: "Submarine",
		});
		expect(invoke).not.toHaveBeenCalledWith(
			"plugin:notification|send_notification",
			expect.anything(),
		);
	});
});
