import { ClaudeBreakdown } from "./breakdowns";
import {
	type CodexRateLimitsDisplay,
	type ContextUsageDisplay,
	ringTier,
} from "./parse";
import {
	Divider,
	EmptyBlock,
	LimitRow,
	UsageBar,
	UsageHeader,
} from "./popover-parts";

type Props = {
	display: ContextUsageDisplay | null;
	/** Only meaningful when `display.source === "codex"`; ignored for
	 *  Claude. Null when Codex hasn't emitted a snapshot yet. */
	codexRateLimits?: CodexRateLimitsDisplay | null;
};

// State dispatch: empty placeholder vs. header + bar (+ source-specific
// extras). Codex gets account-global rate limits below the bar; Claude
// gets the categories breakdown and the auto-compact footer.
export function ContextUsagePopoverContent({
	display,
	codexRateLimits = null,
}: Props) {
	if (!display) return <EmptyBlock />;

	const hasCodexLimits =
		display.source === "codex" &&
		codexRateLimits !== null &&
		(codexRateLimits.primary !== null || codexRateLimits.secondary !== null);

	return (
		<div className="flex flex-col gap-3 px-1 py-1">
			<UsageHeader
				used={display.used}
				max={display.max}
				percentage={display.percentage}
			/>
			<UsageBar
				percentage={display.percentage}
				tier={ringTier(display.percentage)}
			/>

			{display.source === "claude" ? (
				<ClaudeBreakdown display={display} />
			) : null}

			{display.source === "claude" && display.autoCompacts ? (
				<div className="text-[11px] text-muted-foreground">
					Auto-compacts older turns when the window fills.
				</div>
			) : null}

			{hasCodexLimits && codexRateLimits ? (
				<>
					<Divider />
					<div className="flex flex-col gap-2.5">
						{codexRateLimits.primary ? (
							<LimitRow window={codexRateLimits.primary} />
						) : null}
						{codexRateLimits.secondary ? (
							<LimitRow window={codexRateLimits.secondary} />
						) : null}
					</div>
				</>
			) : null}
		</div>
	);
}
