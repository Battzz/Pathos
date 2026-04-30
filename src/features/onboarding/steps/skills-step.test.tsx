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
	getCliStatus: vi.fn(),
	getPathosSkillsStatus: vi.fn(),
	installCli: vi.fn(),
	installPathosSkills: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		getCliStatus: apiMocks.getCliStatus,
		getPathosSkillsStatus: apiMocks.getPathosSkillsStatus,
		installCli: apiMocks.installCli,
		installPathosSkills: apiMocks.installPathosSkills,
	};
});

vi.mock("sonner", () => ({
	toast: vi.fn(),
}));

import { SkillsStep } from "./skills-step";

describe("SkillsStep", () => {
	beforeEach(() => {
		apiMocks.getCliStatus.mockReset();
		apiMocks.getPathosSkillsStatus.mockReset();
		apiMocks.installCli.mockReset();
		apiMocks.installPathosSkills.mockReset();
		apiMocks.getPathosSkillsStatus.mockResolvedValue({
			installed: false,
			claude: false,
			codex: false,
			command:
				"npx --yes skills add dohooo/pathos/.codex/skills/pathos-cli -g -s pathos-cli -y --copy -a claude-code -a codex",
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows Ready when the Pathos CLI is already installed", async () => {
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/pathos-dev",
			buildMode: "development",
			installState: "managed",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const cliItem = screen.getByRole("group", { name: "Pathos CLI" });

		await waitFor(() => {
			expect(within(cliItem).getByText("Ready")).toBeInTheDocument();
		});
		expect(
			within(cliItem).queryByRole("button", { name: "Set up" }),
		).not.toBeInTheDocument();
		expect(apiMocks.installCli).not.toHaveBeenCalled();
	});

	it("installs the Pathos CLI from the setup item", async () => {
		const user = userEvent.setup();
		apiMocks.getCliStatus.mockResolvedValue({
			installed: false,
			installPath: null,
			buildMode: "development",
			installState: "missing",
		});
		apiMocks.installCli.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/pathos-dev",
			buildMode: "development",
			installState: "managed",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const cliItem = screen.getByRole("group", { name: "Pathos CLI" });

		await user.click(within(cliItem).getByRole("button", { name: "Set up" }));

		await waitFor(() => {
			expect(apiMocks.installCli).toHaveBeenCalledTimes(1);
		});
		expect(within(cliItem).getByText("Ready")).toBeInTheDocument();
		expect(
			within(cliItem).queryByRole("button", { name: "Set up" }),
		).not.toBeInTheDocument();
	});

	it("installs Pathos skills from the setup item", async () => {
		const user = userEvent.setup();
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/pathos-dev",
			buildMode: "development",
			installState: "managed",
		});
		apiMocks.installPathosSkills.mockResolvedValue({
			installed: true,
			claude: true,
			codex: false,
			command:
				"npx --yes skills add dohooo/pathos/.codex/skills/pathos-cli -g -s pathos-cli -y --copy -a claude-code",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const skillsItem = screen.getByRole("group", {
			name: "Pathos Skills (Beta)",
		});

		await user.click(
			within(skillsItem).getByRole("button", { name: "Set up" }),
		);

		await waitFor(() => {
			expect(apiMocks.installPathosSkills).toHaveBeenCalledTimes(1);
		});
		expect(within(skillsItem).getByText("Ready")).toBeInTheDocument();
	});

	it("shows the unified failure hint when skills setup throws", async () => {
		const user = userEvent.setup();
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/pathos-dev",
			buildMode: "development",
			installState: "managed",
		});
		apiMocks.installPathosSkills.mockRejectedValue(
			new Error("Pathos skills setup failed with a long stack trace."),
		);

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const skillsItem = screen.getByRole("group", {
			name: "Pathos Skills (Beta)",
		});

		await user.click(
			within(skillsItem).getByRole("button", { name: "Set up" }),
		);

		await waitFor(() => {
			expect(
				within(skillsItem).getByText(/something went wrong/i),
			).toBeInTheDocument();
		});
		expect(within(skillsItem).getByText(/don't worry/i)).toBeInTheDocument();
		expect(
			within(skillsItem).queryByText(/long stack trace/i),
		).not.toBeInTheDocument();
	});
});
