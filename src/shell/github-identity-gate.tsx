import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { AnimatedIdentityNet } from "@/components/animated-identity-net";
import { GithubBrandIcon } from "@/components/brand-icon";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";
import { Button } from "@/components/ui/button";
import type { GithubIdentityState } from "./types";

export function GithubIdentityGate({
	identityState,
	onConnectGithub,
	onCopyGithubCode,
	onCancelGithubConnect,
}: {
	identityState: GithubIdentityState;
	onConnectGithub: () => void;
	onCopyGithubCode: (userCode: string) => Promise<boolean>;
	onCancelGithubConnect: () => void;
}) {
	const [codeCopied, setCodeCopied] = useState(false);

	const handleCopyCodeThenRedirect = useCallback(async () => {
		if (identityState.status !== "pending" || codeCopied) {
			return;
		}

		const copied = await onCopyGithubCode(identityState.flow.userCode);

		if (!copied) {
			return;
		}

		setCodeCopied(true);

		const { verificationUri, verificationUriComplete } = identityState.flow;

		setTimeout(() => {
			void (async () => {
				try {
					await openUrl(verificationUriComplete ?? verificationUri);
				} catch {
					// Keep the pending state visible even if the browser cannot be opened.
				}
			})();
		}, 600);
	}, [identityState, onCopyGithubCode, codeCopied]);

	return (
		<main
			aria-label="GitHub identity gate"
			className="relative h-screen overflow-hidden bg-background font-sans text-foreground antialiased"
		>
			<AnimatedIdentityNet />
			<div
				aria-label="GitHub identity gate drag region"
				className="absolute inset-x-0 top-0 z-20 flex h-11 items-center"
			>
				<TrafficLightSpacer side="left" width={94} />
				<div data-tauri-drag-region className="h-full flex-1" />
				<TrafficLightSpacer side="right" width={140} />
			</div>

			<div className="relative z-10 flex h-full items-center justify-center px-6">
				<div className="flex w-full max-w-md flex-col items-center">
					{identityState.status === "pending" ? (
						<div className="flex w-full max-w-[15rem] flex-col items-center gap-4">
							<Button
								variant="outline"
								size="lg"
								onClick={() => {
									void handleCopyCodeThenRedirect();
								}}
								disabled={codeCopied}
								aria-label="Copy one-time code"
								title="Copy one-time code"
								className="h-auto w-full justify-center gap-1.5 px-3 py-4"
							>
								<span className="font-mono text-2xl font-medium tracking-[0.25em] text-foreground">
									{identityState.flow.userCode}
								</span>
								{codeCopied ? (
									<Check
										data-icon="inline-end"
										className="size-4 text-emerald-500"
										strokeWidth={2.5}
									/>
								) : (
									<Copy
										data-icon="inline-end"
										className="size-4 text-muted-foreground"
										strokeWidth={1.8}
									/>
								)}
							</Button>
							<Button variant="ghost" size="sm" onClick={onCancelGithubConnect}>
								Cancel
							</Button>
						</div>
					) : identityState.status === "unconfigured" ? (
						<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
							<div className="space-y-1">
								<h1 className="text-lg font-semibold text-foreground">
									GitHub CLI is not available
								</h1>
								<p className="text-sm text-muted-foreground">
									{identityState.message}
								</p>
							</div>
							<Button disabled size="lg">
								<GithubBrandIcon size={16} data-icon="inline-start" />
								Continue with GitHub CLI
							</Button>
						</div>
					) : identityState.status === "checking" ? (
						<div className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground">
							<RefreshCw className="size-4 animate-spin" strokeWidth={1.8} />
							Restoring your last session
						</div>
					) : (
						<div className="flex justify-center">
							<Button
								onClick={onConnectGithub}
								size="lg"
								className="h-11 border border-white/12 bg-foreground px-5 text-background shadow-[0_14px_42px_rgba(255,255,255,0.08)] hover:bg-foreground/90"
							>
								<GithubBrandIcon size={16} data-icon="inline-start" />
								{identityState.status === "error"
									? "Retry GitHub CLI"
									: "Continue with GitHub CLI"}
							</Button>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
