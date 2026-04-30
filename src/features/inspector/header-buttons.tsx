import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, Play, PlusIcon, Wrench } from "lucide-react";
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
import { useScriptStatus } from "./hooks/use-script-status";
import { ScriptEditDialog } from "./script-edit-dialog";
import { ScriptStatusIcon } from "./script-status-icon";

const OPEN_INSPECTOR_TAB_EVENT = "pathos:open-inspector-tab";

export type OpenInspectorTabDetail = { tab: "setup" | "run" };

type ScriptHeaderButtonProps = {
	workspaceId: string | null;
	repoId: string | null;
};

function dispatchOpen(tab: "setup" | "run") {
	window.dispatchEvent(
		new CustomEvent<OpenInspectorTabDetail>(OPEN_INSPECTOR_TAB_EVENT, {
			detail: { tab },
		}),
	);
}

type ScriptKind = "setup" | "run";

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
	const status = useScriptStatus(workspaceId, kind, hasScript);
	const showStatus =
		status === "running" || status === "success" || status === "failure";

	const [editOpen, setEditOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
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
				>
					<DropdownMenuLabel className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
						{label}
					</DropdownMenuLabel>
					{hasScript ? (
						<DropdownMenuItem
							onClick={() => dispatchOpen(kind)}
							className="flex items-center gap-2"
						>
							{showStatus ? (
								<ScriptStatusIcon state={status} className="size-3.5" />
							) : (
								<DefaultIcon
									className={cn("size-3.5 text-muted-foreground")}
									strokeWidth={1.8}
								/>
							)}
							<span className="flex-1 truncate">
								{kind === "setup" ? "Setup script" : "Run script"}
							</span>
						</DropdownMenuItem>
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

export { OPEN_INSPECTOR_TAB_EVENT };
