import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffStatsBadge } from "./diff-stats-badge";

describe("DiffStatsBadge", () => {
	it("renders animated insertion and deletion totals", () => {
		render(<DiffStatsBadge insertions={500} deletions={200} />);

		expect(screen.getByText("500")).toHaveClass("text-chart-2");
		expect(screen.getByText("200")).toHaveClass("text-destructive");
		expect(screen.getByText("+")).toBeInTheDocument();
		expect(screen.getByText("-")).toBeInTheDocument();
	});
});
