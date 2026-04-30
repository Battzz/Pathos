import { useEffect, useState } from "react";
import {
	getScriptState,
	type ScriptStatus,
	subscribeStatus,
} from "../script-store";

/**
 * Condensed per-tab status label used to choose which status icon to render
 * next to the Setup / Run tab text.
 *
 * - `no-script`  — repository has no script configured for this slot
 * - `idle`       — script configured but has not run in this workspace yet
 * - `running`    — script currently executing
 * - `success`    — last run exited cleanly (exit code 0)
 * - `failure`    — last run crashed or exited non-zero
 */
export type ScriptIconState =
	| "no-script"
	| "idle"
	| "running"
	| "success"
	| "failure";

function deriveState(
	hasScript: boolean,
	status: ScriptStatus,
	exitCode: number | null,
): ScriptIconState {
	if (!hasScript) return "no-script";
	if (status === "running") return "running";
	if (status === "exited") return exitCode === 0 ? "success" : "failure";
	return "idle";
}

export type ScriptStatusDetail = {
	state: ScriptIconState;
	exitCode: number | null;
};

/**
 * Subscribes to the shared script-store for live status of a script slot
 * (setup / run) in a given workspace. Returns the icon state plus the last
 * known exit code so callers can render richer status copy (e.g. dropdown
 * "Last run: failed (exit 1)" rows).
 */
export function useScriptStatusDetail(
	workspaceId: string | null,
	scriptType: "setup" | "run",
	hasScript: boolean,
): ScriptStatusDetail {
	const [status, setStatus] = useState<ScriptStatus>("idle");
	const [exitCode, setExitCode] = useState<number | null>(null);

	useEffect(() => {
		if (!workspaceId) {
			setStatus("idle");
			setExitCode(null);
			return;
		}

		// Seed from whatever is already running / previously exited, so the
		// icon is correct even when mounted after the run started.
		const existing = getScriptState(workspaceId, scriptType);
		setStatus(existing?.status ?? "idle");
		setExitCode(existing?.exitCode ?? null);

		return subscribeStatus(workspaceId, scriptType, (next, code) => {
			setStatus(next);
			setExitCode(code);
		});
	}, [workspaceId, scriptType]);

	return { state: deriveState(hasScript, status, exitCode), exitCode };
}

/**
 * Convenience wrapper around {@link useScriptStatusDetail} that returns just
 * the icon state — used where the exit code isn't needed.
 */
export function useScriptStatus(
	workspaceId: string | null,
	scriptType: "setup" | "run",
	hasScript: boolean,
): ScriptIconState {
	return useScriptStatusDetail(workspaceId, scriptType, hasScript).state;
}
