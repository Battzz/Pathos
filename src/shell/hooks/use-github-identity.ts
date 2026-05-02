import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	cancelGithubIdentityConnect,
	disconnectGithubIdentity,
	listenGithubIdentityChanged,
	loadGithubIdentitySession,
	startGithubIdentityConnect,
	switchGithubIdentityAccount,
} from "@/lib/api";
import {
	githubIdentityQueryOptions,
	pathosQueryKeys,
} from "@/lib/query-client";
import { describeUnknownError } from "@/lib/workspace-helpers";
import { getInitialGithubIdentityState } from "@/shell/layout";
import type { GithubIdentityState } from "@/shell/types";

type WorkspaceToastFn = (
	description: string,
	title?: string,
	variant?: "default" | "destructive",
) => void;

// Sonner fallback for callers without a workspace-specific toast surface
// (e.g. Settings → Account, which doesn't sit inside the WorkspaceToastProvider).
const sonnerFallbackToast: WorkspaceToastFn = (description, title, variant) => {
	const fn = variant === "destructive" ? toast.error : toast;
	fn(title ?? description, title ? { description } : undefined);
};

const CLI_AUTH_POLL_INTERVAL_MS = 2000;
const CLI_AUTH_POLL_TIMEOUT_MS = 120_000;

export function useGithubIdentity(pushWorkspaceToast?: WorkspaceToastFn) {
	const pushToast = pushWorkspaceToast ?? sonnerFallbackToast;
	const queryClient = useQueryClient();
	const identityQuery = useQuery(githubIdentityQueryOptions());
	const [githubIdentityState, setGithubIdentityState] =
		useState<GithubIdentityState>(getInitialGithubIdentityState);

	const refreshGithubIdentityState = useCallback(async () => {
		const snapshot = await queryClient.fetchQuery(githubIdentityQueryOptions());
		setGithubIdentityState(snapshot);
	}, [queryClient]);

	useEffect(() => {
		if (identityQuery.data) {
			setGithubIdentityState(identityQuery.data);
		}
	}, [identityQuery.data]);

	useEffect(() => {
		let disposed = false;
		let unlistenIdentity: (() => void) | undefined;

		void listenGithubIdentityChanged((snapshot) => {
			if (!disposed) {
				queryClient.setQueryData(pathosQueryKeys.githubIdentity, snapshot);
				setGithubIdentityState(snapshot);
			}
		}).then((unlisten) => {
			if (disposed) {
				unlisten();
				return;
			}

			unlistenIdentity = unlisten;
		});

		return () => {
			disposed = true;
			unlistenIdentity?.();
		};
	}, [queryClient]);

	const handleStartGithubIdentityConnect = useCallback(async () => {
		try {
			await startGithubIdentityConnect();
			pushToast("Complete GitHub CLI auth in Terminal.");

			const startedAt = Date.now();
			while (Date.now() - startedAt < CLI_AUTH_POLL_TIMEOUT_MS) {
				await new Promise((resolve) =>
					setTimeout(resolve, CLI_AUTH_POLL_INTERVAL_MS),
				);
				const snapshot = await loadGithubIdentitySession();
				queryClient.setQueryData(pathosQueryKeys.githubIdentity, snapshot);
				setGithubIdentityState(snapshot);
				if (snapshot.status === "connected") {
					return;
				}
			}

			pushToast(
				"Finish GitHub CLI auth in Terminal, then click Continue again.",
			);
		} catch (error) {
			setGithubIdentityState({
				status: "error",
				message: describeUnknownError(
					error,
					"Unable to start GitHub CLI auth.",
				),
			});
		}
	}, [pushToast]);

	const handleCopyGithubDeviceCode = useCallback(
		async (userCode: string) => {
			if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
				pushToast(
					"Unable to copy the one-time code on this device.",
					"Copy failed",
				);
				return false;
			}

			try {
				await navigator.clipboard.writeText(userCode);
				return true;
			} catch {
				pushToast("Unable to copy the one-time code.", "Copy failed");
				return false;
			}
		},
		[pushToast],
	);

	const handleCancelGithubIdentityConnect = useCallback(() => {
		void cancelGithubIdentityConnect()
			.then(() => {
				setGithubIdentityState({ status: "disconnected" });
			})
			.catch((error) => {
				setGithubIdentityState({
					status: "error",
					message: describeUnknownError(
						error,
						"Unable to cancel GitHub CLI auth.",
					),
				});
			});
	}, []);

	const handleDisconnectGithubIdentity = useCallback(async () => {
		try {
			await disconnectGithubIdentity();
			queryClient.removeQueries({ queryKey: pathosQueryKeys.githubIdentity });
			await refreshGithubIdentityState();
		} catch (error) {
			setGithubIdentityState({
				status: "error",
				message: describeUnknownError(
					error,
					"Unable to disconnect GitHub CLI.",
				),
			});
		}
	}, [refreshGithubIdentityState]);

	const handleSwitchGithubIdentityAccount = useCallback(
		async (githubUserId: number) => {
			try {
				const snapshot = await switchGithubIdentityAccount(githubUserId);
				queryClient.setQueryData(pathosQueryKeys.githubIdentity, snapshot);
				setGithubIdentityState(snapshot);
			} catch (error) {
				setGithubIdentityState({
					status: "error",
					message: describeUnknownError(
						error,
						"Unable to switch GitHub CLI account.",
					),
				});
			}
		},
		[queryClient],
	);

	return {
		githubIdentityState,
		handleCancelGithubIdentityConnect,
		handleCopyGithubDeviceCode,
		handleDisconnectGithubIdentity,
		handleStartGithubIdentityConnect,
		handleSwitchGithubIdentityAccount,
		refreshGithubIdentityState,
		isIdentityConnected: githubIdentityState.status === "connected",
	};
}
