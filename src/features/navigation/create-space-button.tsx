import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { createSpace, type Space } from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type Props = {
	/**
	 * Called after the new space is persisted so the parent can flip the
	 * active page of the pager and animate the user onto it. The optimistic
	 * cache update lets the dot indicator render before the listSpaces
	 * refetch completes.
	 */
	onSpaceCreated: (space: Space) => void;
};

export function CreateSpaceButton({ onSpaceCreated }: Props) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const mutation = useMutation({
		mutationFn: (rawName: string) => createSpace(rawName),
		onSuccess: (space) => {
			// Seed the cache so the new dot appears instantly without
			// waiting for the spaceListChanged round-trip. The bridge will
			// still invalidate, which is harmless (same shape).
			queryClient.setQueryData<Space[] | undefined>(
				pathosQueryKeys.spaces,
				(current) => (current ? [...current, space] : [space]),
			);
			onSpaceCreated(space);
			setName("");
			setError(null);
			setOpen(false);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Could not create space");
		},
	});

	useEffect(() => {
		if (open) {
			// Microtask: Popover focuses its content first; we want the
			// caret in the input the user actually came to fill in.
			const t = window.setTimeout(() => inputRef.current?.focus(), 0);
			return () => window.clearTimeout(t);
		}
	}, [open]);

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setError("Name cannot be empty");
			return;
		}
		mutation.mutate(trimmed);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setError(null);
					setName("");
				}
			}}
		>
			<PopoverAnchor>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => setOpen((v) => !v)}
							aria-label="New Space"
							aria-expanded={open}
							className={cn(
								// Match the size + interaction surface of `SpacePageDots`
								// buttons so the `+` reads as a sibling glyph in the row.
								"flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors",
								"text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							)}
						>
							<Plus className="size-2.5" strokeWidth={2.5} />
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						sideOffset={4}
						className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
					>
						<span className="leading-none">New Space</span>
					</TooltipContent>
				</Tooltip>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={6}
				className="w-60 p-2"
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					className="flex flex-col gap-2"
				>
					<label
						htmlFor="space-name-input"
						className="text-app-foreground/80 text-[11px] font-medium"
					>
						Space name
					</label>
					<input
						ref={inputRef}
						id="space-name-input"
						type="text"
						value={name}
						onChange={(event) => {
							setName(event.target.value);
							if (error) setError(null);
						}}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								setOpen(false);
							}
						}}
						placeholder="Marketing"
						maxLength={64}
						className="bg-app-base focus-visible:ring-app-foreground/20 h-7 rounded-md border border-app-border px-2 text-[12px] outline-none focus-visible:ring-2"
						disabled={mutation.isPending}
					/>
					{error ? (
						<p className="text-destructive text-[11px] leading-tight">
							{error}
						</p>
					) : null}
					<div className="flex items-center justify-end gap-1">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-[12px]"
							onClick={() => setOpen(false)}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							size="sm"
							className="h-7 px-2 text-[12px]"
							disabled={mutation.isPending || name.trim().length === 0}
						>
							{mutation.isPending ? "Creating…" : "Create"}
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
