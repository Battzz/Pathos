/**
 * ContextBar — the chip strip that sits at the top of the composer shell
 * after one or more `/add-dir` selections have resolved. It's a child of
 * the composer (not a sibling), separated from the editor area by a
 * single dashed line.
 *
 * Interactions (design spec):
 *   - hover a chip → tooltip with full path (350ms delay so it doesn't
 *     flash while the user is just scanning)
 *   - Tab / ← / → / Home / End → focus navigation
 *   - Backspace / Delete → remove focused chip + focus the neighbour
 *   - Esc → blur focused chip
 *   - overflowing content → right-edge fade gradient
 *   - entering / removing → width-collapse animation
 */

import { Folder, X } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceAvatar } from "@/features/navigation/avatar";
import { cn } from "@/lib/utils";

/** Shape of one ContextBar chip. */
export type ContextBarDirectory = {
	/** Absolute path — canonical id, used as React key. */
	path: string;
	/** Display name; fall back to basename of `path` if absent. */
	name?: string;
	/** Optional branch label, shown in mono small caps. */
	branch?: string | null;
	/** Repo icon / initials sourced from the sidebar (set when the path
	 * resolves to a known Helmor workspace). When absent, the chip falls
	 * back to a neutral folder glyph. */
	repoIconSrc?: string | null;
	repoInitials?: string | null;
	repoName?: string | null;
};

export type ContextBarProps = {
	directories: readonly ContextBarDirectory[];
	onRemove: (path: string) => void;
	disabled?: boolean;
	className?: string;
};

