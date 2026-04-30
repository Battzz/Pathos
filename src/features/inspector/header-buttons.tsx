import { useQuery } from "@tanstack/react-query";
import {
	ChevronDownIcon,
	Eye,
	Play,
	PlusIcon,
	RotateCcw,
	Square,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcut } from "@/features/shortcuts/registry";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { ShortcutId } from "@/features/shortcuts/types";
import { loadRepoScripts } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
	type ScriptIconState,
	useScriptStatusDetail,
} from "./hooks/use-script-status";
import { ScriptEditDialog } from "./script-edit-dialog";
import { ScriptOutputView } from "./script-output-popover";
import { ScriptStatusIcon } from "./script-status-icon";
import { startScript, stopScript } from "./script-store";

type ScriptHeaderButtonProps = {
	workspaceId: string | null;
	repoId: string | null;
};

type ScriptKind = "setup" | "run";

function actionLabel(state: ScriptIconState, kind: ScriptKind): string {
	const noun = kind === "setup" ? "setup script" : "run script";
	if (state === "running") return `Stop ${noun}`;
	if (state === "success" || state === "failure") return `Rerun ${noun}`;
	return `Run ${noun}`;
}

function formatStatusLine(
	state: ScriptIconState,
	exitCode: number | null,
	kind: ScriptKind,
): string | null {
	switch (state) {
		case "running":
			return kind === "setup" ? "Running setup…" : "Running…";
		case "success":
			return "Last run completed successfully";
		case "failure":
			return exitCode != null && exitCode !== 0
				? `Last run failed (exit ${exitCode})`
				: "Last run failed";
		default:
			return null;
	}
}

type ScriptDropdownProps = ScriptHeaderButtonProps & {
	kind: ScriptKind;
	label: string;
	defaultIcon: React.ComponentType<{
		className?: string;
		strokeWidth?: number;
	}>;
	shortcutId?: ShortcutId;
};

