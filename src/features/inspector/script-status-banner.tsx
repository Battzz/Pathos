import { cn } from "@/lib/utils";
import type { ScriptIconState } from "./hooks/use-script-status";
import { ScriptStatusIcon } from "./script-status-icon";

type ScriptStatusBannerProps = {
	state: ScriptIconState;
	exitCode: number | null;
	scriptKind: "setup" | "run";
	className?: string;
};

function bannerLabel(
	state: ScriptIconState,
	exitCode: number | null,
	scriptKind: "setup" | "run",
): string | null {
	switch (state) {
		case "running":
			return scriptKind === "setup" ? "Running setup…" : "Running…";
		case "success":
			return scriptKind === "setup"
				? "Setup completed successfully"
				: "Exited successfully";
		case "failure":
			return exitCode != null && exitCode !== 0
				? `Failed (exit ${exitCode})`
				: "Failed";
		default:
			return null;
	}
}

/**
 * Thin status strip rendered above the terminal output in the Setup / Run
 * panels. Reuses {@link ScriptStatusIcon} so the running-spinner / success /
 * failure semantics match the dropdown header buttons. Returns `null` for
 * `idle` / `no-script` so the banner only appears once a run has started.
 */
export function ScriptStatusBanner({
	state,
	exitCode,
	scriptKind,
	className,
}: ScriptStatusBannerProps) {
	const label = bannerLabel(state, exitCode, scriptKind);
	if (!label) return null;

	const tone =
		state === "failure"
			? "text-[var(--workspace-pr-closed-accent)]"
			: state === "success"
				? "text-[var(--workspace-pr-open-accent)]"
				: "text-muted-foreground";

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/20 px-3 py-1 text-[11px] font-medium",
				tone,
				className,
			)}
		>
			<ScriptStatusIcon state={state} className="size-3" />
			<span className="truncate">{label}</span>
		</div>
	);
}
