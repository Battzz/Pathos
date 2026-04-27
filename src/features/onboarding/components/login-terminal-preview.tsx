import type { AgentLoginProvider } from "@/lib/api";
import { cn } from "@/lib/utils";

const loginCommands: Record<AgentLoginProvider, string> = {
	claude: "claude auth login",
	codex: "codex login",
};

const loginLines: Record<AgentLoginProvider, string[]> = {
	claude: [
		"Starting Claude Code authentication...",
		"Opening browser sign-in...",
		"Complete the login in your browser.",
		"Helmor will detect the session when you return.",
	],
	codex: [
		"Starting Codex authentication...",
		"Opening ChatGPT sign-in...",
		"Complete the login in your browser.",
		"Helmor will detect the session when you return.",
	],
};

const providerLabels: Record<AgentLoginProvider, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

export function LoginTerminalPreview({
	provider,
	active,
}: {
	provider: AgentLoginProvider | null;
	active: boolean;
}) {
	const resolvedProvider = provider ?? "codex";
	const command = loginCommands[resolvedProvider];

	return (
		<div
			aria-hidden={!active}
			className={cn(
				"absolute top-1/2 right-0 w-[520px] -translate-y-1/2 transition-all duration-700 ease-[cubic-bezier(.22,.82,.2,1)]",
				active
					? "translate-x-0 opacity-100"
					: "pointer-events-none translate-x-[calc(100%+5rem)] opacity-0",
			)}
		>
			<div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/15">
				<div className="flex h-10 items-center gap-2 border-b border-border/55 bg-background px-4">
					<span className="size-2.5 rounded-full bg-muted-foreground/35" />
					<span className="size-2.5 rounded-full bg-muted-foreground/25" />
					<span className="size-2.5 rounded-full bg-muted-foreground/20" />
					<span className="ml-2 text-xs font-medium text-muted-foreground">
						{providerLabels[resolvedProvider]} login
					</span>
				</div>
				<div className="min-h-[300px] bg-card px-5 py-4 font-mono text-[12px] leading-6 text-muted-foreground">
					<div className="text-foreground">$ {command}</div>
					<div className="mt-4 space-y-1.5">
						{loginLines[resolvedProvider].map((line) => (
							<div key={line}>{line}</div>
						))}
					</div>
					<div className="mt-5 flex items-center gap-2 text-foreground">
						<span className="h-4 w-2 animate-pulse bg-foreground" />
						<span>Waiting for authentication...</span>
					</div>
				</div>
			</div>
		</div>
	);
}
