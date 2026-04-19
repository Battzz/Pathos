import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { suspendTerminalFit } from "@/components/terminal-output";
import { Button } from "@/components/ui/button";
import type { WorkspaceCommitButtonMode } from "@/features/commit/button";
import { cn } from "@/lib/utils";

export const MIN_SECTION_HEIGHT = 48;
// Default body height reserved for the tabs section when first expanded.
// Larger than MIN_SECTION_HEIGHT so the Setup/Run panel opens with enough
// room to comfortably show its empty/idle state.
export const DEFAULT_TABS_BODY_HEIGHT = 128;
export const RESIZE_HIT_AREA = 10;
export const TABS_ANIMATION_MS = 350;
// Apple-style easing — slow start, ultra-smooth tail. Used consistently for
// the inspector's panel toggle, the ChevronDown rotation, and the hover-zoom
// width/height/box-shadow transitions so every motion in this area feels
// like the same animation family.
export const TABS_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

// Hover-to-zoom configuration for the Setup/Run tabs container.
// When the panel is open and the pointer lingers over it for this long,
// the whole container grows (actual width / height, not a visual scale)
// from its bottom-right corner so the terminal output has more real
// estate. Pulling the pointer off the panel snaps it back to its
// original size.
// 300ms is the industry-standard hover-intent threshold (VSCode, Material
// Design). Shorter than ~250ms fires on "just passing through"; longer than
// ~400ms feels sluggish. 300ms cleanly separates "I paused here on purpose"
// from "my cursor is just crossing this region."
export const TABS_HOVER_ACTIVATION_MS = 300;
export const TABS_HOVER_TRANSITION_MS = 400;
// Multiplier applied to both width and height when zoomed. 2 means the
// zoomed panel is twice as wide and twice as tall as its resting size,
// growing up-and-left from the bottom-right anchor.
export const TABS_HOVER_ZOOM_MULTIPLIER = 2;
// Minimum layout height of the collapsed wrapper. The real content lives
// inside an absolutely-positioned child, so we need to reserve this
// space explicitly to keep the header row visible when the panel is
// closed. 32px header (h-8) + 1px section border-b = 33px.
const TABS_WRAPPER_COLLAPSED_MIN_HEIGHT_PX = 33;

export const INSPECTOR_SECTION_HEADER_CLASS =
	"flex h-8 min-w-0 shrink-0 items-center justify-between border-b border-border/60 bg-muted/25 px-3";
export const INSPECTOR_SECTION_TITLE_CLASS =
	"text-[13px] leading-8 font-medium tracking-[-0.01em] text-muted-foreground";
const INSPECTOR_TAB_BUTTON_CLASS =
	"relative inline-flex h-full cursor-pointer items-center justify-center px-0 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-0";

export function getGitSectionHeaderHighlightClass(
	mode: WorkspaceCommitButtonMode,
) {
	switch (mode) {
		case "fix":
			return "bg-[var(--workspace-pr-closed-header-bg)]";
		case "resolve-conflicts":
			return "bg-[var(--workspace-pr-conflicts-header-bg)]";
		case "open-pr":
			return null;
		case "merge":
			return "bg-[var(--workspace-pr-open-header-bg)]";
		case "merged":
			return "bg-[var(--workspace-pr-merged-header-bg)]";
		case "closed":
			return "bg-[var(--workspace-pr-closed-header-bg)]";
		default:
			return null;
	}
}

type InspectorTabsSectionProps = {
	wrapperRef: React.RefObject<HTMLDivElement | null>;
	open: boolean;
	onToggle: () => void;
	activeTab: string;
	onTabChange: (tab: string) => void;
	children?: React.ReactNode;
};

