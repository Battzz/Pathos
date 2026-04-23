import { useCallback, useEffect, useState } from "react";
import {
	cancelGithubIdentityConnect,
	disconnectGithubIdentity,
	listenGithubIdentityChanged,
	loadGithubIdentitySession,
	startGithubIdentityConnect,
} from "@/lib/api";
import { describeUnknownError } from "@/lib/workspace-helpers";
import { getInitialGithubIdentityState } from "@/shell/layout";
import type { GithubIdentityState } from "@/shell/types";

type WorkspaceToastFn = (
	description: string,
	title?: string,
	variant?: "default" | "destructive",
) => void;

export function useGithubIdentity(pushWorkspaceToast: WorkspaceToastFn) {
	const [githubIdentityState, setGithubIdentityState] =
		useState<GithubIdentityState>(getInitialGithubIdentityState);

	const refreshGithubIdentityState = useCallback(async () => {
		const snapshot = await loadGithubIdentitySession();
		setGithubIdentityState(snapshot);
	}, []);

	useEffect(() => {
		let disposed = false;
		let unlistenIdentity: (() => void) | undefined;

		void loadGithubIdentitySession().then((snapshot) => {
			if (!disposed) {
				setGithubIdentityState(snapshot);
			}
		});

		void listenGithubIdentityChanged((snapshot) => {
			if (!disposed) {
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
	}, []);

	const handleStartGithubIdentityConnect = useCallback(async () => {
		try {
			const flow = await startGithubIdentityConnect();
			setGithubIdentityState({ status: "pending", flow });
		} catch (error) {
			setGithubIdentityState({
				status: "error",
				message: describeUnknownError(error, "Unable to start GitHub sign-in."),
			});
		}
	}, []);

	const handleCopyGithubDeviceCode = useCallback(
		async (userCode: string) => {
			if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
				pushWorkspaceToast(
					"Unable to copy the one-time code on this device.",
					"Copy failed",
				);
				return false;
			}

			try {
				await navigator.clipboard.writeText(userCode);
				return true;
			} catch {
				pushWorkspaceToast("Unable to copy the one-time code.", "Copy failed");
				return false;
			}
		},
		[pushWorkspaceToast],
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
						"Unable to cancel GitHub account connection.",
					),
				});
			});
	}, []);

	const handleDisconnectGithubIdentity = useCallback(async () => {
		try {
			await disconnectGithubIdentity();
			setGithubIdentityState({ status: "disconnected" });
		} catch (error) {
			setGithubIdentityState({
				status: "error",
				message: describeUnknownError(
					error,
					"Unable to disconnect the GitHub account.",
				),
			});
		}
	}, []);

	return {
		githubIdentityState,
		handleCancelGithubIdentityConnect,
		handleCopyGithubDeviceCode,
		handleDisconnectGithubIdentity,
		handleStartGithubIdentityConnect,
		refreshGithubIdentityState,
		isIdentityConnected: githubIdentityState.status === "connected",
	};
}
