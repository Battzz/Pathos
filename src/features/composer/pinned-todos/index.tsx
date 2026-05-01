import {
	Check,
	ChevronDown,
	Circle,
	CircleDot,
	ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ActionRow } from "@/components/action-row";
import type { TodoItem, TodoListPart } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PinnedTodoListProps = {
	part: TodoListPart;
};

export function PinnedTodoList({ part }: PinnedTodoListProps) {
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		setExpanded(false);
	}, [part.id]);

	if (part.items.length === 0) return null;

	const completed = part.items.filter((i) => i.status === "completed").length;
	const total = part.items.length;
	const inProgress = part.items.find((i) => i.status === "in_progress");
	const allDone = completed === total;

	return (
		<div
			data-testid="pinned-todo-list"
			className="pointer-events-auto relative z-0 mx-auto w-[90%] overflow-hidden rounded-t-2xl border border-b-0 border-border/40 bg-sidebar"
		>
			<button
				type="button"
				aria-expanded={expanded}
				aria-label={expanded ? "Collapse tasks" : "Expand tasks"}
				onClick={() => setExpanded((v) => !v)}
				className="block w-full cursor-pointer text-left transition-colors hover:bg-accent/30"
			>
				<ActionRow
					className="border-0 bg-transparent px-3 py-1.5"
					leading={
						<>
							{allDone ? (
								<Check
									className="size-3.5 shrink-0 text-chart-2"
									strokeWidth={2}
									aria-hidden
								/>
							) : (
								<ListChecks
									className="size-3.5 shrink-0 text-muted-foreground/70"
									strokeWidth={1.8}
									aria-hidden
								/>
							)}
							<span className="text-[12px] font-medium tracking-[0.01em] text-foreground tabular-nums">
								Tasks {completed}/{total}
							</span>
							{!expanded && inProgress ? (
								<span className="min-w-0 truncate text-[12px] font-medium tracking-[0.01em] text-muted-foreground/80">
									· {inProgress.text}
								</span>
							) : null}
						</>
					}
					trailing={
						<>
							<ProgressBar completed={completed} total={total} />
							<ChevronDown
								className={cn(
									"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
									expanded && "rotate-180",
								)}
								strokeWidth={1.8}
								aria-hidden
							/>
						</>
					}
				/>
			</button>
			{expanded ? (
				<ul className="flex flex-col border-t border-t-border/30 py-1">
					{part.items.map((item, index) => (
						<TodoRow key={index} item={item} />
					))}
				</ul>
			) : null}
		</div>
	);
}

function ProgressBar({
	completed,
	total,
}: {
	completed: number;
	total: number;
}) {
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	return (
		<div
			className="h-1 w-16 overflow-hidden rounded-full bg-secondary/60"
			aria-hidden
		>
			<div
				className="h-full rounded-full bg-chart-2 transition-[width] duration-200 ease-out"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function TodoRow({ item }: { item: TodoItem }) {
	const Icon =
		item.status === "completed"
			? Check
			: item.status === "in_progress"
				? CircleDot
				: Circle;
	const iconClass =
		item.status === "completed"
			? "text-chart-2"
			: item.status === "in_progress"
				? "text-chart-2"
				: "text-muted-foreground/50";
	const textClass =
		item.status === "completed"
			? "text-muted-foreground/70 line-through decoration-muted-foreground/30"
			: item.status === "in_progress"
				? "text-foreground"
				: "text-muted-foreground";
	return (
		<li className="flex items-center gap-2 px-3 py-1">
			<Icon
				className={cn("size-3 shrink-0", iconClass)}
				strokeWidth={2}
				aria-hidden
			/>
			<span
				className={cn(
					"truncate text-[12px] font-medium tracking-[0.01em]",
					textClass,
				)}
			>
				{item.text}
			</span>
		</li>
	);
}
