import { cn } from "@/lib/utils";
import {
	formatResetsAt,
	formatTokens,
	type RateLimitWindowDisplay,
	type RingTier,
} from "./parse";

/** Top-of-card "Context — 12.4k/1.0M · 8%" row. */
export function UsageHeader({
	used,
	max,
	percentage,
}: {
	used: number;
	max: number;
	percentage: number;
}) {
	return (
		<div className="flex items-center justify-between">
			<div className="text-[14px] font-semibold text-foreground">Context</div>
			<div className="text-[12px] tabular-nums text-muted-foreground">
				{formatTokens(used)}/{formatTokens(max)}
				<span className="mx-1.5 opacity-60">·</span>
				<span className="text-foreground">{formatPercentage(percentage)}</span>
			</div>
		</div>
	);
}

/** Compact percentage: 1 decimal under 10%, integer above. Strips ".0". */
function formatPercentage(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0%";
	if (value < 10) return `${value.toFixed(1).replace(/\.0$/, "")}%`;
	return `${Math.round(value)}%`;
}

/** Full-width progress bar tinted by ring tier. */
export function UsageBar({
	percentage,
	tier,
}: {
	percentage: number;
	tier: RingTier;
}) {
	const barColor =
		tier === "danger"
			? "bg-destructive"
			: tier === "warning"
				? "bg-amber-500"
				: "bg-foreground/70";
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div
				className={cn("h-full transition-[width]", barColor)}
				style={{ width: `${Math.min(100, percentage)}%` }}
			/>
		</div>
	);
}

/** Label + right-aligned value. Used inside breakdown lists. */
export function StatRow({
	label,
	value,
	muted,
}: {
	label: string;
	value: string;
	muted?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between text-[12px]",
				muted && "text-muted-foreground",
			)}
		>
			<span className={cn("truncate", !muted && "text-muted-foreground")}>
				{label}
			</span>
			<span
				className={cn(
					"tabular-nums",
					muted ? "text-muted-foreground" : "text-foreground/80",
				)}
			>
				{value}
			</span>
		</div>
	);
}

/** Thin divider between sub-sections inside the card. */
export function Divider() {
	return <div className="h-px w-full bg-border/60" />;
}

/** Empty placeholder for sessions that haven't run a turn yet. */
export function EmptyBlock() {
	return (
		<div className="px-1 py-2 text-[12px] text-muted-foreground">
			Context usage will appear after the first turn.
		</div>
	);
}

/** One Codex rate-limit row: label + "X% left" + thin bar + reset time. */
export function LimitRow({ window }: { window: RateLimitWindowDisplay }) {
	const muted = window.expired;
	return (
		<div className={cn("flex flex-col gap-1", muted && "opacity-60")}>
			<div className="flex items-center justify-between text-[12px]">
				<span className="text-foreground">{window.label ?? "Limit"}</span>
				<span className="font-medium tabular-nums text-foreground">
					{Math.round(window.leftPercent)}% left
				</span>
			</div>
			<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-foreground/70 transition-[width]"
					style={{ width: `${window.leftPercent}%` }}
				/>
			</div>
			{window.resetsAt !== null ? (
				<div className="text-[11px] text-muted-foreground">
					{window.expired ? "Pending refresh — " : "Resets "}
					{formatResetsAt(window.resetsAt)}
				</div>
			) : null}
		</div>
	);
}
