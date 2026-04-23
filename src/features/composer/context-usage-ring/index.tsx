import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	codexRateLimitsQueryOptions,
	sessionContextUsageQueryOptions,
} from "@/lib/query-client";
import { CONTEXT_USAGE_AUTO_REVEAL_THRESHOLD } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { parseCodexRateLimits, parseContextUsageMeta, ringTier } from "./parse";
import { ContextUsagePopoverContent } from "./popover";

type Props = {
	sessionId: string;
	alwaysShow: boolean;
	disabled?: boolean;
	className?: string;
};

const RING_SIZE = 18;
const RING_STROKE = 1.75;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;
const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 80;

// Reactive: streaming.rs persists at turn end → publishes
// `contextUsageChanged` → ui-sync-bridge invalidates → we re-fetch.
export function ContextUsageRing({
	sessionId,
	alwaysShow,
	disabled,
	className,
}: Props) {
	const { data: meta = null } = useQuery(
		sessionContextUsageQueryOptions(sessionId),
	);
	const display = useMemo(() => parseContextUsageMeta(meta), [meta]);

	// Account-global Codex rate limits — only meaningful when this session
	// is Codex; we still always fetch (single shared query, cheap) so the
	// data is hot when the user does open a Codex popover.
	const { data: rateLimitsRaw = null } = useQuery(
		codexRateLimitsQueryOptions(),
	);
	const codexRateLimits = useMemo(
		() => parseCodexRateLimits(rateLimitsRaw),
		[rateLimitsRaw],
	);

	const visible =
		alwaysShow ||
		(display
			? display.percentage >= CONTEXT_USAGE_AUTO_REVEAL_THRESHOLD
			: false);
	if (!visible) return null;

	const percentage = display?.percentage ?? 0;
	const tier = ringTier(percentage);
	const strokeColor =
		tier === "danger"
			? "stroke-destructive"
			: tier === "warning"
				? "stroke-amber-500"
				: "stroke-foreground/70";
	const offset = RING_CIRCUM * (1 - Math.min(100, percentage) / 100);

	return (
		<HoverCard
			openDelay={HOVER_OPEN_DELAY_MS}
			closeDelay={HOVER_CLOSE_DELAY_MS}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={
						display
							? `Context usage ${percentage.toFixed(0)}%`
							: "Context usage"
					}
					className={cn(
						"flex size-7 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<svg
						width={RING_SIZE}
						height={RING_SIZE}
						viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
						aria-hidden
					>
						<circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={RING_RADIUS}
							fill="none"
							className="stroke-muted"
							strokeWidth={RING_STROKE}
						/>
						<circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={RING_RADIUS}
							fill="none"
							className={cn(strokeColor, "transition-all")}
							strokeWidth={RING_STROKE}
							strokeLinecap="round"
							strokeDasharray={RING_CIRCUM}
							strokeDashoffset={offset}
							transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
						/>
					</svg>
				</button>
			</HoverCardTrigger>
			<HoverCardContent side="top" align="end" className="w-[280px]">
				<ContextUsagePopoverContent
					display={display}
					codexRateLimits={codexRateLimits}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
