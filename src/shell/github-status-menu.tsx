import { Check, ChevronsUpDown, LogOut, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GithubIdentityAccount } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GithubIdentityState } from "./types";

export function GithubStatusMenu({
	identityState,
	onAddGithubAccount,
	onDisconnectGithub,
	onSwitchGithubAccount,
}: {
	identityState: Extract<GithubIdentityState, { status: "connected" }>;
	onAddGithubAccount: () => void;
	onDisconnectGithub: () => void;
	onSwitchGithubAccount: (githubUserId: number) => void;
}) {
	const identitySession = identityState.session;
	const accounts = identityState.accounts.length
		? identityState.accounts
		: [identitySession];
	const triggerLabel = identitySession.login;
	const hasMultiple = accounts.length > 1;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="GitHub account menu"
				className="group/gh-trigger inline-flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground"
			>
				<Avatar
					size="sm"
					className="size-4 ring-1 ring-foreground/10 ring-offset-1 ring-offset-transparent transition-[box-shadow] group-hover/gh-trigger:ring-foreground/25"
				>
					{identitySession?.avatarUrl ? (
						<AvatarImage
							src={identitySession.avatarUrl}
							alt={identitySession.login}
						/>
					) : null}
					<AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
						{identitySession?.login.slice(0, 2).toUpperCase() ?? "GH"}
					</AvatarFallback>
				</Avatar>
				<span className="text-[13px] font-medium">{triggerLabel}</span>
				{hasMultiple ? (
					<ChevronsUpDown
						className="size-3 opacity-60 transition-opacity group-hover/gh-trigger:opacity-100"
						strokeWidth={1.8}
					/>
				) : null}
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="min-w-64 select-none p-1.5"
			>
				<DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
					GitHub CLI account
				</DropdownMenuLabel>
				<div className="flex flex-col gap-0.5">
					{accounts.map((account) => (
						<AccountMenuItem
							key={account.githubUserId}
							account={account}
							active={account.githubUserId === identitySession.githubUserId}
							onSelect={() => onSwitchGithubAccount(account.githubUserId)}
						/>
					))}
				</div>
				<DropdownMenuSeparator className="-mx-1.5 my-1.5" />
				<DropdownMenuItem
					onClick={onAddGithubAccount}
					className="gap-2 px-2 py-1.5 text-[13px]"
				>
					<Plus className="size-3.5" strokeWidth={1.8} />
					Reconnect
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={onDisconnectGithub}
					variant="destructive"
					className="gap-2 px-2 py-1.5 text-[13px]"
				>
					<LogOut className="size-3.5" strokeWidth={1.8} />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AccountMenuItem({
	account,
	active,
	onSelect,
}: {
	account: GithubIdentityAccount;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<DropdownMenuItem
			onClick={active ? undefined : onSelect}
			aria-current={active ? "true" : undefined}
			className={cn(
				"gap-2.5 rounded-md px-2 py-1.5 text-[13px]",
				active &&
					"bg-accent/40 focus:bg-accent/55 data-[highlighted]:bg-accent/55",
			)}
		>
			<Avatar
				size="sm"
				className={cn(
					"size-7 ring-1 ring-offset-1 ring-offset-popover",
					active ? "ring-foreground/40" : "ring-foreground/10",
				)}
			>
				{account.avatarUrl ? (
					<AvatarImage src={account.avatarUrl} alt={account.login} />
				) : null}
				<AvatarFallback className="bg-muted text-[11px] font-medium text-muted-foreground">
					{account.login.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="flex min-w-0 flex-1 flex-col leading-tight">
				<span
					className={cn(
						"truncate text-[13px] font-medium",
						active ? "text-foreground" : "text-foreground/90",
					)}
				>
					{account.login}
				</span>
				<span className="truncate text-[10.5px] text-muted-foreground/80">
					{active ? "Active" : "Reconnect with this account"}
				</span>
			</div>
			{active ? (
				<span
					aria-hidden
					className="flex size-4 items-center justify-center rounded-full bg-foreground/10 text-foreground"
				>
					<Check className="size-2.5" strokeWidth={2.5} />
				</span>
			) : null}
		</DropdownMenuItem>
	);
}
