import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Shared step-switcher tabs for interaction panels with multiple steps
 * (AskUserQuestion questions, FormElicitation fields). Renders nothing
 * when there's only one step.
 *
 * Incomplete steps dim to 55% opacity; required steps get a `*` suffix.
 * The active step's highlight is delegated to shadcn `TabsTrigger` defaults.
 */
export type InteractionStepTabItem = {
	key: string;
	label: ReactNode;
	/** Whether the step is answered / validated. Incomplete steps dim out. */
	complete: boolean;
	/** When true, append a `*` suffix to the label. */
	required?: boolean;
};

type InteractionStepTabsProps = {
	items: InteractionStepTabItem[];
	value: string;
	onChange: (key: string) => void;
	disabled?: boolean;
	/** Override the default `px-1 pb-2` wrapper padding. */
	className?: string;
};

export function InteractionStepTabs({
	items,
	value,
	onChange,
	disabled = false,
	className,
}: InteractionStepTabsProps) {
	if (items.length <= 1) return null;

	return (
		<div className={cn("px-1 pb-2", className)}>
			<Tabs value={value} onValueChange={onChange}>
				<TabsList className="h-auto flex-wrap gap-0.5 p-0.5">
					{items.map((item) => (
						<TabsTrigger
							key={item.key}
							value={item.key}
							disabled={disabled}
							className={cn(
								"h-6 gap-1.5 px-2 text-xs",
								!item.complete && "text-muted-foreground/70",
							)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"size-1.5 shrink-0 rounded-full transition-colors",
									item.complete
										? "bg-foreground/70"
										: "bg-transparent ring-1 ring-inset ring-border/60",
								)}
							/>
							{item.required ? (
								<span>
									{item.label}
									<span className="ml-0.5 text-muted-foreground">*</span>
								</span>
							) : (
								item.label
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
		</div>
	);
}
