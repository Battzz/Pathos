import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	CheckCircle2,
	CircleAlert,
	Copy,
	Loader2,
	LogOut,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { GithubBrandIcon, GitlabBrandIcon } from "@/components/brand-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
	ForgeCliStatus,
	ForgeProvider,
	GithubIdentityAccount,
	GithubIdentityDeviceFlowStart,
	GithubIdentitySession,
	RepositoryCreateOption,
} from "@/lib/api";
import { forgeCliStatusQueryOptions } from "@/lib/query-client";
import { useForgeCliConnect } from "@/lib/use-forge-cli-connect";
import { useGithubIdentity } from "@/shell/hooks/use-github-identity";
import { SettingsGroup, SettingsRow } from "../components/settings-row";
import { gitlabHostsForRepositories } from "./cli-install-gitlab-hosts";

export function AccountPanel({
	repositories,
	onSignedOut,
}: {
	repositories: RepositoryCreateOption[];
	onSignedOut?: () => void;
}) {
	const queryClient = useQueryClient();
	// Reflects external sign-in / sign-out via backend events.
	const {
		githubIdentityState,
		handleCancelGithubIdentityConnect,
		handleCopyGithubDeviceCode,
		handleDisconnectGithubIdentity,
	} = useGithubIdentity();
	const [signingOut, setSigningOut] = useState(false);
	const [codeCopied, setCodeCopied] = useState(false);
	const gitlabHosts = useMemo(
		() => gitlabHostsForRepositories(repositories),
		[repositories],
	);

	const identity: GithubIdentitySession | null =
		githubIdentityState.status === "connected"
			? githubIdentityState.session
			: null;
	const accounts: GithubIdentityAccount[] =
		githubIdentityState.status === "connected"
			? githubIdentityState.accounts.length
				? githubIdentityState.accounts
				: [githubIdentityState.session]
			: [];

	const handleSignOut = useCallback(async () => {
		setSigningOut(true);
		try {
			await handleDisconnectGithubIdentity();
			// Drop every auth-bound cache; backend pushes the identity update.
			await queryClient.invalidateQueries();
			onSignedOut?.();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to sign out.",
			);
		} finally {
			setSigningOut(false);
		}
	}, [handleDisconnectGithubIdentity, onSignedOut, queryClient]);

	const handleCopyPendingCode = useCallback(async () => {
		if (githubIdentityState.status !== "pending") return;
		const copied = await handleCopyGithubDeviceCode(
			githubIdentityState.flow.userCode,
		);
		if (copied) {
			setCodeCopied(true);
		}
	}, [githubIdentityState, handleCopyGithubDeviceCode]);

	return (
		<TooltipProvider delayDuration={150}>
			<SettingsGroup>
				<GithubAccountsSection
					identity={identity}
					accounts={accounts}
					pendingFlow={
						githubIdentityState.status === "pending"
							? githubIdentityState.flow
							: null
					}
					codeCopied={codeCopied}
					signingOut={signingOut}
					onCancelAddAccount={handleCancelGithubIdentityConnect}
					onCopyPendingCode={() => void handleCopyPendingCode()}
					onSignOut={() => void handleSignOut()}
				/>
				<CliIntegrationRow
					provider="github"
					host="github.com"
					title="GitHub CLI integration"
					icon={<GithubBrandIcon size={14} />}
				/>
				{gitlabHosts.length > 0
					? gitlabHosts.map((host) => (
							<CliIntegrationRow
								key={host}
								provider="gitlab"
								host={host}
								title={
									gitlabHosts.length > 1
										? `GitLab CLI integration · ${host}`
										: "GitLab CLI integration"
								}
								icon={<GitlabBrandIcon size={14} className="text-[#FC6D26]" />}
							/>
						))
					: null}
			</SettingsGroup>
		</TooltipProvider>
	);
}

