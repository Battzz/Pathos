import { NumberTicker } from "@/components/ui/number-ticker";

type DiffStatsBadgeProps = {
	insertions: number;
	deletions: number;
};

export function DiffStatsBadge({ insertions, deletions }: DiffStatsBadgeProps) {
	if (insertions === 0 && deletions === 0) {
		return null;
	}

	return (
		<span className="flex shrink-0 items-center gap-1 text-[10px] leading-none tabular-nums">
			{insertions > 0 ? (
				<span className="text-chart-2">
					+<NumberTicker value={insertions} className="text-chart-2" />
				</span>
			) : null}
			{deletions > 0 ? (
				<span className="text-destructive">
					-<NumberTicker value={deletions} className="text-destructive" />
				</span>
			) : null}
		</span>
	);
}
