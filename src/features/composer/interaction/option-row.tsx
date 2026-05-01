import { Check, Circle, CircleDot } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared clickable row for option-style selection (radio / checkbox),
 * used by:
 *   - FormElicitationPanel — boolean Yes/No, single-select, multi-select rows
 *   - AskUserQuestionPanel — question options (single- or multi-select)
 *
 * The "Other" rows with embedded text inputs are NOT covered here (those
 * have custom inline layouts); this primitive targets pure label rows.
 */
type InteractionOptionRowProps = {
	selected: boolean;
	/** `radio` = single-choice (Circle/CircleDot); `checkbox` = multi (Check/empty-box). */
	indicator: "radio" | "checkbox";
	label: ReactNode;
	description?: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	/** Extra content appended after the main row (e.g. AskQ option preview). */
	children?: ReactNode;
	className?: string;
	"data-ask-option-row"?: string;
};

export function InteractionOptionRow({
	selected,
	indicator,
	label,
	description,
	onClick,
	disabled = false,
	children,
	className,
	...dataAttrs
}: InteractionOptionRowProps) {
	return (
		<div
			className={cn(
				"group/option rounded-md px-2 py-1.5 transition-colors",
				selected
					? "bg-accent/60 ring-1 ring-inset ring-border/50"
					: "hover:bg-accent/30",
				disabled && "opacity-60",
				className,
			)}
			{...dataAttrs}
		>
			<button
				type="button"
				disabled={disabled}
				aria-pressed={selected}
				onClick={onClick}
				className="flex w-full cursor-pointer items-start gap-2 text-left disabled:cursor-not-allowed"
			>
				<span className="mt-0.5 shrink-0 text-muted-foreground">
					{indicator === "radio" ? (
						selected ? (
							<CircleDot
								className="size-3.5 text-foreground"
								strokeWidth={1.9}
							/>
						) : (
							<Circle
								className="size-3.5 text-muted-foreground/55 transition-colors group-hover/option:text-muted-foreground/80"
								strokeWidth={1.9}
							/>
						)
					) : selected ? (
						<span className="flex size-3.5 items-center justify-center rounded-[5px] bg-foreground/85 text-background">
							<Check className="size-2.5" strokeWidth={3} />
						</span>
					) : (
						<span className="block size-3.5 rounded-[5px] bg-background/80 ring-1 ring-inset ring-border/55 transition-colors group-hover/option:ring-border" />
					)}
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-[13px] font-medium text-foreground">{label}</p>
					{description ? (
						<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
			</button>
			{children}
		</div>
	);
}
