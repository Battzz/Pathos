import type { ReactNode } from "react";
import { DEFAULT_SPACE_ID, type Space } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SpaceDot } from "./space-dot";

type Props = {
	spaces: Space[];
	activeSpaceId: string;
	onSelect: (spaceId: string) => void;
	className?: string;
	/**
	 * Per-position hotkey strings (1-based; `hotkeys[0]` is the shortcut for
	 * the first space). Surfaced inside the per-dot tooltip so users can
	 * discover the `Mod+N` bindings without opening Settings. Positions
	 * beyond the array (or `null` entries) just render the space name.
	 */
	hotkeys?: ReadonlyArray<string | null>;
	/**
	 * Optional element appended to the row after the dots — used by the
	 * sidebar to colocate the "create space" `+` glyph with the pager so
	 * adding a space lives in the same visual lane as switching between
	 * them. When set, the row always renders (even with a single space)
	 * so the `+` is always reachable.
	 */
	trailing?: ReactNode;
};

/**
 * Page-dot indicator for the sidebar Space pager. One dot per Space; the
 * active dot is filled. Clicking jumps directly to that page (cheaper for
 * the user than swiping past intermediate pages with many spaces).
 *
 * Hidden when there's only one space and no trailing slot — a lone dot
 * adds visual noise without conveying anything actionable. The trailing
 * slot (typically the "new space" `+`) keeps the row visible so users
 * can always reach the create action from the same lane.
 */
export function SpacePageDots({
	spaces,
	activeSpaceId,
	onSelect,
	className,
	hotkeys,
	trailing,
}: Props) {
	const showDots = spaces.length > 1;
	if (!showDots && !trailing) return null;

	return (
		<div
			className={cn(
				"flex items-center justify-center gap-0.5 pb-1 pt-1",
				className,
			)}
		>
			{showDots ? (
				<div
					role="tablist"
					aria-label="Spaces"
					className="flex items-center gap-0.5"
				>
					{spaces.map((space, index) => (
						<SpaceDot
							key={space.id}
							space={space}
							active={space.id === activeSpaceId}
							hotkey={hotkeys?.[index] ?? null}
							onSelect={onSelect}
							canDelete={space.id !== DEFAULT_SPACE_ID}
						/>
					))}
				</div>
			) : null}
			{trailing}
		</div>
	);
}
