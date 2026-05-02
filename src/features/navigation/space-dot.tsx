import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { deleteSpace, renameSpace, type Space } from "@/lib/api";
import { pathosQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type Props = {
	space: Space;
	active: boolean;
	hotkey: string | null;
	onSelect: (spaceId: string) => void;
	/**
	 * Right-click delete is suppressed when false (the seeded Default space
	 * is rejected by the backend — surfacing the menu item would just give
	 * users a button that always errors).
	 */
	canDelete: boolean;
};

/**
 * One dot in the sidebar Space pager. Owns the per-space affordances that
 * don't make sense at the row level: tooltip with the `Mod+N` hint, a
 * right-click menu for renaming/deleting, and the inline rename popover +
 * destructive-confirm dialog those actions open.
 *
 * The dot itself stays a thin styled button so the row keeps its tablist
 * semantics (the tooltip + context menu wrappers don't add interactive
 * descendants).
 */
export function SpaceDot({
	space,
	active,
	hotkey,
	onSelect,
	canDelete,
}: Props) {
	const queryClient = useQueryClient();
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [name, setName] = useState(space.name);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Reset the rename draft to the latest server value whenever the popover
	// re-opens — otherwise stale text from a cancelled edit would persist
	// the next time the user right-clicks.
	useEffect(() => {
		if (renameOpen) {
			setName(space.name);
			setError(null);
			const t = window.setTimeout(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			}, 0);
			return () => window.clearTimeout(t);
		}
	}, [renameOpen, space.name]);

	const renameMutation = useMutation({
		mutationFn: (rawName: string) => renameSpace(space.id, rawName),
		onSuccess: (_, rawName) => {
			// Patch the cached space immediately so the tooltip + dot label
			// reflect the new name before the spaceListChanged round-trip
			// invalidates the query.
			queryClient.setQueryData<Space[] | undefined>(
				pathosQueryKeys.spaces,
				(current) =>
					current?.map((entry) =>
						entry.id === space.id ? { ...entry, name: rawName } : entry,
					),
			);
			setRenameOpen(false);
			setError(null);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Could not rename space");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteSpace(space.id),
		onSuccess: () => {
			queryClient.setQueryData<Space[] | undefined>(
				pathosQueryKeys.spaces,
				(current) => current?.filter((entry) => entry.id !== space.id),
			);
			setDeleteOpen(false);
		},
	});

	const submitRename = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setError("Name cannot be empty");
			return;
		}
		if (trimmed === space.name) {
			setRenameOpen(false);
			return;
		}
		renameMutation.mutate(trimmed);
	};

	return (
		<>
			<Popover
				open={renameOpen}
				onOpenChange={(next) => {
					setRenameOpen(next);
					if (!next) setError(null);
				}}
			>
				{/*
				 * Roots (Popover/ContextMenu/Tooltip) are pure providers, so we
				 * stack them around the trigger chain. The three Trigger Slots
				 * then forward props (onContextMenu, onPointerEnter, anchor ref,
				 * …) down through `asChild` until they all land on the same
				 * <button>. Wrapping the button in a Root would break Slot's
				 * prop forwarding because Roots don't render DOM elements.
				 */}
				<ContextMenu>
					<Tooltip>
						<PopoverAnchor asChild>
							<ContextMenuTrigger asChild>
								<TooltipTrigger asChild>
									<button
										type="button"
										role="tab"
										aria-selected={active}
										aria-label={space.name}
										onClick={() => onSelect(space.id)}
										className={cn(
											"flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors",
											"hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
										)}
									>
										<span
											className={cn(
												"block rounded-full transition-[background-color,width,height]",
												active
													? "size-2 bg-foreground"
													: "size-1.5 bg-muted-foreground/55",
											)}
										/>
									</button>
								</TooltipTrigger>
							</ContextMenuTrigger>
						</PopoverAnchor>
						<TooltipContent
							side="top"
							sideOffset={4}
							className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
						>
							<span className="leading-none">{space.name}</span>
							{hotkey ? (
								<InlineShortcutDisplay
									hotkey={hotkey}
									className="text-tooltip-foreground/55"
								/>
							) : null}
						</TooltipContent>
					</Tooltip>
					<ContextMenuContent
						// ContextMenu is anchored to the cursor — not the
						// trigger element — so we can't force `side="top"`
						// like with a tooltip. Instead, lean on Radix's
						// built-in collision detection: `collisionPadding`
						// keeps the menu off every screen edge (the dots
						// live at the very bottom and one screen-edge nudge
						// is what was clipping the destructive item), and
						// `alignOffset` slides it slightly inward so the
						// rounded corner doesn't kiss the cursor.
						collisionPadding={8}
						alignOffset={-4}
						className="min-w-40"
					>
						<ContextMenuItem onSelect={() => setRenameOpen(true)}>
							<Pencil className="size-3.5" strokeWidth={2} />
							<span>Rename</span>
						</ContextMenuItem>
						{canDelete ? (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem
									variant="destructive"
									onSelect={() => setDeleteOpen(true)}
								>
									<Trash2 className="size-3.5" strokeWidth={2} />
									<span>Delete</span>
								</ContextMenuItem>
							</>
						) : null}
					</ContextMenuContent>
				</ContextMenu>
				<PopoverContent
					align="start"
					side="top"
					sideOffset={6}
					className="w-60 p-2"
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							submitRename();
						}}
						className="flex flex-col gap-2"
					>
						<label
							htmlFor={`rename-space-${space.id}`}
							className="text-app-foreground/80 text-[11px] font-medium"
						>
							Rename space
						</label>
						<input
							ref={inputRef}
							id={`rename-space-${space.id}`}
							type="text"
							value={name}
							onChange={(event) => {
								setName(event.target.value);
								if (error) setError(null);
							}}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									setRenameOpen(false);
								}
							}}
							placeholder={space.name}
							maxLength={64}
							className="bg-app-base focus-visible:ring-app-foreground/20 h-7 rounded-md border border-app-border px-2 text-[12px] outline-none focus-visible:ring-2"
							disabled={renameMutation.isPending}
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
								onClick={() => setRenameOpen(false)}
								disabled={renameMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								size="sm"
								className="h-7 px-2 text-[12px]"
								disabled={renameMutation.isPending || name.trim().length === 0}
							>
								{renameMutation.isPending ? "Saving…" : "Save"}
							</Button>
						</div>
					</form>
				</PopoverContent>
			</Popover>
			{canDelete ? (
				<ConfirmDialog
					open={deleteOpen}
					onOpenChange={(next) => {
						if (!deleteMutation.isPending) setDeleteOpen(next);
					}}
					title={`Delete "${space.name}"?`}
					description="Repositories pinned to this space will move back to the Default space. This action cannot be undone."
					confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete"}
					onConfirm={() => deleteMutation.mutate()}
					loading={deleteMutation.isPending}
				/>
			) : null}
		</>
	);
}
