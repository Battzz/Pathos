import { ChevronRight, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { CommandItem } from "@/components/ui/command";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
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
			className={cn(
				"group/palette flex h-12 items-center gap-3 rounded-lg px-3 py-0 transition-colors",
				"data-selected:bg-foreground/[0.06]",
				active && "bg-foreground/[0.035]",
			)}
		>
			<Icon
				className="size-[17px] shrink-0 text-muted-foreground/85 transition-colors group-data-selected/palette:text-foreground"
				strokeWidth={1.6}
				aria-hidden
			/>
			<span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] leading-none tracking-[-0.005em]">
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
			{trailing ? (
				<span
					data-slot="command-shortcut"
					className="ml-auto flex shrink-0 items-center gap-2 text-[11.5px] font-medium text-muted-foreground/70 tabular-nums"
				>
					{trailing}
				</span>
			) : null}
			{shortcut ? (
				<span
					data-slot="command-shortcut"
					className="ml-auto flex shrink-0 items-center"
				>
					<InlineShortcutDisplay hotkey={shortcut} />
				</span>
			) : null}
		</CommandItem>
	);
}
