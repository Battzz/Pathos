import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsButton } from ".";

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
