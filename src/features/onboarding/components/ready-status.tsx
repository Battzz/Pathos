export function ReadyStatus() {
	return (
		<div className="inline-flex h-7 items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
			<span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_color-mix(in_oklch,var(--color-emerald-400)_55%,transparent)]" />
			<span>Ready</span>
		</div>
	);
}
