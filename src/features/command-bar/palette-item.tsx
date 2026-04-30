import type { LucideIcon } from "lucide-react";
import { CommandItem, CommandShortcut } from "@/components/ui/command";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { cn } from "@/lib/utils";

type PaletteItemProps = {
	value: string;
	icon: LucideIcon;
	title: string;
	detail?: string | null;
	shortcut?: string | null;
	active?: boolean;
	disabled?: boolean;
	onSelect: () => void;
};

export function PaletteItem({
	value,
	icon: Icon,
	title,
	detail,
	shortcut,
	active = false,
	disabled = false,
	onSelect,
}: PaletteItemProps) {
	return (
		<CommandItem
			value={value}
			disabled={disabled}
			onSelect={onSelect}
			className={cn(
				"h-11 gap-2.5 rounded-lg border border-transparent px-3 py-0 transition-colors",
				"data-selected:bg-muted/85",
				active && "bg-muted/55",
			)}
		>
			<span
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-lg bg-background/55 text-muted-foreground",
					active && "text-foreground",
				)}
			>
				<Icon className="size-4" strokeWidth={1.9} />
			</span>
			<span className="flex min-w-0 flex-1 items-baseline gap-3">
				<span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
					{title}
				</span>
				{detail ? (
					<span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
						{detail}
					</span>
				) : null}
			</span>
			{active ? (
				<span
					aria-label="Current"
					className="size-2 shrink-0 rounded-full bg-primary"
				/>
			) : null}
			{shortcut ? (
				<CommandShortcut className="min-w-fit rounded-lg border border-border/45 bg-background/55 px-2 py-0.5 text-[11px] tracking-normal">
					<InlineShortcutDisplay hotkey={shortcut} />
				</CommandShortcut>
			) : null}
		</CommandItem>
	);
}

export function MutedItem({ text }: { text: string }) {
	return (
		<div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">
			{text}
		</div>
	);
}