function basename(path: string): string {
	if (!path) return path;
	const trimmed = path.replace(/[/\\]+$/, "");
	const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/** Small folder glyph used in each chip. */
function FolderIcon(): ReactNode {
	return (
		<Folder
			className="size-3 shrink-0 text-muted-foreground"
			strokeWidth={1.8}
			aria-hidden
		/>
	);
}

export function ContextBar({
	directories,
	onRemove,
	disabled = false,
	className,
}: ContextBarProps) {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const barRef = useRef<HTMLDivElement | null>(null);
	const [hasOverflow, setHasOverflow] = useState(false);
	// Track which chips are animating out so their DOM lingers until the
	// transition ends. Keyed by path.
	const [removing, setRemoving] = useState<Set<string>>(() => new Set());
	const [tooltip, setTooltip] = useState<{
		path: string;
		left: number;
		top: number;
	} | null>(null);

	const updateOverflow = useCallback(() => {
		const bar = barRef.current;
		if (!bar) return;
		const overflow = bar.scrollWidth - bar.clientWidth - bar.scrollLeft > 2;
		setHasOverflow(overflow);
	}, []);

	useEffect(() => {
		updateOverflow();
		const bar = barRef.current;
		if (!bar) return;
		const ro = new ResizeObserver(updateOverflow);
		ro.observe(bar);
		return () => ro.disconnect();
	}, [updateOverflow, directories.length]);

	const handleRemove = useCallback(
		(path: string) => {
			// Start the collapse animation; clear the entry from the DOM
			// after the transition ends.
			setRemoving((prev) => {
				const next = new Set(prev);
				next.add(path);
				return next;
			});
			// 280ms matches the CSS transition duration.
			const timer = window.setTimeout(() => {
				setRemoving((prev) => {
					if (!prev.has(path)) return prev;
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
				onRemove(path);
			}, 280);
			return () => window.clearTimeout(timer);
		},
		[onRemove],
	);

	const getChipList = () =>
		Array.from<HTMLElement>(
			barRef.current?.querySelectorAll<HTMLElement>(
				"[data-chip]:not([data-removing='true'])",
			) ?? [],
		);

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const target = (event.target as HTMLElement).closest(
			"[data-chip]",
		) as HTMLElement | null;
		if (!target) return;
		const chips = getChipList();
		const i = chips.indexOf(target);
		if (i < 0) return;

		switch (event.key) {
			case "ArrowLeft":
				event.preventDefault();
				chips[i - 1]?.focus();
				return;
			case "ArrowRight":
				event.preventDefault();
				chips[i + 1]?.focus();
				return;
			case "Home":
				event.preventDefault();
				chips[0]?.focus();
				return;
			case "End":
				event.preventDefault();
				chips[chips.length - 1]?.focus();
				return;
			case "Backspace":
			case "Delete": {
				if (disabled) return;
				event.preventDefault();
				const path = target.dataset.path;
				if (!path) return;
				const neighbour = chips[i + 1] ?? chips[i - 1];
				handleRemove(path);
				if (neighbour) window.setTimeout(() => neighbour.focus(), 40);
				return;
			}
			case "Escape":
				event.preventDefault();
				target.blur();
				return;
			default:
				return;
		}
	};

	// Hover tooltip — 350ms delay, disappears on mouse out / scroll.
	const hoverTimerRef = useRef<number | null>(null);
	const clearHoverTimer = () => {
		if (hoverTimerRef.current) {
			window.clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
	};
	const showTooltipFor = (chip: HTMLElement | null, delayMs: number) => {
		if (!chip) return;
		clearHoverTimer();
		hoverTimerRef.current = window.setTimeout(() => {
			const rect = chip.getBoundingClientRect();
			setTooltip({
				path: chip.dataset.path ?? "",
				left: rect.left,
				top: rect.bottom + 6,
			});
		}, delayMs);
	};
	const hideTooltip = () => {
		clearHoverTimer();
		setTooltip(null);
	};
	const onMouseOver = (event: React.MouseEvent<HTMLDivElement>) => {
		const chip = (event.target as HTMLElement).closest(
			"[data-chip]",
		) as HTMLElement | null;
		showTooltipFor(chip, 350);
	};
	const onMouseOut = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!(event.target as HTMLElement).closest("[data-chip]")) return;
		hideTooltip();
	};
	// Keyboard-focused chips also get the tooltip so screen-reader + keyboard
	// users aren't stuck wondering what path a chip represents. No delay
	// here — focus is a deliberate action, a delay would feel sluggish.
	const onFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
		const chip = (event.target as HTMLElement).closest(
			"[data-chip]",
		) as HTMLElement | null;
		showTooltipFor(chip, 0);
	};
	const onBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
		if (!(event.target as HTMLElement).closest("[data-chip]")) return;
		hideTooltip();
	};
	useEffect(() => () => clearHoverTimer(), []);

	const visible = useMemo(
		() => directories.map((d) => ({ ...d, removing: removing.has(d.path) })),
		[directories, removing],
	);

	// Visual state machine:
	//   mounted → is the bar in the DOM at all
	//   isOpen  → are we showing the expanded styles
	// Decoupling these two lets us run a transition in BOTH directions:
	//   Enter (hidden → visible): force-render once with `isOpen=false`
	//     so the browser paints the collapsed state, then flip
	//     `isOpen=true` two frames later — a single `requestAnimationFrame`
	//     can batch with React's commit and skip the transition entirely
	//     on a fresh remount, which reads as a flash/snap.
	//   Exit  (visible → hidden): set `isOpen=false` immediately, let the
	//     260ms transition play, then unmount.
	// On the VERY first render we intentionally skip the enter animation
	// — a workspace that boots with linked dirs already set shouldn't
	// animate them in on every app launch.
	const shouldShow = directories.length > 0 || removing.size > 0;
	const [mounted, setMounted] = useState(shouldShow);
	const [isOpen, setIsOpen] = useState(shouldShow);
	const initialMountRef = useRef(true);
	useEffect(() => {
		if (initialMountRef.current) {
			initialMountRef.current = false;
			return;
		}
		if (shouldShow) {
			setMounted(true);
			setIsOpen(false); // always start from the collapsed style
			let raf2 = 0;
			const raf1 = window.requestAnimationFrame(() => {
				raf2 = window.requestAnimationFrame(() => setIsOpen(true));
			});
			return () => {
				window.cancelAnimationFrame(raf1);
				if (raf2) window.cancelAnimationFrame(raf2);
			};
		}
		setIsOpen(false);
		const t = window.setTimeout(() => setMounted(false), 280);
		return () => window.clearTimeout(t);
	}, [shouldShow]);

	if (!mounted && !shouldShow) return null;

	return (
		<div
			data-slot="context-bar"
			data-show={shouldShow ? "true" : "false"}
			data-open={isOpen ? "true" : "false"}
			className={cn(
				// `max-height` is smoother than the `grid-template-rows:1fr↔0fr`
				// trick — some browsers hitch mid-transition when the row is
				// at an intermediate fractional size. 80px is a generous
				// ceiling for the single-line chip row.
				"relative -mx-4 overflow-hidden transition-[max-height,opacity,margin-bottom] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
				isOpen ? "mb-2 max-h-[80px] opacity-100" : "mb-0 max-h-0 opacity-0",
				className,
			)}
		>
			<div className="min-h-0 overflow-hidden">
				<div
					data-slot="context-bar-inner"
					// Asymmetric vertical padding on purpose: the composer shell
					// already adds `pt-3` above the bar, so we want minimal
					// padding above the CONTEXT row. The extra `pb-2` balances
					// the perceived gap below the dashed divider before the
					// editor begins.
					className="flex items-center border-b border-dashed border-border/55 px-4 pb-2 pt-0.5"
				>
					<span className="shrink-0 pr-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
						context
					</span>
					<div
						ref={scrollRef}
						className="relative min-w-0 flex-1"
						data-overflow={hasOverflow ? "true" : "false"}
					>
						{/* Right-edge fade gradient when content overflows. */}
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-sidebar transition-opacity duration-200",
								hasOverflow ? "opacity-100" : "opacity-0",
							)}
						/>
						{/* biome-ignore lint/a11y/useKeyWithMouseEvents: onMouseOver drives tooltip; keyboard users get the same tooltip via onFocusCapture below and keyboard navigation via onKeyDown. */}
						<div
							ref={barRef}
							role="list"
							className="scrollbar-none flex items-center gap-1 overflow-x-auto"
							onKeyDown={handleKeyDown}
							onMouseOver={onMouseOver}
							onMouseOut={onMouseOut}
							onFocusCapture={onFocusCapture}
							onBlurCapture={onBlurCapture}
							onScroll={updateOverflow}
						>
							{visible.map((d, idx) => (
								<Chip
									key={d.path}
									directory={d}
									showSeparator={idx > 0}
									disabled={disabled}
									onRemove={() => handleRemove(d.path)}
								/>
							))}
						</div>
					</div>
					{tooltip ? (
						<div
							role="tooltip"
							data-slot="context-bar-tooltip"
							style={{ left: tooltip.left, top: tooltip.top }}
							className="pointer-events-none fixed z-[100] max-w-[420px] overflow-hidden truncate rounded-md bg-foreground/95 px-2 py-1 font-mono text-[11px] text-background shadow-lg"
						>
							<span className="mr-2 text-[9.5px] uppercase tracking-[0.06em] opacity-60">
								path
							</span>
							{tooltip.path}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

function Chip({
	directory,
	showSeparator,
	disabled,
	onRemove,
}: {
	directory: ContextBarDirectory & { removing: boolean };
	showSeparator: boolean;
	disabled: boolean;
	onRemove: () => void;
}): ReactNode {
	const displayName = directory.name?.trim() || basename(directory.path);
	return (
		<>
			{showSeparator ? (
				<span
					aria-hidden
					data-separator
					className={cn(
						// Subtle vertical bar instead of a chevron — less noisy
						// and takes ~2px of horizontal space.
						"block h-3 w-px shrink-0 bg-border/60 transition-[max-width,margin,opacity] duration-200",
						directory.removing && "max-w-0 overflow-hidden opacity-0",
					)}
				/>
			) : null}
			<span
				data-chip
				data-path={directory.path}
				data-removing={directory.removing ? "true" : "false"}
				role="group"
				// Chips are focusable so keyboard users can remove them with
				// ⌫/Del. Not a button (Enter is a no-op) and not a listitem
				// (Biome flags tabIndex on non-interactive roles).
				// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable chip by design — Tab/⌫/Del nav is the only way to remove via keyboard.
				tabIndex={0}
				aria-label={displayName}
				className={cn(
					"group/chip inline-flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] leading-tight",
					"transition-[max-width,padding,margin,opacity,transform,background-color] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
					"outline-none focus-visible:bg-accent/60 focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--workspace-pr-merged-accent)_35%,transparent)]",
					"hover:bg-accent/60",
					directory.removing &&
						"max-w-0 -translate-x-1.5 scale-90 overflow-hidden p-0 opacity-0",
				)}
			>
				{directory.repoIconSrc || directory.repoInitials ? (
					<WorkspaceAvatar
						repoIconSrc={directory.repoIconSrc ?? null}
						repoInitials={directory.repoInitials ?? null}
						repoName={directory.repoName ?? null}
						title={displayName}
						className="size-3.5"
					/>
				) : (
					<FolderIcon />
				)}
				{/* Match the composer toolbar triggers (model picker / effort /
				    plan) which use `text-muted-foreground` — the chip reads
				    as part of the same dim-toolbar surface instead of
				    competing with the editor's white foreground text. */}
				<span className="max-w-[160px] shrink-0 truncate font-medium text-muted-foreground">
					{displayName}
				</span>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label={`Remove ${displayName}`}
					tabIndex={-1}
					disabled={disabled}
					className="size-3.5 shrink-0 rounded opacity-0 transition-opacity group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100 data-[force-visible='true']:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						onRemove();
					}}
				>
					<X className="size-2.5" />
				</Button>
			</span>
		</>
	);
}
