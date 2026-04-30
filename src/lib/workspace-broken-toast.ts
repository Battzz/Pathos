import type { QueryClient } from "@tanstack/react-query";
import { permanentlyDeleteWorkspace } from "@/lib/api";
import { extractError } from "@/lib/errors";
import { pathosQueryKeys } from "@/lib/query-client";
import type { PushWorkspaceToast } from "@/lib/workspace-toast-context";

type ShowWorkspaceBrokenToastArgs = {
	workspaceId: string;
	pushToast: PushWorkspaceToast;
	queryClient: QueryClient;
	description?: string;
};

/**
 * Pop a persistent, destructive toast for a workspace whose directory has
 * vanished on disk. The default action is "Dismiss" (chat history stays
 * in the archive list); the explicit "Permanently Delete" action nukes
 * the DB row + messages only after the user confirms. Never auto-deletes.
 *
 * Shared between inspector mutation failures and send-message failures so
 * the recovery UX is identical wherever `ErrorCode::WorkspaceBroken`
 * surfaces.
 */
export function showWorkspaceBrokenToast({
	workspaceId,
	pushToast,
	queryClient,
	description,
}: ShowWorkspaceBrokenToastArgs): void {
	pushToast(
		description ??
			"The chat history is preserved in the archive. Permanently delete to remove it for good.",
		"Workspace directory is missing",
		"destructive",
		{
			persistent: true,
			action: {
				label: "Permanently Delete",
				destructive: true,
				onClick: () => {
					void permanentlyDeleteWorkspace(workspaceId)
						.then(() => {
							void queryClient.invalidateQueries({
								queryKey: pathosQueryKeys.workspaceGroups,
							});
							void queryClient.invalidateQueries({
								queryKey: pathosQueryKeys.archivedWorkspaces,
							});
							void queryClient.removeQueries({
								queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
							});
							void queryClient.removeQueries({
								queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
							});
						})
						.catch((error) => {
							const { message } = extractError(
								error,
								"Failed to delete workspace.",
							);
							pushToast(message, "Unable to delete workspace", "destructive");
						});
				},
			},
		},
	);
}
