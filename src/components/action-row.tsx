import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionRowProps = {
	leading: ReactNode;
	trailing?: ReactNode;
	/** Absolute overlays (e.g. ShineBorder, gradient fills) */
	overlay?: ReactNode;
	className?: string;
};

/** Shared row shell for the composer action bar (auto-close, permission prompts). */
export function ActionRow({
	leading,
	trailing,
	overlay,
	className,
}: ActionRowProps) {
	return (
		<div
			className={cn(
				"relative flex items-center justify-between overflow-hidden border border-primary/40 bg-sidebar px-3 pb-1 pt-1.5",
				className,
			)}
		>
			{overlay}
			<div className="flex min-w-0 items-center gap-1.5">{leading}</div>
			{trailing != null && (
				<div className="flex shrink-0 items-center gap-1.5">{trailing}</div>
			)}
		</div>
	);
}

type ActionRowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	active?: boolean;
};

export function ActionRowButton({
	active,
	className,
	children,
	...props
}: ActionRowButtonProps) {
	const isActive = active ?? props["aria-pressed"] === true;

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={cn(
				"h-7 cursor-pointer gap-1.5 rounded-md border-0 bg-transparent px-2 text-[12px] font-medium leading-none tracking-[0.01em] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-transparent",
				isActive && "text-foreground",
				className,
			)}
			aria-pressed={isActive}
			{...props}
		>
			{isActive ? (
				<span
					aria-hidden="true"
					className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]"
				/>
			) : null}
			{children}
		</Button>
	);
}
