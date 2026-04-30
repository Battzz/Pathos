import {
	Check,
	ChevronDown,
	ChevronUp,
	Circle,
	CircleDot,
	ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
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
			className="pointer-events-auto relative z-0 mx-auto w-[90%] overflow-hidden rounded-t-2xl border border-b-0 border-secondary/80 bg-background"
		>
			<button
				type="button"
				aria-expanded={expanded}
				aria-label={expanded ? "Collapse tasks" : "Expand tasks"}
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/30"
			>
				<ListChecks
					className={cn(
						"size-3.5 shrink-0",
						allDone ? "text-chart-2" : "text-muted-foreground/80",
					)}
					strokeWidth={1.8}
					aria-hidden
				/>
				<span className="text-[12px] font-medium tracking-[0.01em] text-foreground">
					Tasks {completed}/{total}
				</span>
				{!expanded && inProgress ? (
					<span className="min-w-0 truncate text-[12px] text-muted-foreground">
						· {inProgress.text}
					</span>
				) : null}
				<div className="ml-auto flex items-center gap-2">
					<ProgressBar completed={completed} total={total} />
					{expanded ? (
						<ChevronUp
							className="size-3.5 text-muted-foreground"
							strokeWidth={1.8}
							aria-hidden
						/>
					) : (
						<ChevronDown
							className="size-3.5 text-muted-foreground"
							strokeWidth={1.8}
							aria-hidden
						/>
					)}
				</div>
			</button>
			{expanded ? (
				<ul className="flex flex-col gap-0.5 border-t border-secondary/60 px-3 py-2 text-[13px] leading-6">
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
				: "text-muted-foreground/60";
	const textClass =
		item.status === "completed"
			? "text-muted-foreground line-through"
			: "text-foreground";
	return (
		<li className="flex items-center gap-1.5">
			<Icon className={cn("size-3 shrink-0", iconClass)} strokeWidth={1.8} />
			<span className={textClass}>{item.text}</span>
		</li>
	);
}
