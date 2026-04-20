import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Play, RotateCcw, Settings2, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type TerminalHandle,
	TerminalOutput,
} from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { extractPort } from "../detect-urls";
import {
	attach,
	detach,
	type ScriptStatus,
	startScript,
	stopScript,
	TRUNCATION_NOTICE,
} from "../script-store";

type RunTabProps = {
	repoId: string | null;
	workspaceId: string | null;
	runScript: string | null;
	isActive: boolean;
	pendingRun?: boolean;
	onPendingRunHandled?: () => void;
	onOpenSettings: () => void;
	onStatusChange?: (status: ScriptStatus) => void;
	onUrlsChange?: (urls: string[]) => void;
};

/**
 * Compact outlined action button rendered in the Run tab header. Three
 * states driven by how many dev-server URLs have been detected in the
 * script's stdout so far:
 *
 *   - 0 URLs → disabled "Open"
 *   - 1 URL  → "Open:PORT", click opens the URL directly
 *   - 2+ URLs → hover reveals a list of URLs, click an entry to open it
 *
 * URL detection lives in {@link ../detect-urls} and runs chunk-by-chunk
 * in the script store.
 */
export function OpenDevServerButton({ urls }: { urls: string[] }) {
	const handleOpen = useCallback((url: string) => {
		void openUrl(url);
	}, []);

	// No URLs detected yet — keep the button visible but inert, so the
	// control is discoverable while the dev server is still booting.
	if (urls.length === 0) {
		return (
			<Button
				type="button"
				variant="outline"
				size="xs"
				className="text-muted-foreground hover:text-foreground"
				disabled
				aria-label="Open dev server (no URL detected yet)"
			>
				<ExternalLink strokeWidth={1.8} />
				Open
			</Button>
		);
	}

	// Single URL — direct click-to-open, port inlined in the label.
	if (urls.length === 1) {
		const url = urls[0];
		const port = extractPort(url);
		return (
			<Button
				type="button"
				variant="outline"
				size="xs"
				className="text-muted-foreground hover:text-foreground"
				onClick={() => handleOpen(url)}
				aria-label={`Open dev server at ${url}`}
			>
				<ExternalLink strokeWidth={1.8} />
				{port ? `Open:${port}` : "Open"}
			</Button>
		);
	}

	// Multiple URLs — hover reveals a picker. Label stays generic ("Open")
	// since port info would be ambiguous.
	return (
		<HoverCard openDelay={80} closeDelay={120}>
			<HoverCardTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="xs"
					className="text-muted-foreground hover:text-foreground"
					aria-label={`Open dev server (${urls.length} URLs detected)`}
				>
					<ExternalLink strokeWidth={1.8} />
					Open
				</Button>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="end" className="w-auto min-w-48 p-1">
				<div role="menu" className="flex flex-col">
					{urls.map((url) => {
						const port = extractPort(url);
						return (
							<button
								key={url}
								type="button"
								role="menuitem"
								onClick={() => handleOpen(url)}
								className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
							>
								<ExternalLink
									className="size-3 shrink-0 text-muted-foreground"
									strokeWidth={1.8}
								/>
								<span className="truncate">
									{port ? `localhost:${port}` : url}
								</span>
							</button>
						);
					})}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

export function RunTab({
	repoId,
	workspaceId,
	runScript,
	isActive,
	pendingRun,
	onPendingRunHandled,
	onOpenSettings,
	onStatusChange,
	onUrlsChange,
}: RunTabProps) {
	const termRef = useRef<TerminalHandle | null>(null);
	const [status, setStatus] = useState<ScriptStatus>("idle");
	const [hasRun, setHasRun] = useState(false);

	// Notify parent whenever the run-script status transitions so the tab
	// header can conditionally show controls like the Open-dev-server button.
	useEffect(() => {
		onStatusChange?.(status);
	}, [status, onStatusChange]);

	useEffect(() => {
		if (!workspaceId) {
			onUrlsChange?.([]);
			return;
		}

		const existing = attach(workspaceId, "run", {
			onChunk: (data) => termRef.current?.write(data),
			onStatusChange: setStatus,
			onUrlsChange: (urls) => onUrlsChange?.(urls),
		});

		if (existing) {
			setHasRun(true);
			setStatus(existing.status);
			// Replay URLs already detected on this entry so the parent's state
			// mirrors the store the moment the component mounts.
			onUrlsChange?.([...existing.urls]);
			const replay = () => {
				const t = termRef.current;
				if (!t) return;
				t.clear();
				if (existing.truncated) t.write(TRUNCATION_NOTICE);
				for (const chunk of existing.chunks) t.write(chunk);
			};
			if (termRef.current) replay();
			else requestAnimationFrame(replay);
		} else {
			setHasRun(false);
			setStatus("idle");
			onUrlsChange?.([]);
			termRef.current?.clear();
		}

		return () => detach(workspaceId, "run");
	}, [workspaceId]);

	const handleRun = useCallback(() => {
		if (!repoId || !workspaceId) return;
		termRef.current?.clear();
		setStatus("running");
		setHasRun(true);
		startScript(repoId, "run", workspaceId);
	}, [repoId, workspaceId]);

	const handleStop = useCallback(() => {
		if (!repoId || !workspaceId) return;
		stopScript(repoId, "run", workspaceId);
	}, [repoId, workspaceId]);

	// Handle pending run request from Cmd+R shortcut.
	useEffect(() => {
		if (pendingRun && isActive && repoId && runScript?.trim()) {
			onPendingRunHandled?.();
			handleRun();
		}
	}, [pendingRun, isActive, repoId, runScript, handleRun, onPendingRunHandled]);

	const hasScript = !!runScript?.trim();

	return (
		<div
			id="inspector-panel-run"
			role="tabpanel"
			aria-labelledby="inspector-tab-run"
			hidden={!isActive}
			className={cn(
				"relative flex min-h-0 flex-1 flex-col",
				!isActive && "pointer-events-none absolute inset-0 invisible opacity-0",
			)}
		>
			{hasRun ? (
				<>
					<div className="min-h-0 flex-1">
						<TerminalOutput terminalRef={termRef} className="h-full" />
					</div>

					{(status === "running" || status === "exited") && (
						<div className="absolute bottom-3 right-4">
							<Button
								variant={status === "running" ? "destructive" : "secondary"}
								size="sm"
								className="text-[12px] shadow-sm backdrop-blur-sm transition-none"
								onClick={status === "running" ? handleStop : handleRun}
								disabled={status === "exited" && !hasScript}
							>
								{status === "running" ? (
									<Square className="size-3" strokeWidth={2} />
								) : (
									<RotateCcw className="size-3" strokeWidth={2} />
								)}
								{status === "running" ? "Stop" : "Rerun"}
							</Button>
						</div>
					)}
				</>
			) : !hasScript ? (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5 text-[12px]"
						onClick={onOpenSettings}
					>
						<Settings2 className="size-3.5" strokeWidth={1.8} />
						Add run script
					</Button>
					<p className="text-[12px] text-muted-foreground/70">
						Run tests or a development server to test changes in this workspace.
					</p>
				</div>
			) : (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<p className="text-[13px] text-muted-foreground">
						No run script output
					</p>
					<p className="text-[12px] text-muted-foreground/70">
						Run script output will appear here after running.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-1 gap-1.5 text-[12px]"
						onClick={handleRun}
					>
						<Play className="size-3" strokeWidth={2} />
						Run
					</Button>
				</div>
			)}
		</div>
	);
}
