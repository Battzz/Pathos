import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
	getForgeCliStatus: vi.fn(),
	openForgeCliAuthTerminal: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		getForgeCliStatus: apiMocks.getForgeCliStatus,
		openForgeCliAuthTerminal: apiMocks.openForgeCliAuthTerminal,
	};
});

vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), {
		error: vi.fn(),
		success: vi.fn(),
	}),
}));

import { RepositoryCliStep } from "./repository-cli-step";

describe("RepositoryCliStep", () => {
	beforeEach(() => {
		apiMocks.getForgeCliStatus.mockReset();
		apiMocks.openForgeCliAuthTerminal.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows Ready when a repository CLI is already authenticated", async () => {
		apiMocks.getForgeCliStatus.mockImplementation((provider: string) =>
			Promise.resolve({
				status: "ready",
				provider,
				host: provider === "gitlab" ? "gitlab.com" : "github.com",
				cliName: provider === "gitlab" ? "glab" : "gh",
				login: "octocat",
				version: "test",
				message: `${provider === "gitlab" ? "GitLab" : "GitHub"} CLI ready as octocat.`,
			}),
		);

		render(
			<RepositoryCliStep step="corner" onBack={vi.fn()} onNext={vi.fn()} />,
		);

		const githubItem = screen.getByRole("group", { name: "GitHub CLI" });

		await waitFor(() => {
			expect(within(githubItem).getByText("Ready")).toBeInTheDocument();
		});
		expect(
			within(githubItem).queryByRole("button", { name: "Set up" }),
		).not.toBeInTheDocument();
	});

	it("opens the auth terminal from Set up when a repository CLI is unauthenticated", async () => {
		const user = userEvent.setup();
		apiMocks.getForgeCliStatus.mockResolvedValue({
			status: "unauthenticated",
			provider: "github",
			host: "github.com",
			cliName: "gh",
			version: "test",
			message: "Run `gh auth login` to connect GitHub CLI.",
			loginCommand: "gh auth login",
		});
		apiMocks.openForgeCliAuthTerminal.mockResolvedValue(undefined);

		render(
			<RepositoryCliStep step="corner" onBack={vi.fn()} onNext={vi.fn()} />,
		);

		const githubItem = screen.getByRole("group", { name: "GitHub CLI" });
		await waitFor(() => {
			expect(
				within(githubItem).getByRole("button", { name: "Set up" }),
			).toBeEnabled();
		});

		await user.click(
			within(githubItem).getByRole("button", { name: "Set up" }),
		);

		await waitFor(() => {
			expect(apiMocks.openForgeCliAuthTerminal).toHaveBeenCalledWith(
				"github",
				"github.com",
			);
		});
	});
});