function ScriptDropdown({
	workspaceId,
	repoId,
	kind,
	label,
	defaultIcon: DefaultIcon,
	shortcutId,
}: ScriptDropdownProps) {
	const { settings } = useSettings();
	const shortcut = shortcutId
		? getShortcut(settings.shortcuts, shortcutId)
		: null;
	const repoScriptsQuery = useQuery({
		queryKey: ["repoScripts", repoId, workspaceId],
		queryFn: () => loadRepoScripts(repoId!, workspaceId),
		enabled: !!repoId,
		staleTime: 0,
	});
	const script =
		kind === "setup"
			? repoScriptsQuery.data?.setupScript
			: repoScriptsQuery.data?.runScript;
	const hasScript = !!script?.trim();
	const { state: status, exitCode } = useScriptStatusDetail(
		workspaceId,
		kind,
		hasScript,
	);
	const showStatus =
		status === "running" || status === "success" || status === "failure";
	const statusLine = formatStatusLine(status, exitCode, kind);

	const [editOpen, setEditOpen] = useState(false);
	const [outputOpen, setOutputOpen] = useState(false);

	return (
		<>
			<Popover open={outputOpen} onOpenChange={setOutputOpen}>
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<PopoverAnchor asChild>
									<Button
										id={`inspector-tab-${kind}`}
										type="button"
										variant="ghost"
										size="xs"
										aria-label={`Open ${label} menu`}
										className="text-muted-foreground hover:text-foreground"
									>
										{showStatus ? (
											<ScriptStatusIcon state={status} className="size-3.5" />
										) : (
											<DefaultIcon className="size-3.5" strokeWidth={1.8} />
										)}
										<span>{label}</span>
										<ChevronDownIcon className="size-3" strokeWidth={2} />
									</Button>
								</PopoverAnchor>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent
							side="bottom"
							sideOffset={4}
							className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
						>
							<span>{label}</span>
							{shortcut ? (
								<InlineShortcutDisplay
									hotkey={shortcut}
									className="text-tooltip-foreground/55"
								/>
							) : null}
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent
						side="bottom"
						align="end"
						sideOffset={4}
						className="min-w-[14rem] p-1"
						// On close, Radix DropdownMenu auto-focuses the trigger button.
						// That button is wrapped in `PopoverAnchor` (not PopoverTrigger),
						// so the Popover treats it as "outside" — when "Show output" is
						// selected the menu closes, focus returns to the trigger, and
						// the popover's onFocusOutside fires and slams it shut.
						// Skipping the focus-restore keeps the popover alive.
						onCloseAutoFocus={(event) => event.preventDefault()}
					>
						<DropdownMenuLabel className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
							{label}
						</DropdownMenuLabel>
						{statusLine ? (
							<div
								role="status"
								aria-live="polite"
								className={cn(
									"flex items-center gap-2 px-2 pb-1 text-[11.5px]",
									status === "failure" &&
										"text-[var(--workspace-pr-closed-accent)]",
									status === "success" &&
										"text-[var(--workspace-pr-open-accent)]",
									status === "running" && "text-muted-foreground",
								)}
							>
								<ScriptStatusIcon state={status} className="size-3" />
								<span className="truncate">{statusLine}</span>
							</div>
						) : null}
						{hasScript ? (
							<>
								<DropdownMenuItem
									onClick={() => {
										if (!repoId || !workspaceId) return;
										if (status === "running") {
											stopScript(repoId, kind, workspaceId);
										} else {
											startScript(repoId, kind, workspaceId);
										}
									}}
									disabled={!repoId || !workspaceId}
									className="flex items-center gap-2"
								>
									{status === "running" ? (
										<Square
											className="size-3.5 text-[var(--workspace-pr-closed-accent)]"
											strokeWidth={2}
										/>
									) : status === "success" || status === "failure" ? (
										<RotateCcw
											className="size-3.5 text-muted-foreground"
											strokeWidth={1.8}
										/>
									) : (
										<DefaultIcon
											className={cn("size-3.5 text-muted-foreground")}
											strokeWidth={1.8}
										/>
									)}
									<span className="flex-1 truncate">
										{actionLabel(status, kind)}
									</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => {
										// Wait for the dropdown's close-on-select cycle to
										// finish before opening the popover. Without this defer,
										// Radix's pointerdown-outside dismissal that closes the
										// menu on the same tick also fires through to the
										// freshly-opened popover and slams it shut.
										requestAnimationFrame(() => setOutputOpen(true));
									}}
									className="flex items-center gap-2"
								>
									<Eye
										className="size-3.5 text-muted-foreground"
										strokeWidth={1.8}
									/>
									<span className="flex-1 truncate">Show output</span>
								</DropdownMenuItem>
							</>
						) : (
							<DropdownMenuItem disabled className="flex items-center gap-2">
								<DefaultIcon
									className="size-3.5 text-muted-foreground/60"
									strokeWidth={1.8}
								/>
								<span className="flex-1 truncate text-muted-foreground/70">
									No {kind} script configured
								</span>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setEditOpen(true)}
							disabled={!repoId}
							className="flex items-center gap-2"
						>
							<PlusIcon
								className="size-3.5 text-muted-foreground"
								strokeWidth={1.8}
							/>
							<span className="flex-1 truncate">
								{hasScript ? `Edit ${kind} script…` : `New ${kind} script…`}
							</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<PopoverContent
					side="bottom"
					align="end"
					sideOffset={6}
					className="w-[28rem]"
				>
					<ScriptOutputView
						workspaceId={workspaceId}
						scriptType={kind}
						hasScript={hasScript}
						headerLabel={label}
					/>
				</PopoverContent>
			</Popover>
			<ScriptEditDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				kind={kind}
				repoId={repoId}
				workspaceId={workspaceId}
			/>
		</>
	);
}

export function SetupHeaderButton(props: ScriptHeaderButtonProps) {
	return (
		<ScriptDropdown
			{...props}
			kind="setup"
			label="Setup"
			defaultIcon={Wrench}
		/>
	);
}

export function RunHeaderButton(props: ScriptHeaderButtonProps) {
	return (
		<ScriptDropdown
			{...props}
			kind="run"
			label="Run"
			defaultIcon={Play}
			shortcutId="script.run"
		/>
	);
}
