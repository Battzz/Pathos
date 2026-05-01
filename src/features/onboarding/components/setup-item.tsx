import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReadyStatus } from "./ready-status";

/**
 * One row in a setup card (agents, CLIs, instruments). Renders as a
 * hairline-divided row inside a `rounded-xl border` container — no extra
 * background fill, just clear hierarchy: small icon plate, label, terse
 * description, and a single trailing affordance (Set up button or
 * Ready badge).
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
				"flex items-start gap-3.5 border-t border-border/50 px-4 py-3.5 first:border-t-0",
				className,
			)}
		>
			<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.02] text-foreground/85">
				{icon}
			</div>
			<div className="min-w-0 flex-1 pt-px">
				<div className="text-[14px] font-medium leading-tight text-foreground">
					{label}
				</div>
				<p className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">
					{description}
				</p>
				<div
					aria-hidden={!hasError}
					className={cn(
						"grid transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(.22,.82,.2,1)]",
						hasError
							? "mt-1.5 grid-rows-[1fr] opacity-100"
							: "mt-0 grid-rows-[0fr] opacity-0",
					)}
				>
					<div className="overflow-hidden">
						<p className="text-[12px] leading-[1.5] text-destructive/85">
							{error}
						</p>
					</div>
				</div>
			</div>
			<div className="flex shrink-0 items-center pt-0.5">
				{ready ? (
					<ReadyStatus />
				) : (
					<button
						type="button"
						onClick={onAction}
						disabled={disabled || busy}
						className="group/action inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground/95 transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
					>
						{busy ? (
							<Loader2 className="size-3 animate-spin" strokeWidth={2} />
						) : null}
						<span>{actionLabel}</span>
						{!busy ? (
							<ArrowRight
								className="size-3 transition-transform duration-300 ease-out group-hover/action:translate-x-0.5"
								strokeWidth={2}
							/>
						) : null}
					</button>
				)}
			</div>
		</div>
	);
}
