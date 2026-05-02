/**
 * Cross-cutting events for jumping to a specific Space from anywhere in the
 * app (e.g. global keyboard shortcuts in `App.tsx`). The active-space state
 * lives inside `WorkspacesSidebarContainer`; the container subscribes to this
 * event and resolves the index into a real space id.
 *
 * Mirrors the pattern in `lib/project-action-events.ts` so global shortcuts
 * stay decoupled from sidebar internals.
 */
export const PATHOS_SWITCH_SPACE_EVENT = "pathos:switch-space";

export type SwitchSpaceDetail = {
	/** 1-based index matching the dot pager and the `Mod+N` shortcuts. */
	position: number;
};

export function requestSwitchSpace(position: number) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<SwitchSpaceDetail>(PATHOS_SWITCH_SPACE_EVENT, {
			detail: { position },
		}),
	);
}
