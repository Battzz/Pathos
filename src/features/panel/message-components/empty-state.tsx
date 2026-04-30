import { Asterisk, FolderPlus } from "lucide-react";
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

function Atmosphere({ variant = "dots" }: { variant?: "dots" | "net" }) {
	if (variant === "net") {
		return (
			<div
				aria-hidden
				className="pointer-events-none absolute inset-[-45vh_-38vw] -z-10 overflow-hidden opacity-60"
			>
				<AnimatedIdentityNet />
			</div>
		);
	}

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
		>
			{/* Soft radial glow centered on the logo */}
			<div
				className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-[58%] rounded-full opacity-[0.55] dark:opacity-40"
				style={{
					background:
						"radial-gradient(closest-side, color-mix(in oklch, var(--foreground) 6%, transparent), transparent 75%)",
				}}
			/>
			{/* Fine dot grid, fading at the edges */}
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
			className="group/empty-action relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-foreground/12 bg-foreground px-5 text-[12.5px] font-medium tracking-[-0.005em] text-background shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45)] transition-[transform,background-color] duration-200 ease-out hover:-translate-y-px hover:bg-foreground/92 active:translate-y-0"
		>
			<Icon className="size-3.5 text-background/80" strokeWidth={1.75} />
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
			className="group/empty-ghost inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium tracking-[-0.005em] text-muted-foreground/85 transition-colors duration-200 ease-out hover:text-foreground"
		>
			<span>{label}</span>
			<span
				aria-hidden
				className="inline-block translate-x-0 transition-transform duration-200 ease-out group-hover/empty-ghost:translate-x-0.5"
			>
				→
			</span>
		</button>
	);
}

function ProjectPickerEmpty({
	onCloneProject,
	onOpenProject,
}: {
	onCloneProject?: () => void;
	onOpenProject?: () => void;
}) {
	return (
		<div className="relative flex w-full max-w-[620px] flex-col items-center px-6 text-center">
			<Atmosphere variant="net" />

			<div className="flex flex-col items-center gap-7">
				<div
					className="flex flex-col items-center gap-3 opacity-0"
					style={{
						animation: "empty-rise 760ms ease-out forwards",
						animationDelay: "0ms",
					}}
				>
					<div className="font-mono text-[10px] font-medium uppercase tracking-[0.26em] text-muted-foreground/55">
						Nothing selected
					</div>
					<h1 className="max-w-[560px] text-balance text-[42px] font-medium leading-[1.02] tracking-[-0.035em] text-foreground/92">
						Choose a workspace
					</h1>
					<p className="max-w-[420px] text-balance text-[13px] leading-6 text-muted-foreground/75">
						Select a project or thread from the sidebar, or open another
						repository to start a new workspace.
					</p>
				</div>

				<div
					className="flex items-center gap-1 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "140ms",
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

function WorkspaceSessionEmpty({
	workspaceLabel,
	sessionCount,
	onCloneProject,
	onOpenProject,
}: {
	workspaceLabel: string;
	sessionCount: number;
	onCloneProject?: () => void;
	onOpenProject?: () => void;
}) {
	const eyebrow = sessionCount > 0 ? "No session selected" : "No sessions yet";
	const body =
		sessionCount > 0
			? "Choose an existing thread from the sidebar, or start a fresh one when you are ready."
			: "Start a thread to work inside this project, or bring in another repository for something new.";

	return (
		<div className="relative flex w-full max-w-[620px] flex-col items-center px-6 text-center">
			<Atmosphere variant="net" />

			<div className="flex flex-col items-center gap-7">
				<div
					className="flex flex-col items-center gap-3 opacity-0"
					style={{
						animation: "empty-rise 760ms ease-out forwards",
						animationDelay: "0ms",
					}}
				>
					<div className="font-mono text-[10px] font-medium uppercase tracking-[0.26em] text-muted-foreground/55">
						{eyebrow}
					</div>
					<h1 className="max-w-[560px] text-balance text-[42px] font-medium leading-[1.02] tracking-[-0.035em] text-foreground/92">
						{workspaceLabel}
					</h1>
					<p className="max-w-[420px] text-balance text-[13px] leading-6 text-muted-foreground/75">
						{body}
					</p>
				</div>

				<div
					className="grid w-full max-w-[420px] grid-cols-3 gap-2 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "140ms",
					}}
				>
					<div className="rounded-md border border-foreground/8 bg-foreground/[0.025] px-3 py-2.5 text-left">
						<div className="text-[11px] text-muted-foreground/65">Project</div>
						<div className="mt-1 truncate text-[12.5px] font-medium text-foreground/82">
							{workspaceLabel}
						</div>
					</div>
					<div className="rounded-md border border-foreground/8 bg-foreground/[0.025] px-3 py-2.5 text-left">
						<div className="text-[11px] text-muted-foreground/65">Sessions</div>
						<div className="mt-1 text-[12.5px] font-medium text-foreground/82">
							{sessionCount}
						</div>
					</div>
					<div className="rounded-md border border-foreground/8 bg-foreground/[0.025] px-3 py-2.5 text-left">
						<div className="text-[11px] text-muted-foreground/65">Status</div>
						<div className="mt-1 text-[12.5px] font-medium text-foreground/82">
							Ready
						</div>
					</div>
				</div>

				<div
					className="flex items-center gap-1 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "240ms",
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
			return (
				<WorkspaceSessionEmpty
					workspaceLabel={workspaceLabel}
					sessionCount={sessionCount}
					onCloneProject={onCloneProject}
					onOpenProject={onOpenProject}
				/>
			);
		}

		return (
			<ProjectPickerEmpty
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
			<Atmosphere />

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
