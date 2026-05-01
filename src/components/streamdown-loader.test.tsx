import { render, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { LazyStreamdown } from "./streamdown-loader";

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn(),
}));

describe("LazyStreamdown", () => {
	it("renders inline and display LaTeX with KaTeX", async () => {
		const { container } = render(
			<Suspense fallback={<div>Loading</div>}>
				<LazyStreamdown mode="static">
					{"Inline $E=mc^2$.\n\n$$\\int_0^1 x^2 dx$$"}
				</LazyStreamdown>
			</Suspense>,
		);

		await waitFor(() => {
			expect(container.querySelectorAll(".katex")).toHaveLength(2);
		});
		expect(container.textContent).not.toContain("$$");
	});
});
