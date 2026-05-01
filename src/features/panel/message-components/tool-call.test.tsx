import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantToolCall } from "./tool-call";

vi.mock("@/components/ai/code-block", () => ({
	CodeBlock: ({
		code,
		language,
	}: {
		code: string;
		language?: string | null;
	}) => (
		<pre data-language={language ?? ""} data-testid="code-block">
			{code}
		</pre>
	),
}));

afterEach(() => {
	cleanup();
});

describe("AssistantToolCall apply_patch", () => {
	it("defaults multi-file edits to collapsed and suppresses generic patch text when expanded", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="apply_patch"
				args={{
					changes: [
						{ path: "/src/request-parser.ts", diff: "+line one" },
						{ path: "/src/data_dir.rs", diff: "+line two" },
						{ path: "/src/App.tsx", diff: "+line three" },
					],
				}}
				result="Patch applied"
			/>,
		);

		// Default: collapsed.
		expect(screen.queryByText("request-parser.ts")).not.toBeInTheDocument();
		expect(screen.queryByText("data_dir.rs")).not.toBeInTheDocument();
		expect(screen.queryByText("App.tsx")).not.toBeInTheDocument();

		const details = container.querySelector(
			"details",
		) as HTMLDetailsElement | null;
		expect(details).not.toBeNull();

		// Expand: file list appears, generic "Patch applied" stays suppressed.
		details!.open = true;
		fireEvent(details!, new Event("toggle"));

		expect(screen.queryByText("Patch applied")).not.toBeInTheDocument();
		expect(screen.getByText("request-parser.ts")).toBeInTheDocument();
		expect(screen.getByText("data_dir.rs")).toBeInTheDocument();
		expect(screen.getByText("App.tsx")).toBeInTheDocument();

		// Collapse again: file list disappears.
		details!.open = false;
		fireEvent(details!, new Event("toggle"));

		expect(screen.queryByText("request-parser.ts")).not.toBeInTheDocument();
		expect(screen.queryByText("data_dir.rs")).not.toBeInTheDocument();
		expect(screen.queryByText("App.tsx")).not.toBeInTheDocument();
	});
});

describe("AssistantToolCall default-collapsed", () => {
	it("renders detected Bash file reads without the raw command chip", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Bash"
				args={{ command: `/bin/zsh -lc "sed -n '1,220p' README.md"` }}
			/>,
		);

		expect(screen.getByText("Read")).toBeInTheDocument();
		expect(screen.getByText("README.md")).toBeInTheDocument();
		expect(container.querySelector("code")).toBeNull();
		expect(screen.queryByText(/sed -n/)).not.toBeInTheDocument();

		fireEvent.mouseEnter(screen.getByText("README.md"));
		expect(screen.getByRole("tooltip")).toHaveTextContent(
			`/bin/zsh -lc "sed -n '1,220p' README.md"`,
		);
	});

	it("keeps a streaming Read collapsed until the user opens it", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Read"
				args={{ file_path: "/src/App.tsx" }}
				streamingStatus="in_progress"
			/>,
		);

		const details = container.querySelector("details");
		expect(details).not.toBeNull();
		expect(details!.open).toBe(false);
	});

	it("keeps a finished Bash with output collapsed by default", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Bash"
				args={{ command: "ls -la" }}
				result={"total 8\ndrwxr-xr-x  3 user staff   96 Jan  1 00:00 .\n"}
			/>,
		);

		const details = container.querySelector("details");
		expect(details).not.toBeNull();
		expect(details!.open).toBe(false);
		// Output content should not be rendered until the user opens the details.
		expect(screen.queryByText(/drwxr-xr-x/)).not.toBeInTheDocument();
	});

	it("syntax-highlights expanded Read output using the file extension", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Read"
				args={{ file_path: "/src/features/panel/tool-call.tsx" }}
				result={"export function Example() {\n\treturn <div />;\n}\n"}
			/>,
		);

		expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();

		const details = container.querySelector("details");
		expect(details).not.toBeNull();
		details!.open = true;
		fireEvent(details!, new Event("toggle"));

		const codeBlock = screen.getByTestId("code-block");
		expect(codeBlock).toHaveAttribute("data-language", "tsx");
		expect(codeBlock).toHaveTextContent("export function Example");
	});

	it("syntax-highlights expanded Bash output when it is summarized as a file read", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Bash"
				args={{ command: "sed -n '1,120p' src/features/panel/tool-call.tsx" }}
				result={"export function Example() {\n\treturn <div />;\n}\n"}
			/>,
		);

		const details = container.querySelector("details");
		expect(details).not.toBeNull();
		details!.open = true;
		fireEvent(details!, new Event("toggle"));

		const codeBlock = screen.getByTestId("code-block");
		expect(codeBlock).toHaveAttribute("data-language", "tsx");
		expect(codeBlock).toHaveTextContent("export function Example");
	});

	it("syntax-highlights expanded Write content using the target file extension", () => {
		const { container } = render(
			<AssistantToolCall
				toolName="Write"
				args={{
					file_path: "/src/lib/config.json",
					content: '{\n\t"name": "pathos"\n}\n',
				}}
				result="File written successfully"
			/>,
		);

		const details = container.querySelector("details");
		expect(details).not.toBeNull();
		details!.open = true;
		fireEvent(details!, new Event("toggle"));

		const codeBlock = screen.getByTestId("code-block");
		expect(codeBlock).toHaveAttribute("data-language", "json");
		expect(codeBlock).toHaveTextContent('"name": "pathos"');
		expect(
			screen.queryByText("File written successfully"),
		).not.toBeInTheDocument();
	});
});
