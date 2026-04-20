import type { WorkspaceGroup } from "@/lib/api";

/**
 * Compute the macOS Dock badge count from the current (non-archived) workspace
 * groups. The badge shows the total number of **sessions** that have any unread
 * activity across every workspace visible in the sidebar.
 *
 * We intentionally sum `unreadSessionCount` (count of sessions with
 * `unread_count > 0`) rather than `sessionUnreadTotal` (sum of unread message
 * counts) so the badge reflects "how many conversations need attention" — not
 * the raw message backlog. Archived workspaces are excluded by design: they are
 * not present in `workspaceGroups` to begin with.
 *
 * Returns 0 when data is undefined / empty / missing the field, so callers can
 * safely clear the badge without branching.
 */
export function selectUnreadSessionCount(
	groups: WorkspaceGroup[] | undefined | null,
): number {
	if (!groups) return 0;
	let total = 0;
	for (const group of groups) {
		for (const row of group.rows) {
			total += row.unreadSessionCount ?? 0;
		}
	}
	return total;
}
