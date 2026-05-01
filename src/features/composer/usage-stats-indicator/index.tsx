import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	claudeRateLimitsQueryOptions,
	codexRateLimitsQueryOptions,
	pathosQueryKeys,
} from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
	parseClaudeRateLimits,
	parseCodexRateLimits,
	type RateLimitSnapshotDisplay,
} from "../context-usage-ring/parse";
import { LimitRow } from "../context-usage-ring/popover-parts";

type Props = {
	disabled?: boolean;
	className?: string;
};

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 80;

export function UsageStatsIndicator({ disabled, className }: Props) {
	const { settings, updateSettings } = useSettings();
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const provider = settings.usageStatsProvider;
	const show = settings.showUsageStats;

	const { data: codexRaw = null } = useQuery(
		codexRateLimitsQueryOptions(show && !disabled && provider === "codex"),
	);
	const { data: claudeRaw = null } = useQuery(
		claudeRateLimitsQueryOptions(show && !disabled && provider === "claude"),
	);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next || disabled) return;
			const key =
				provider === "claude"
					? pathosQueryKeys.claudeRateLimits
					: pathosQueryKeys.codexRateLimits;
			void queryClient.refetchQueries({ queryKey: key });
		},
		[provider, disabled, queryClient],
	);

	const cycleProvider = useCallback(() => {
		void updateSettings({
			usageStatsProvider: provider === "claude" ? "codex" : "claude",
		});
	}, [provider, updateSettings]);

	const stats = useMemo(() => {
		if (provider === "claude") return parseClaudeRateLimits(claudeRaw);
		return parseCodexRateLimits(codexRaw);
	}, [provider, claudeRaw, codexRaw]);

	if (!show) return null;

	const remainingLabel = formatRemaining(stats);

	return (
		<HoverCard
			open={open}
			onOpenChange={handleOpenChange}
			openDelay={HOVER_OPEN_DELAY_MS}
			closeDelay={HOVER_CLOSE_DELAY_MS}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					onClick={cycleProvider}
					aria-label={`Usage stats — ${provider === "claude" ? "Claude" : "OpenAI"}`}
					title="Click to switch provider"
					className={cn(
						"flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					{provider === "claude" ? (
						<ClaudeIcon className="size-[13px]" />
					) : (
						<OpenAIIcon className="size-[13px]" />
					)}
					<span className="text-[11px] tabular-nums">{remainingLabel}</span>
				</button>
			</HoverCardTrigger>
			{stats &&
			(stats.primary ||
				stats.secondary ||
				stats.extraWindows.length > 0 ||
				stats.notes.length > 0) ? (
				<HoverCardContent
					side="top"
					align="end"
					sideOffset={6}
					collisionPadding={12}
					className="w-[280px]"
				>
					<div className="flex flex-col gap-3 px-1 py-1">
						<div className="flex items-center justify-between">
							<div className="text-[14px] font-semibold text-foreground">
								Usage Stats
							</div>
							<span
								className="text-muted-foreground"
								aria-label={provider === "claude" ? "Claude" : "OpenAI"}
							>
								{provider === "claude" ? (
									<ClaudeIcon className="size-[13px]" />
								) : (
									<OpenAIIcon className="size-[13px]" />
								)}
							</span>
						</div>
						{stats.primary ||
						stats.secondary ||
						stats.extraWindows.length > 0 ? (
							<div className="flex flex-col gap-2.5">
								{stats.primary ? <LimitRow window={stats.primary} /> : null}
								{stats.secondary ? <LimitRow window={stats.secondary} /> : null}
								{stats.extraWindows.map((entry) => (
									<LimitRow
										key={entry.id}
										window={{ ...entry.window, label: entry.title }}
									/>
								))}
							</div>
						) : null}
						{stats.notes.length > 0 ? (
							<div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5">
								{stats.notes.map((note) => (
									<div
										key={note.label}
										className="flex items-center justify-between text-[12px]"
									>
										<span className="text-muted-foreground">{note.label}</span>
										<span className="font-medium tabular-nums text-foreground">
											{note.value}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				</HoverCardContent>
			) : null}
		</HoverCard>
	);
}

export function formatRemaining(
	stats: RateLimitSnapshotDisplay | null,
): string {
	if (!stats) return "—";
	if (stats.primary) return `${Math.round(stats.primary.leftPercent)}%`;
	const candidates: number[] = [];
	if (stats.secondary) candidates.push(stats.secondary.leftPercent);
	for (const entry of stats.extraWindows) {
		candidates.push(entry.window.leftPercent);
	}
	if (candidates.length === 0) return "—";
	return `${Math.round(Math.min(...candidates))}%`;
}
