import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BaseTooltip } from "./base-tooltip";
import { TooltipProvider } from "./tooltip";

describe("BaseTooltip", () => {
  it("applies compact styling by default", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <BaseTooltip content={<span>Add repository</span>}>
          <button type="button">Trigger</button>
        </BaseTooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: "Trigger" }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-side="top"]')).not.toBeNull();
    });

    const tooltip = document.body.querySelector('[data-side="top"]');

    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveTextContent("Add repository");
    expect(tooltip).toHaveClass("rounded-md");
    expect(tooltip).toHaveClass("px-1.5");
    expect(tooltip).toHaveClass("py-1");
    expect(tooltip).toHaveClass("text-[11px]");
    expect(tooltip).toHaveClass("leading-none");
  });
});
