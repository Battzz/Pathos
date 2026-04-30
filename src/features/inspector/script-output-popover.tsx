import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { stripAnsi } from "./detect-urls";
import {
	type ScriptIconState,
	useScriptStatusDetail,
} from "./hooks/use-script-status";
import { ScriptStatusIcon } from "./script-status-icon";
import {
	getScriptState,
	subscribeChunks,
	subscribeStatus,
} from "./script-store";

/** Cap on the number of trailing lines kept in the popover view. */
const MAX_LINES = 200;

function trimToLines(text: string, max: number): string {
	const lines = text.split("\n");
	if (lines.length <= max) return text;
	return lines.slice(-max).join("\n");
}

function snapshotText(
	workspaceId: string,
	scriptType: "setup" | "run",
): string {
	const state = getScriptState(workspaceId, scriptType);
	if (!state) return "";
	return trimToLines(stripAnsi(state.chunks.join("")), MAX_LINES);
}

type ScriptOutputViewProps = {
	workspaceId: string | null;
	scriptType: "setup" | "run";
	hasScript: boolean;
	headerLabel: string;
};

/**
 * Compact terminal-output mirror rendered inside the header dropdown's
 * "Show output" popover. Subscribes to {@link subscribeChunks} for live
 * output and re-snapshots on status transitions (which clear the entry on
 * fresh runs). ANSI escapes are stripped — the goal here is a glanceable
 * read-only summary, not full terminal interactivity. The actual xterm
 * with input still lives in the right-bar Setup/Run panels.
 */
export function ScriptOutputView({
	workspaceId,
	scriptType,
	hasScript,
	headerLabel,
}: ScriptOutputViewProps) {
	const [text, setText] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const { state: status, exitCode } = useScriptStatusDetail(
		workspaceId,
		scriptType,
		hasScript,
	);

	useEffect(() => {
		if (!workspaceId) {
			setText("");
			return;
		}

		setText(snapshotText(workspaceId, scriptType));

		const unsubChunk = subscribeChunks(workspaceId, scriptType, (data) => {
			setText((prev) => trimToLines(prev + stripAnsi(data), MAX_LINES));
		});

		// Status transitions can imply a fresh entry (running on a new run
		// resets the chunks). Re-snapshot so we don't keep stale text.
		const unsubStatus = subscribeStatus(workspaceId, scriptType, () => {
			setText(snapshotText(workspaceId, scriptType));
		});

		return () => {
			unsubChunk();
			unsubStatus();
		};
	}, [workspaceId, scriptType]);

	// Keep the latest output visible — pin scroll to the bottom whenever
	// the buffered text changes.
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [text]);

	const footer = footerLabel(status, exitCode, scriptType);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					{headerLabel} output
				</span>
				{footer ? (
					<span
						className={cn(
							"flex items-center gap-1 text-[11px]",
							status === "failure" &&
								"text-[var(--workspace-pr-closed-accent)]",
							status === "success" && "text-[var(--workspace-pr-open-accent)]",
							status === "running" && "text-muted-foreground",
						)}
					>
						<ScriptStatusIcon state={status} className="size-3" />
						<span>{footer}</span>
					</span>
				) : null}
			</div>
			<div
				ref={scrollRef}
				className="h-64 w-full overflow-auto rounded-md border border-border/60 bg-app-base p-2 font-mono text-[11px] leading-snug text-foreground/85 whitespace-pre-wrap"
			>
				{text ? (
					text
				) : (
					<span className="text-muted-foreground">
						{hasScript
							? "No output yet — run the script to see live output here."
							: "No script configured."}
					</span>
				)}
			</div>
		</div>
	);
}

function footerLabel(
	state: ScriptIconState,
	exitCode: number | null,
	kind: "setup" | "run",
): string | null {
	switch (state) {
		case "running":
			return kind === "setup" ? "Running setup…" : "Running…";
		case "success":
			return "Exited cleanly";
		case "failure":
			return exitCode != null && exitCode !== 0
				? `Failed (exit ${exitCode})`
				: "Failed";
		default:
			return null;
	}
}
