import { Asterisk, FolderPlus, Globe } from "lucide-react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

const TAGLINES = [
	"Cooking up something tasty",
	"Time to tinker",
	"Plotting world domination",
	"Ready to break things",
	"Polishing the rough edges",
	"Shipping bold ideas",
	"Today we ship something cool",
	"Brewing fresh chaos",
];

function pickTagline(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i += 1) {
		hash = (hash * 31 + label.charCodeAt(i)) | 0;
	}
	return TAGLINES[Math.abs(hash) % TAGLINES.length] ?? TAGLINES[0]!;
}

export function EmptyState({
	hasSession,
	onCloneProject,
	onOpenProject,
	providerName = null,
	workspaceState = null,
	workspaceLabel = null,
}: {
	hasSession: boolean;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
	providerName?: string | null;
	workspaceState?: string | null;
	workspaceLabel?: string | null;
}) {
	if (workspaceState === "initializing") {
		return (
			<div className="flex flex-col items-center gap-3 text-center">
				<HelmorLogoAnimated size={28} className="opacity-85" />
				<p className="text-[13px] text-muted-foreground">
					Helmor is preparing this workspace…
				</p>
			</div>
		);
	}

	if (!hasSession) {
		return (
			<div className="flex flex-col items-center gap-5 text-center">
				<FolderPlus
					aria-hidden
					className="size-9 text-muted-foreground/55"
					strokeWidth={1.5}
				/>
				<h2 className="text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.02em] text-muted-foreground">
					Bring a project into Helmor
				</h2>
				<div aria-hidden className="h-px w-56 bg-border/60" />
				<p className="max-w-[360px] text-[13.5px] leading-[1.55] text-muted-foreground/80">
					Open a local codebase or clone a remote repository to start a focused
					workspace.
				</p>
				<div className="flex flex-col items-center gap-2 sm:flex-row">
					<Button
						type="button"
						variant="secondary"
						onClick={onOpenProject}
						className="h-8 cursor-pointer gap-2 rounded-md border border-border/70 bg-muted/70 px-3 text-[14px] font-medium text-foreground/90 hover:bg-muted"
					>
						<FolderPlus className="size-4" strokeWidth={1.8} />
						<span>Open project</span>
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={onCloneProject}
						className="h-8 cursor-pointer gap-2 rounded-md border border-border/70 bg-muted/70 px-3 text-[14px] font-medium text-foreground/90 hover:bg-muted"
					>
						<Globe className="size-4" strokeWidth={1.8} />
						<span>Clone from URL</span>
					</Button>
				</div>
			</div>
		);
	}

	const tagline = workspaceLabel
		? pickTagline(workspaceLabel)
		: "Let's get to it";
	const chatTarget = providerName ?? workspaceLabel ?? "this workspace";
	const ProviderIcon =
		providerName === "OpenAI"
			? OpenAIIcon
			: providerName === "Anthropic"
				? ClaudeIcon
				: Asterisk;

	return (
		<div className="flex flex-col items-center gap-5 text-center">
			<ProviderIcon aria-hidden className="size-9 text-muted-foreground/55" />
			<h2 className="text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.02em] text-muted-foreground">
				Chat with <span className="text-foreground/85">{chatTarget}</span>
			</h2>
			<div aria-hidden className="h-px w-56 bg-border/60" />
			<p className="text-[13.5px] leading-[1.55] text-muted-foreground/80">
				{tagline}
			</p>
		</div>
	);
}
