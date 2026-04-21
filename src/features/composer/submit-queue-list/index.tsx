/**
 * Vertical stack of queued follow-up messages, rendered above the
 * composer when `followUpBehavior === 'queue'` is active and the user
 * has typed additional messages while a turn is still running. Stacked
 * `ActionRow`s (the same primitive the auto-close banner uses) keep
 * the visual continuous-card look: each row's border collapses into
 * the next, and the bottom row overlaps the composer top edge via
 * `-mb-px`.
 *
 * Every row offers two actions: steer (convert this queued entry into
 * a `steerAgentStream` call and send now, interrupting the active
 * turn), or trash (remove from the local queue — no provider side
 * effect).
 *
 * Renders nothing when the queue for the given session is empty — the
 * composer's outer layout doesn't reserve space.
 */

import { Clock, CornerDownLeft, Trash2 } from "lucide-react";
import { ActionRow } from "@/components/action-row";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QueuedSubmit } from "@/lib/use-submit-queue";
import { cn } from "@/lib/utils";

export type SubmitQueueListProps = {
	items: readonly QueuedSubmit[];
	onSteer: (id: string) => void;
	onRemove: (id: string) => void;
	disabled?: boolean;
};

export function SubmitQueueList({
	items,
	onSteer,
	onRemove,
	disabled,
}: SubmitQueueListProps) {
	if (items.length === 0) return null;
	return (
		<div className="relative z-0 mx-auto -mb-px w-[90%] overflow-hidden rounded-t-2xl border border-b-0 border-secondary/80 bg-background">
			{items.map((item, idx) => (
				<QueueRow
					key={item.id}
					item={item}
					isLast={idx === items.length - 1}
					onSteer={() => onSteer(item.id)}
					onRemove={() => onRemove(item.id)}
					disabled={disabled}
				/>
			))}
		</div>
	);
}

function QueueRow({
	item,
	isLast,
	onSteer,
	onRemove,
	disabled,
}: {
	item: QueuedSubmit;
	isLast: boolean;
	onSteer: () => void;
	onRemove: () => void;
	disabled?: boolean;
}) {
	const preview = item.payload.prompt.trim();
	return (
		<ActionRow
			className={cn(
				"border-0 bg-transparent px-3 py-1 pb-0.5 pt-0.5",
				!isLast && "border-b border-b-border/30",
			)}
			leading={
				<>
					<Clock
						className="size-3.5 shrink-0 text-muted-foreground/70"
						strokeWidth={1.8}
						aria-hidden
					/>
					<span className="truncate text-[12px] font-medium tracking-[0.01em] text-foreground">
						{preview}
					</span>
				</>
			}
			trailing={
				<>
					<Button
						type="button"
						aria-label="Steer now"
						variant="ghost"
						size="sm"
						disabled={disabled}
						onClick={onSteer}
						className="h-7 gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
					>
						<CornerDownLeft
							className="size-[13px] shrink-0"
							strokeWidth={1.8}
						/>
						<span>Steer</span>
					</Button>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								aria-label="Remove from queue"
								variant="ghost"
								size="icon-xs"
								disabled={disabled}
								onClick={onRemove}
								className="size-7 rounded-md text-muted-foreground hover:text-destructive"
							>
								<Trash2 className="size-3.5" strokeWidth={1.8} />
							</Button>
						</TooltipTrigger>
						<TooltipContent
							side="top"
							sideOffset={6}
							className="flex h-[22px] items-center rounded-md px-1.5 text-[11px] leading-none"
						>
							<span>Remove from queue</span>
						</TooltipContent>
					</Tooltip>
				</>
			}
		/>
	);
}