export function InspectorTabsSection({
	wrapperRef,
	open,
	onToggle,
	activeTab,
	onTabChange,
	children,
}: InspectorTabsSectionProps) {
	// `isHoverExpanded` drives the CSS transitions we CAN interpolate
	// (width / height / box-shadow). Flipping it to `false` immediately starts
	// the shrink animation.
	const [isHoverExpanded, setIsHoverExpanded] = useState(false);
	// `isZoomPresented` drives the properties the browser CANNOT transition
	// (z-index, the `data-tabs-zoomed` flag that frees the aside's overflow,
	// and the border-t that draws the top edge). It stays `true` for the full
	// duration of BOTH the expand and the collapse animation so that the
	// zoomed visual identity stays consistent while the size is changing — the
	// collapsing panel looks exactly like the expanding one in reverse.
	const [isZoomPresented, setIsZoomPresented] = useState(false);
	const hoverTimerRef = useRef<number | null>(null);
	const presentationClearTimerRef = useRef<number | null>(null);
	// Holds the outstanding `suspendTerminalFit()` release while the CSS
	// width/height transition is running, plus the timer that will release it
	// and trigger the final fit.
	const terminalFitReleaseRef = useRef<(() => void) | null>(null);
	const fitReleaseTimerRef = useRef<number | null>(null);

	const clearHoverTimer = useCallback(() => {
		if (hoverTimerRef.current !== null) {
			window.clearTimeout(hoverTimerRef.current);
			hoverTimerRef.current = null;
		}
	}, []);

	const clearPresentationClearTimer = useCallback(() => {
		if (presentationClearTimerRef.current !== null) {
			window.clearTimeout(presentationClearTimerRef.current);
			presentationClearTimerRef.current = null;
		}
	}, []);

	const releaseTerminalFitLock = useCallback(() => {
		if (fitReleaseTimerRef.current !== null) {
			window.clearTimeout(fitReleaseTimerRef.current);
			fitReleaseTimerRef.current = null;
		}
		if (terminalFitReleaseRef.current) {
			terminalFitReleaseRef.current();
			terminalFitReleaseRef.current = null;
		}
	}, []);

	// Pause every mounted `TerminalOutput`'s FitAddon for the duration of the
	// CSS transition. Without this, each xterm re-fits once per animation
	// frame (reflowing its 5000-line scrollback) which stutters the zoom.
	// Calling this while a suspension is already active just extends the
	// release timer — the suspend count stays at 1 throughout so the terminals
	// only re-fit once the animation truly settles.
	const beginZoomAnimation = useCallback(() => {
		if (!terminalFitReleaseRef.current) {
			terminalFitReleaseRef.current = suspendTerminalFit();
		}
		if (fitReleaseTimerRef.current !== null) {
			window.clearTimeout(fitReleaseTimerRef.current);
		}
		fitReleaseTimerRef.current = window.setTimeout(() => {
			fitReleaseTimerRef.current = null;
			if (terminalFitReleaseRef.current) {
				terminalFitReleaseRef.current();
				terminalFitReleaseRef.current = null;
			}
			// A small safety margin beyond the CSS transition so the final
			// fit uses the settled dimensions rather than the last interpolated
			// frame's.
		}, TABS_HOVER_TRANSITION_MS + 50);
	}, []);

	// Drives both the CSS-transitionable properties (`isHoverExpanded`) and
	// the discrete ones (`isZoomPresented`). Expanding flips presentation on
	// immediately; collapsing keeps presentation on until the shrink
	// transition has run to completion, so z-index / overflow / border stay
	// consistent with the shrinking box.
	const setZoomTarget = useCallback(
		(target: boolean) => {
			if (target) {
				clearPresentationClearTimer();
				setIsZoomPresented(true);
			} else {
				clearPresentationClearTimer();
				presentationClearTimerRef.current = window.setTimeout(() => {
					presentationClearTimerRef.current = null;
					setIsZoomPresented(false);
				}, TABS_HOVER_TRANSITION_MS + 20);
			}
			setIsHoverExpanded(target);
		},
		[clearPresentationClearTimer],
	);

	const handleMouseEnter = useCallback(() => {
		if (!open) return;
		clearHoverTimer();
		hoverTimerRef.current = window.setTimeout(() => {
			beginZoomAnimation();
			setZoomTarget(true);
			hoverTimerRef.current = null;
		}, TABS_HOVER_ACTIVATION_MS);
	}, [open, clearHoverTimer, beginZoomAnimation, setZoomTarget]);

	const handleMouseLeave = useCallback(() => {
		clearHoverTimer();
		beginZoomAnimation();
		setZoomTarget(false);
	}, [clearHoverTimer, beginZoomAnimation, setZoomTarget]);

	// When the panel collapses we must drop any pending/active zoom so it
	// doesn't linger over the neighbouring sections. Also release any
	// outstanding terminal-fit lock immediately — the terminals are about to
	// unmount or change size and shouldn't be held back.
	useEffect(() => {
		if (!open) {
			clearHoverTimer();
			clearPresentationClearTimer();
			releaseTerminalFitLock();
			setIsHoverExpanded(false);
			setIsZoomPresented(false);
		}
	}, [
		open,
		clearHoverTimer,
		clearPresentationClearTimer,
		releaseTerminalFitLock,
	]);

	// Clean up any pending timer on unmount.
	useEffect(() => {
		return () => {
			clearHoverTimer();
			clearPresentationClearTimer();
			releaseTerminalFitLock();
		};
	}, [clearHoverTimer, clearPresentationClearTimer, releaseTerminalFitLock]);

	const zoomedSize = `${TABS_HOVER_ZOOM_MULTIPLIER * 100}%`;

	return (
		<div
			ref={wrapperRef}
			className={cn(
				"relative flex min-h-0 shrink-0 flex-col",
				open && "flex-1",
			)}
			style={{
				// The real content lives inside the absolutely-positioned child
				// below, which contributes nothing to layout. Reserve header
				// height when the panel is closed so the parent flex column
				// keeps a stable footprint for us.
				minHeight: open
					? undefined
					: `${TABS_WRAPPER_COLLAPSED_MIN_HEIGHT_PX}px`,
			}}
		>
			<div
				data-tabs-zoomed={isZoomPresented ? "true" : undefined}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className={cn(
					// `bg-sidebar` is the safety floor — it guarantees the zoomed
					// area never shows through to the content underneath even if
					// the inner section somehow doesn't cover the full box.
					"absolute right-0 bottom-0 flex flex-col bg-sidebar",
					// Lift the zoomed container above the inspector resize separator
					// (z-30), the inspector width handle (z-30), and the rest of the
					// sidebar so it's the top-most layer in the app shell. Tied to
					// `isZoomPresented` (not `isHoverExpanded`) so it stays elevated
					// for the whole collapse animation, not just the one frame
					// before the shrink kicks off.
					isZoomPresented && "z-50",
				)}
				style={{
					width: isHoverExpanded ? zoomedSize : "100%",
					height: isHoverExpanded ? zoomedSize : "100%",
					transition: `width ${TABS_HOVER_TRANSITION_MS}ms ${TABS_EASING}, height ${TABS_HOVER_TRANSITION_MS}ms ${TABS_EASING}, box-shadow ${TABS_HOVER_TRANSITION_MS}ms ${TABS_EASING}`,
					// Tell the browser that nothing inside this container can affect
					// layout, paint, or size outside of it. This lets the browser
					// treat the zoom box as an independent compositing/layout
					// island — width/height changes don't invalidate the outer
					// inspector/sidebar layout, and box-shadow paints stay local.
					// Pairs with the `suspendTerminalFit()` lock to keep the
					// per-frame cost of the animation as low as possible.
					contain: "layout paint",
					// Drop shadow only. The top edge line is drawn by the section's
					// own `border-t` below — inset shadows are painted UNDER child
					// backgrounds, so putting it here would be hidden by the
					// section's `bg-sidebar`.
					// Shadow offsets are negative on both axes so the drop shadow
					// radiates toward the TOP and LEFT — the panel is anchored to
					// the bottom-right of the aside, so shadow on the bottom/right
					// would be invisible (clipped by the aside edge). The two
					// layers give a soft ambient edge plus a tighter contact halo.
					// Collapsed state keeps the same layer count (two) so the
					// box-shadow transition interpolates cleanly layer-by-layer.
					boxShadow: isHoverExpanded
						? "-2px -2px 10px -2px rgba(0, 0, 0, 0.08), -6px -6px 28px -10px rgba(0, 0, 0, 0.10)"
						: "0 0 0 0 rgba(0, 0, 0, 0), 0 0 0 0 rgba(0, 0, 0, 0)",
				}}
			>
				<section
					aria-label="Inspector section Tabs"
					className={cn(
						"relative flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border/60 bg-sidebar",
						// Draw the top edge line on the section itself so it paints
						// above the section's `bg-sidebar` and scales with the
						// container as it grows. Tied to `isZoomPresented` so the
						// border stays drawn for the whole collapse animation too.
						isZoomPresented && "border-t border-t-border/60",
					)}
				>
					<div className="flex min-h-0 flex-1 flex-col gap-0">
						<div
							className={cn(
								INSPECTOR_SECTION_HEADER_CLASS,
								"relative z-10 items-stretch pt-0",
							)}
						>
							<div
								role="tablist"
								aria-orientation="horizontal"
								className="flex h-full self-stretch items-stretch gap-4"
							>
								<button
									type="button"
									role="tab"
									id="inspector-tab-setup"
									aria-controls="inspector-panel-setup"
									aria-selected={activeTab === "setup"}
									tabIndex={activeTab === "setup" ? 0 : -1}
									className={cn(
										INSPECTOR_TAB_BUTTON_CLASS,
										activeTab === "setup" && "text-foreground",
									)}
									onClick={() => onTabChange("setup")}
								>
									Setup
									<span
										aria-hidden="true"
										className={cn(
											"pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground opacity-0 transition-opacity",
											activeTab === "setup" && "opacity-100",
										)}
									/>
								</button>
								<button
									type="button"
									role="tab"
									id="inspector-tab-run"
									aria-controls="inspector-panel-run"
									aria-selected={activeTab === "run"}
									tabIndex={activeTab === "run" ? 0 : -1}
									className={cn(
										INSPECTOR_TAB_BUTTON_CLASS,
										activeTab === "run" && "text-foreground",
									)}
									onClick={() => onTabChange("run")}
								>
									Run
									<span
										aria-hidden="true"
										className={cn(
											"pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground opacity-0 transition-opacity",
											activeTab === "run" && "opacity-100",
										)}
									/>
								</button>
							</div>
							<Button
								type="button"
								aria-label="Toggle inspector tabs section"
								onClick={onToggle}
								variant="ghost"
								size="icon-sm"
								className="ml-auto shrink-0 self-center text-muted-foreground hover:bg-accent/60 hover:text-foreground"
							>
								<ChevronDown
									className="size-3.5"
									strokeWidth={1.9}
									style={{
										transform: open ? "rotate(0deg)" : "rotate(-90deg)",
										transition: `transform ${TABS_ANIMATION_MS}ms ${TABS_EASING}`,
									}}
								/>
							</Button>
						</div>

						{open && (
							<div
								aria-label="Inspector tabs body"
								className="relative flex min-h-0 flex-1 flex-col bg-sidebar"
							>
								{children}
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}

type HorizontalResizeHandleProps = {
	onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
	isActive: boolean;
};

export function HorizontalResizeHandle({
	onMouseDown,
	isActive,
}: HorizontalResizeHandleProps) {
	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			aria-valuenow={0}
			onMouseDown={onMouseDown}
			className="group relative z-20 shrink-0 cursor-ns-resize touch-none"
			style={{
				height: `${RESIZE_HIT_AREA}px`,
				marginTop: `-${RESIZE_HIT_AREA / 2}px`,
				marginBottom: `-${RESIZE_HIT_AREA / 2}px`,
			}}
		>
			<span
				aria-hidden="true"
				className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 transition-[height,background-color,box-shadow] ${
					isActive
						? "h-[2px] bg-foreground/80 shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:shadow-[0_0_12px_rgba(255,255,255,0.16)]"
						: "h-px bg-border/75 group-hover:h-[2px] group-hover:bg-muted-foreground/75"
				}`}
			/>
		</div>
	);
}