function GithubAccountsSection({
	identity,
	accounts,
	pendingFlow,
	codeCopied,
	signingOut,
	onCancelAddAccount,
	onCopyPendingCode,
	onSignOut,
}: {
	identity: GithubIdentitySession | null;
	accounts: GithubIdentityAccount[];
	pendingFlow: GithubIdentityDeviceFlowStart | null;
	codeCopied: boolean;
	signingOut: boolean;
	onCancelAddAccount: () => void;
	onCopyPendingCode: () => void;
	onSignOut: () => void;
}) {
	return (
		<div className="select-none py-5">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
					<GithubBrandIcon size={14} />
					<span>GitHub CLI account</span>
				</div>
			</div>
			{pendingFlow ? (
				<div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/25 px-3 py-2">
					<button
						type="button"
						onClick={onCopyPendingCode}
						className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 font-mono text-[13px] font-medium tracking-[0.2em] text-foreground hover:bg-accent"
					>
						{pendingFlow.userCode}
						{codeCopied ? (
							<Check className="size-3.5 text-green-500" strokeWidth={2} />
						) : (
							<Copy
								className="size-3.5 text-muted-foreground"
								strokeWidth={1.8}
							/>
						)}
					</button>
					<Button variant="ghost" size="sm" onClick={onCancelAddAccount}>
						Cancel
					</Button>
				</div>
			) : null}
			{accounts.length > 0 ? (
				<div className="space-y-1">
					{accounts.map((account) => (
						<IdentityRow
							key={account.githubUserId}
							account={account}
							active={account.githubUserId === identity?.githubUserId}
							onSignOut={onSignOut}
							signingOut={signingOut}
						/>
					))}
				</div>
			) : (
				<div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-[12px] text-muted-foreground">
					GitHub CLI is not connected.
				</div>
			)}
		</div>
	);
}

function IdentityRow({
	account,
	active,
	onSignOut,
	signingOut,
}: {
	account: GithubIdentityAccount;
	active: boolean;
	onSignOut: () => void;
	signingOut: boolean;
}) {
	return (
		<div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/30">
			<Avatar size="lg">
				{account.avatarUrl ? (
					<AvatarImage src={account.avatarUrl} alt={account.login} />
				) : null}
				<AvatarFallback className="bg-muted text-[12px] font-medium text-muted-foreground">
					{account.login.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="truncate text-[14px] font-semibold text-foreground">
					{account.name?.trim() || account.login}
				</div>
				{account.primaryEmail ? (
					<div className="truncate text-[12px] text-muted-foreground">
						{account.primaryEmail}
					</div>
				) : null}
				<div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
					<GithubBrandIcon size={12} />
					<span className="truncate">{account.login}</span>
					{active ? (
						<span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
							CLI default
						</span>
					) : null}
				</div>
			</div>
			{active ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={onSignOut}
					disabled={signingOut}
					className="shrink-0 text-muted-foreground hover:text-foreground"
				>
					{signingOut ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<LogOut className="size-3.5" strokeWidth={1.8} />
					)}
					Sign out
				</Button>
			) : (
				<div className="shrink-0 text-[12px] text-muted-foreground">
					Available
				</div>
			)}
		</div>
	);
}

function CliIntegrationRow({
	provider,
	host,
	title,
	icon,
}: {
	provider: ForgeProvider;
	host: string;
	title: string;
	icon: React.ReactNode;
}) {
	const statusQuery = useQuery(forgeCliStatusQueryOptions(provider, host));
	const status = statusQuery.data ?? null;
	const { connect, connecting } = useForgeCliConnect(provider, host);

	const errorMessage =
		status?.status === "error"
			? status.message
			: statusQuery.error instanceof Error
				? statusQuery.error.message
				: null;

	return (
		<CliIntegrationRowView
			title={title}
			icon={icon}
			status={status}
			connecting={connecting}
			isPending={statusQuery.isPending}
			errorMessage={errorMessage}
			onConnect={() => void connect()}
		/>
	);
}

// Pure presentation split out from `CliIntegrationRow`. All right-side variants
// pin to `h-7` so the row height stays constant across Connect / Ready / Error
// states (otherwise the row visibly jumps when the query resolves).
function CliIntegrationRowView({
	title,
	icon,
	status,
	connecting,
	isPending,
	errorMessage,
	onConnect,
}: {
	title: ReactNode;
	icon: ReactNode;
	status: ForgeCliStatus | null;
	connecting: boolean;
	isPending: boolean;
	errorMessage: string | null;
	onConnect: () => void;
}) {
	const isReady = status?.status === "ready";
	return (
		<SettingsRow
			title={
				<span className="flex items-center gap-1.5">
					{icon}
					<span>{title}</span>
				</span>
			}
		>
			{isReady && status ? (
				<div className="inline-flex h-7 items-center gap-1.5 text-[12px] text-muted-foreground">
					<CheckCircle2 className="size-3.5 text-green-500" strokeWidth={2} />
					<span className="truncate">{status.login}</span>
				</div>
			) : errorMessage ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="CLI status error"
							className="inline-flex h-7 cursor-default items-center justify-center text-destructive"
						>
							<CircleAlert className="size-4" strokeWidth={2.2} />
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="max-w-xs whitespace-normal text-[11px] leading-snug"
					>
						{errorMessage}
					</TooltipContent>
				</Tooltip>
			) : (
				<Button
					variant="outline"
					size="sm"
					onClick={onConnect}
					disabled={connecting || isPending}
				>
					{connecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
					Connect
				</Button>
			)}
		</SettingsRow>
	);
}
