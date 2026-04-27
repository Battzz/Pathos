import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeRequestInfo, ForgeDetection } from "@/lib/api";
import { helmorQueryKeys } from "@/lib/query-client";
import { renderWithProviders } from "@/test/render-with-providers";
import { GitSectionHeader } from "./git-section-header";

const apiMocks = vi.hoisted(() => ({
	getWorkspaceForge: vi.fn(),
	openForgeCliAuthTerminal: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();

	return {
		...actual,
		getWorkspaceForge: apiMocks.getWorkspaceForge,
		openForgeCliAuthTerminal: apiMocks.openForgeCliAuthTerminal,
	};
});

const changeRequest: ChangeRequestInfo = {
	url: "https://gitlab.com/helmor/helmor/-/merge_requests/182",
	number: 182,
	state: "OPEN",
	title: "Add GitLab forge support",
	isMerged: false,
};

function gitlabDetection(patch: Partial<ForgeDetection> = {}): ForgeDetection {
	return {
		provider: "gitlab",
		host: "gitlab.com",
		namespace: "helmor",
		repo: "helmor",
		remoteUrl: "git@gitlab.com:helmor/helmor.git",
		labels: {
			providerName: "GitLab",
			cliName: "glab",
			changeRequestName: "MR",
			changeRequestFullName: "merge request",
			connectAction: "Connect GitLab",
		},
		cli: {
			status: "unauthenticated",
			provider: "gitlab",
			host: "gitlab.com",
			cliName: "glab",
			version: "1.50.0",
			message: "Run `glab auth login --hostname gitlab.com`.",
			loginCommand: "glab auth login --hostname gitlab.com",
		},
		detectionSignals: [],
		...patch,
	};
}

function githubDetection(patch: Partial<ForgeDetection> = {}): ForgeDetection {
	return {
		provider: "github",
		host: "github.com",
		namespace: "helmor",
		repo: "helmor",
		remoteUrl: "git@github.com:helmor/helmor.git",
		labels: {
			providerName: "GitHub",
			cliName: "gh",
			changeRequestName: "PR",
			changeRequestFullName: "pull request",
			connectAction: "Connect GitHub",
		},
		cli: {
			status: "unauthenticated",
			provider: "github",
			host: "github.com",
			cliName: "gh",
			version: "2.65.0",
			message: "Run `gh auth login`.",
			loginCommand: "gh auth login",
		},
		detectionSignals: [],
		...patch,
	};
}

function expectElementBefore(first: Element, second: Element) {
	expect(
		first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
}

describe("GitSectionHeader forge onboarding", () => {
	beforeEach(() => {
		apiMocks.getWorkspaceForge.mockReset();
		apiMocks.openForgeCliAuthTerminal.mockReset();
		apiMocks.openForgeCliAuthTerminal.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("shows a single connect CTA without also showing the MR pill", () => {
		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={gitlabDetection()}
				workspaceId="workspace-1"
			/>,
		);

		const title = screen.getByText("Git");
		const connectButton = screen.getByRole("button", {
			name: "Connect GitLab",
		});

		expect(title).toBeInTheDocument();
		expect(connectButton).toBeInTheDocument();
		expect(screen.queryByLabelText(/Why do we think/)).not.toBeInTheDocument();
		expectElementBefore(title, connectButton);
		expect(screen.queryByText("!182")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Merge" }),
		).not.toBeInTheDocument();
	});

	it("shows CLI connect without also showing the MR pill", () => {
		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={gitlabDetection({
					cli: {
						status: "ready",
						provider: "gitlab",
						host: "gitlab.com",
						cliName: "glab",
						login: "liangeqiang",
						version: "1.55.0",
						message: "Connected.",
					},
				})}
				forgeRemoteState="unauthenticated"
				workspaceId="workspace-1"
			/>,
		);

		const title = screen.getByText("Git");
		const connectButton = screen.getByRole("button", {
			name: "Connect GitLab",
		});

		expect(title).toBeInTheDocument();
		expect(connectButton).toBeInTheDocument();
		expect(screen.queryByLabelText(/Why do we think/)).not.toBeInTheDocument();
		expectElementBefore(title, connectButton);
		expect(screen.queryByText("!182")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Merge" }),
		).not.toBeInTheDocument();
	});

	it("refreshes MR and forge status after Terminal auth becomes ready", async () => {
		vi.useFakeTimers();
		const unauthenticatedDetection = gitlabDetection({
			cli: {
				status: "unauthenticated",
				provider: "gitlab",
				host: "gitlab.com",
				cliName: "glab",
				version: "1.55.0",
				message: "Run `glab auth login --hostname gitlab.com`.",
				loginCommand: "glab auth login --hostname gitlab.com",
			},
		});
		const readyDetection = gitlabDetection({
			cli: {
				status: "ready",
				provider: "gitlab",
				host: "gitlab.com",
				cliName: "glab",
				login: "liangeqiang",
				version: "1.55.0",
				message: "Connected.",
			},
		});
		apiMocks.getWorkspaceForge.mockResolvedValueOnce(readyDetection);

		const { queryClient } = renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={unauthenticatedDetection}
				workspaceId="workspace-1"
			/>,
		);
		const invalidateQueries = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);

		fireEvent.click(screen.getByRole("button", { name: "Connect GitLab" }));

		await vi.advanceTimersByTimeAsync(0);
		expect(apiMocks.openForgeCliAuthTerminal).toHaveBeenCalledWith(
			"gitlab",
			"gitlab.com",
		);
		await vi.advanceTimersByTimeAsync(2000);

		expect(apiMocks.getWorkspaceForge).toHaveBeenCalledTimes(1);
		expect(
			queryClient.getQueryData(helmorQueryKeys.workspaceForge("workspace-1")),
		).toEqual(readyDetection);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: helmorQueryKeys.workspaceForge("workspace-1"),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: helmorQueryKeys.workspaceChangeRequest("workspace-1"),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: helmorQueryKeys.workspaceForgeActionStatus("workspace-1"),
		});
	});

	it("does not open duplicate auth terminals on repeated connect clicks", async () => {
		const unauthenticatedDetection = gitlabDetection({
			cli: {
				status: "unauthenticated",
				provider: "gitlab",
				host: "gitlab.com",
				cliName: "glab",
				version: "1.55.0",
				message: "Run `glab auth login --hostname gitlab.com`.",
				loginCommand: "glab auth login --hostname gitlab.com",
			},
		});
		apiMocks.getWorkspaceForge.mockResolvedValue(unauthenticatedDetection);

		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={unauthenticatedDetection}
				workspaceId="workspace-1"
			/>,
		);

		const connectButton = screen.getByRole("button", {
			name: "Connect GitLab",
		});
		fireEvent.click(connectButton);
		fireEvent.click(connectButton);

		await waitFor(() => {
			expect(apiMocks.openForgeCliAuthTerminal).toHaveBeenCalledTimes(1);
		});
	});

	it("opens the auth terminal directly when CLI is not yet authenticated", async () => {
		apiMocks.getWorkspaceForge.mockResolvedValue(gitlabDetection());

		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={gitlabDetection()}
				workspaceId="workspace-1"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Connect GitLab" }));

		await waitFor(() => {
			expect(apiMocks.openForgeCliAuthTerminal).toHaveBeenCalledWith(
				"gitlab",
				"gitlab.com",
			);
		});
	});

	it("shows shimmer when the commit button is disabled (mergeable computing)", () => {
		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="disabled"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={gitlabDetection({
					cli: {
						status: "ready",
						provider: "gitlab",
						host: "gitlab.com",
						cliName: "glab",
						login: "liangeqiang",
						version: "1.55.0",
						message: "Connected.",
					},
				})}
				workspaceId="workspace-1"
			/>,
		);

		expect(screen.getByTestId("git-header-shimmer")).toBeInTheDocument();
	});

	it("shows shimmer on the first cold fetch", () => {
		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				isRefreshing
				forgeDetection={gitlabDetection({
					cli: {
						status: "ready",
						provider: "gitlab",
						host: "gitlab.com",
						cliName: "glab",
						login: "liangeqiang",
						version: "1.55.0",
						message: "Connected.",
					},
				})}
				workspaceId="workspace-1"
			/>,
		);

		expect(screen.getByTestId("git-header-shimmer")).toBeInTheDocument();
	});

	it("does not shimmer in idle / busy / done states", () => {
		const { rerender } = renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="MR"
				forgeDetection={gitlabDetection({
					cli: {
						status: "ready",
						provider: "gitlab",
						host: "gitlab.com",
						cliName: "glab",
						login: "liangeqiang",
						version: "1.55.0",
						message: "Connected.",
					},
				})}
				workspaceId="workspace-1"
			/>,
		);
		expect(screen.queryByTestId("git-header-shimmer")).not.toBeInTheDocument();

		for (const state of ["busy", "done", "error"] as const) {
			rerender(
				<GitSectionHeader
					commitButtonMode="merge"
					commitButtonState={state}
					changeRequest={changeRequest}
					changeRequestName="MR"
					forgeDetection={gitlabDetection({
						cli: {
							status: "ready",
							provider: "gitlab",
							host: "gitlab.com",
							cliName: "glab",
							login: "liangeqiang",
							version: "1.55.0",
							message: "Connected.",
						},
					})}
					workspaceId="workspace-1"
				/>,
			);
			expect(
				screen.queryByTestId("git-header-shimmer"),
			).not.toBeInTheDocument();
		}
	});

	it("uses the same connect CTA for GitHub onboarding", async () => {
		apiMocks.getWorkspaceForge.mockResolvedValue(githubDetection());

		renderWithProviders(
			<GitSectionHeader
				commitButtonMode="merge"
				commitButtonState="idle"
				changeRequest={changeRequest}
				changeRequestName="PR"
				forgeDetection={githubDetection()}
				workspaceId="workspace-1"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));

		await waitFor(() => {
			expect(apiMocks.openForgeCliAuthTerminal).toHaveBeenCalledWith(
				"github",
				"github.com",
			);
		});
	});
});
