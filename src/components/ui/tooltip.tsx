"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					// Surface
					"z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-[10px] border border-tooltip-border bg-tooltip px-3 py-2 text-[13px] font-medium leading-none text-tooltip-foreground dark:gap-1.5 dark:rounded-[7px] dark:px-2.5 dark:py-1.5 dark:text-[12px]",
					// Light mode uses the flatter native chip shadow from macOS. Dark
					// mode keeps the deeper floating tooltip treatment.
					"shadow-[0_1px_1px_rgba(16,24,40,0.04),0_2px_5px_rgba(16,24,40,0.08)] dark:shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35),0_2px_6px_-3px_rgba(0,0,0,0.25)]",
					// Animation: fade + scale + tiny axis-aware slide. ease-out so it
					// "settles" into place rather than overshooting.
					"duration-150 ease-out",
					"data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
					"data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
					"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					"data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
					// kbd glyph styling — used by `<kbd>` children inside the chip.
					"has-data-[slot=kbd]:pr-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:h-auto **:data-[slot=kbd]:min-w-0 **:data-[slot=kbd]:border-transparent **:data-[slot=kbd]:bg-transparent **:data-[slot=kbd]:px-0 **:data-[slot=kbd]:text-[13px] **:data-[slot=kbd]:text-tooltip-foreground/65 **:data-[slot=kbd]:shadow-none dark:has-data-[slot=kbd]:pr-1.5 dark:**:data-[slot=kbd]:h-3.5 dark:**:data-[slot=kbd]:min-w-3.5 dark:**:data-[slot=kbd]:rounded-sm dark:**:data-[slot=kbd]:border-white/25 dark:**:data-[slot=kbd]:px-0.5 dark:**:data-[slot=kbd]:text-[9px] dark:**:data-[slot=kbd]:text-white/70",
					className,
				)}
				{...props}
			>
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
