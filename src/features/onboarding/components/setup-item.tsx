import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReadyStatus } from "./ready-status";

/**
 * One row in an editorial setup list (agents, CLIs, skills, etc.).
 * Renders as a stacked entry with a hairline divider — no card, no fill —
 * to match the printed-page feel of the welcome screen. Status sits on the
 * right as either a typographic "Ready" badge or a monospace `Set up →` action.
 */
export function SetupItem({
	icon,
	label,
	description,
	actionLabel = "Set up",
	onAction,
	disabled = false,
	busy = false,
	ready = false,
	error,
	className,
}: {
	icon: ReactNode;
	label: string;
	description: ReactNode;
	actionLabel?: string;
	onAction?: () => void;
	disabled?: boolean;
	busy?: boolean;
	ready?: boolean;
	error?: ReactNode;
	className?: string;
}) {
	const hasError = Boolean(error);
	return (
		<div
			role="group"
			aria-label={label}
			className={cn(
				"group/setup grid grid-cols-[auto_1fr_auto] items-center gap-6 border-t border-border/30 py-5 first:border-t-0",
				className,
			)}
		>
			<div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/45 bg-foreground/[0.015] text-foreground/85 transition-colors group-hover/setup:border-foreground/30">
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<div className="font-display text-[22px] leading-none text-foreground/95">
					{label}
				</div>
				<p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted-foreground/85">
					{description}
				</p>
				<div
					aria-hidden={!hasError}
					className={cn(
						"grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(.22,.82,.2,1)]",
						hasError
							? "mt-2 grid-rows-[1fr] opacity-100"
							: "mt-0 grid-rows-[0fr] opacity-0",
					)}
				>
					<div className="overflow-hidden">
						<p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-destructive/85">
							{error}
						</p>
					</div>
				</div>
			</div>
			<div className="flex shrink-0 items-center">
				{ready ? (
					<ReadyStatus />
				) : (
					<button
						type="button"
						onClick={onAction}
						disabled={disabled || busy}
						className="group/action inline-flex cursor-pointer items-center gap-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.32em] text-foreground/80 transition-colors duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:text-foreground disabled:cursor-default disabled:opacity-50"
					>
						{busy ? (
							<Loader2 className="size-3 animate-spin" strokeWidth={2} />
						) : null}
						<span className="transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/action:translate-x-0.5">
							{actionLabel}
						</span>
						{!busy ? (
							<ArrowRight
								className="size-3 transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/action:translate-x-1"
								strokeWidth={1.5}
							/>
						) : null}
					</button>
				)}
			</div>
		</div>
	);
}
