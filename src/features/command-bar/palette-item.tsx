import { ChevronRight, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { CommandItem } from "@/components/ui/command";
import { shortcutToInlineParts } from "@/features/shortcuts/format";
import { cn } from "@/lib/utils";

export type Segment = { label: string; primary?: boolean };

type PaletteItemProps = {
	value: string;
	icon: LucideIcon;
	segments: Segment[];
	shortcut?: string | null;
	active?: boolean;
	disabled?: boolean;
	trailing?: ReactNode;
	onSelect: () => void;
};

export function PaletteItem({
	value,
	icon: Icon,
	segments,
	shortcut,
	active = false,
	disabled = false,
	trailing,
	onSelect,
}: PaletteItemProps) {
	return (
		<CommandItem
			value={value}
			disabled={disabled}
			onSelect={onSelect}
			hideCheckIcon
			className={cn(
				"group/palette flex h-11 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-2.5 py-0 transition-colors",
				"data-selected:bg-foreground/[0.055]",
				active && "bg-foreground/[0.035]",
			)}
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/35 bg-background/40 text-muted-foreground/80 transition-colors group-data-selected/palette:border-border/55 group-data-selected/palette:text-foreground">
				<Icon className="size-4" strokeWidth={1.65} aria-hidden />
			</span>
			<span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] leading-none">
				{segments.map((segment, index) => (
					<Fragment key={`${segment.label}-${index}`}>
						{index > 0 ? (
							<ChevronRight
								className="size-3.5 shrink-0 text-muted-foreground/40"
								strokeWidth={2}
								aria-hidden
							/>
						) : null}
						<span
							className={cn(
								"min-w-0 truncate",
								segment.primary
									? "font-semibold text-primary"
									: "font-medium text-foreground/85",
								// Let later segments shrink first so the category stays legible
								index === 0 ? "shrink-0" : "min-w-0",
							)}
						>
							{segment.label}
						</span>
					</Fragment>
				))}
				{active ? (
					<span
						aria-label="Current"
						className="ml-1 size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/15"
					/>
				) : null}
			</span>
			{trailing || shortcut ? (
				<span className="ml-auto flex max-w-[42%] shrink-0 items-center justify-end gap-2.5 overflow-hidden">
					{trailing ? (
						<span className="flex min-w-0 items-center gap-2 truncate text-[11.5px] font-medium text-muted-foreground/65 tabular-nums">
							{trailing}
						</span>
					) : null}
					{shortcut ? <PaletteShortcut hotkey={shortcut} /> : null}
				</span>
			) : null}
		</CommandItem>
	);
}

export function PaletteShortcut({ hotkey }: { hotkey: string }) {
	const parts = shortcutToInlineParts(hotkey);
	if (parts.length === 0) return null;
	return (
		<span
			data-slot="command-shortcut"
			aria-hidden="true"
			className="flex shrink-0 items-center gap-1 text-muted-foreground/85"
		>
			{parts.map((part, index) => (
				<kbd
					key={`${part}-${index}`}
					className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border/55 bg-background/65 px-1 font-mono text-[10.5px] font-medium text-foreground/80"
				>
					{part}
				</kbd>
			))}
		</span>
	);
}
