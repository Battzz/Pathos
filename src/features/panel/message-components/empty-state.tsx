import { ArrowRight, Asterisk, FolderPlus } from "lucide-react";
import { AnimatedIdentityNet } from "@/components/animated-identity-net";
import { ClaudeIcon, OpenAIIcon } from "@/components/icons";
import { PathosLogoAnimated } from "@/components/pathos-logo-animated";

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

function NetAtmosphere({ variant = 0 }: { variant?: number }) {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-[-22vh_-22vw] -z-10 overflow-hidden"
			style={{
				maskImage:
					"radial-gradient(ellipse 78% 70% at 50% 50%, black 18%, transparent 92%)",
				WebkitMaskImage:
					"radial-gradient(ellipse 78% 70% at 50% 50%, black 18%, transparent 92%)",
			}}
		>
			<AnimatedIdentityNet variant={variant} />
		</div>
	);
}

function DotsAtmosphere() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
		>
			<div
				className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-[58%] rounded-full opacity-[0.55] dark:opacity-40"
				style={{
					background:
						"radial-gradient(closest-side, color-mix(in oklch, var(--foreground) 6%, transparent), transparent 75%)",
				}}
			/>
			<div
				className="absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
				style={{
					backgroundImage:
						"radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--foreground) 14%, transparent) 0.6px, transparent 0.6px)",
					backgroundSize: "22px 22px",
					maskImage:
						"radial-gradient(ellipse 70% 55% at 50% 50%, black 0%, transparent 75%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 70% 55% at 50% 50%, black 0%, transparent 75%)",
				}}
			/>
		</div>
	);
}

function PrimaryAction({
	icon: Icon,
	label,
	onClick,
}: {
	icon: typeof FolderPlus;
	label: string;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group/empty-action inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background/80 px-3.5 text-[13px] font-medium text-foreground backdrop-blur-sm transition-colors duration-200 ease-out hover:bg-muted"
		>
			<Icon className="size-3.5" strokeWidth={1.75} />
			<span>{label}</span>
		</button>
	);
}

function GhostAction({
	label,
	onClick,
}: {
	label: string;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group/empty-ghost inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
		>
			<span>{label}</span>
			<ArrowRight
				className="size-3.5 transition-transform duration-300 ease-out group-hover/empty-ghost:translate-x-0.5"
				strokeWidth={1.75}
			/>
		</button>
	);
}

function HeroEmpty({
	title,
	description,
	netVariant,
	onCloneProject,
	onOpenProject,
}: {
	title: string;
	description: string;
	netVariant: number;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
}) {
	return (
		<div className="relative flex w-full max-w-[640px] flex-col items-center px-6 text-center">
			<NetAtmosphere variant={netVariant} />

			<div className="flex flex-col items-center">
				<h1
					aria-label={title}
					className="font-display font-normal leading-[0.96] tracking-[-0.025em] text-foreground/95 opacity-0"
					style={{
						animation: "empty-rise 880ms ease-out forwards",
						animationDelay: "60ms",
					}}
				>
					<span className="block text-[clamp(40px,5.5vw,60px)]">
						{title}
						<span aria-hidden style={{ color: "var(--editorial-accent)" }}>
							.
						</span>
					</span>
				</h1>

				<p
					className="mt-5 max-w-[440px] text-balance text-[14px] leading-[1.6] text-muted-foreground opacity-0"
					style={{
						animation: "empty-rise 760ms ease-out forwards",
						animationDelay: "200ms",
					}}
				>
					{description}
				</p>

				<div
					className="mt-8 flex items-center gap-1 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "340ms",
					}}
				>
					<PrimaryAction
						icon={FolderPlus}
						label="Open project"
						onClick={onOpenProject}
					/>
					<GhostAction label="Clone from URL" onClick={onCloneProject} />
				</div>
			</div>

			<style>{`
				@keyframes empty-rise {
					0% { opacity: 0; transform: translateY(8px); filter: blur(2px); }
					60% { filter: blur(0); }
					100% { opacity: 1; transform: translateY(0); filter: blur(0); }
				}
			`}</style>
		</div>
	);
}

export function EmptyState({
	hasSession,
	onCloneProject,
	onOpenProject,
	providerName = null,
	workspaceState = null,
	workspaceLabel = null,
	sessionCount = 0,
}: {
	hasSession: boolean;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
	providerName?: string | null;
	workspaceState?: string | null;
	workspaceLabel?: string | null;
	sessionCount?: number;
}) {
	if (workspaceState === "initializing") {
		return (
			<div className="flex flex-col items-center gap-3 text-center">
				<PathosLogoAnimated size={28} className="opacity-85" />
				<p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/65">
					Preparing workspace
					<span className="ml-1 inline-block animate-pulse">…</span>
				</p>
			</div>
		);
	}

	if (!hasSession) {
		if (workspaceLabel) {
			const description =
				sessionCount > 0
					? "Choose an existing thread from the sidebar, or start a fresh one when you are ready."
					: "Start a thread to work inside this project, or bring in another repository for something new.";

			return (
				<HeroEmpty
					title={workspaceLabel}
					description={description}
					netVariant={2}
					onCloneProject={onCloneProject}
					onOpenProject={onOpenProject}
				/>
			);
		}

		return (
			<HeroEmpty
				title="Choose a workspace"
				description="Select a project or thread from the sidebar, or open another repository to start a new workspace."
				netVariant={0}
				onCloneProject={onCloneProject}
				onOpenProject={onOpenProject}
			/>
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
		<div className="relative flex w-full max-w-[520px] flex-col items-center px-6 text-center">
			<DotsAtmosphere />

			<div className="flex flex-col items-center gap-6">
				<div
					className="relative opacity-0"
					style={{
						animation: "empty-rise 760ms ease-out forwards",
						animationDelay: "0ms",
					}}
				>
					<div
						aria-hidden
						className="absolute inset-0 -z-10 scale-[2] rounded-full bg-foreground/[0.05] blur-2xl dark:bg-foreground/[0.08]"
					/>
					<ProviderIcon aria-hidden className="size-10 text-foreground/75" />
				</div>

				<div
					className="flex flex-col items-center gap-3 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "100ms",
					}}
				>
					<h2
						aria-label={`Chat with ${chatTarget}`}
						className="text-balance text-[28px] font-medium leading-[1.1] tracking-[-0.025em] text-foreground/90"
					>
						<span className="font-light text-foreground/55">Chat with </span>
						<span className="text-foreground/95">{chatTarget}</span>
					</h2>
					<p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/65">
						{tagline}
					</p>
				</div>
			</div>

			<style>{`
				@keyframes empty-rise {
					0% { opacity: 0; transform: translateY(8px); filter: blur(2px); }
					60% { filter: blur(0); }
					100% { opacity: 1; transform: translateY(0); filter: blur(0); }
				}
			`}</style>
		</div>
	);
}
