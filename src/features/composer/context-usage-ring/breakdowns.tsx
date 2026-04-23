import type { ClaudeDisplay } from "./parse";
import { StatRow } from "./popover-parts";

/** Claude per-category list, sorted desc by tokens. */
export function ClaudeBreakdown({ display }: { display: ClaudeDisplay }) {
	if (display.categories.length === 0) return null;
	return (
		<ul className="flex flex-col gap-1.5">
			{display.categories.map((cat) => (
				<li key={cat.name}>
					<StatRow label={cat.name} value={`${cat.percentage.toFixed(1)}%`} />
				</li>
			))}
		</ul>
	);
}

// Codex deliberately has no breakdown component. The `last.*` numbers are
// useful but the meaning of "current context fill" depends on Codex's
// prefix-cache semantics in ways we haven't fully verified — showing them
// invites users to read precision into numbers we can't guarantee. The
// header (`X / Y`) and bar are conservative enough on their own.
