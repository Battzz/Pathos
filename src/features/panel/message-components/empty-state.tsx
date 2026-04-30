import { Asterisk, FolderPlus, Globe } from "lucide-react";
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

function Eyebrow({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground/55">
			<span aria-hidden className="block h-px w-7 bg-border/70" />
			<span>{label}</span>
			<span aria-hidden className="block h-px w-7 bg-border/70" />
		</div>
	);
}

function Atmosphere() {
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

function ActionButton({
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
			className="group/empty-action relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/40 px-3.5 text-[13.5px] font-medium text-foreground/85 backdrop-blur-sm transition-[transform,background-color,border-color,color] duration-200 ease-out hover:-translate-y-px hover:border-border hover:bg-background/80 hover:text-foreground active:translate-y-0"
		>
			<span
				aria-hidden
				className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent opacity-0 transition-opacity duration-200 group-hover/empty-action:opacity-100"
			/>
			<Icon
				className="size-3.5 text-muted-foreground/80 transition-colors duration-200 group-hover/empty-action:text-foreground"
				strokeWidth={1.75}
			/>
			<span>{label}</span>
		</button>
	);
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
				<PathosLogoAnimated size={28} className="opacity-85" />
				<p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/65">
					Preparing workspace
					<span className="ml-1 inline-block animate-pulse">…</span>
				</p>
			</div>
		);
	}

	if (!hasSession) {
		return (
			<div className="relative flex w-full max-w-[520px] flex-col items-center px-6 text-center">
				<Atmosphere />

				<div className="flex flex-col items-center gap-7">
					<div
						className="opacity-0"
						style={{
							animation: "empty-rise 720ms ease-out forwards",
							animationDelay: "0ms",
						}}
					>
						<Eyebrow label="New Workspace" />
					</div>

					<div
						className="relative opacity-0"
						style={{
							animation: "empty-rise 760ms ease-out forwards",
							animationDelay: "80ms",
						}}
					>
						<div
							aria-hidden
							className="absolute inset-0 -z-10 scale-[1.8] rounded-full bg-foreground/[0.04] blur-2xl dark:bg-foreground/[0.08]"
						/>
						<PathosLogoAnimated size={52} />
					</div>

					<div
						className="flex flex-col items-center gap-3 opacity-0"
						style={{
							animation: "empty-rise 720ms ease-out forwards",
							animationDelay: "180ms",
						}}
					>
						<h2
							aria-label="Bring a project into Pathos"
							className="text-balance text-[30px] font-medium leading-[1.08] tracking-[-0.028em] text-foreground/95"
						>
							Bring a project
							<span className="ml-2 font-light text-foreground/55">
								into Pathos
							</span>
						</h2>
						<p className="max-w-[340px] text-[13px] leading-[1.6] text-muted-foreground/80">
							Open a local codebase or clone a remote repository to begin a
							focused workspace.
						</p>
					</div>

					<div
						className="flex flex-col items-center gap-2 opacity-0 sm:flex-row"
						style={{
							animation: "empty-rise 720ms ease-out forwards",
							animationDelay: "280ms",
						}}
					>
						<ActionButton
							icon={FolderPlus}
							label="Open project"
							onClick={onOpenProject}
						/>
						<ActionButton
							icon={Globe}
							label="Clone from URL"
							onClick={onCloneProject}
						/>
					</div>
				</div>

				<div
					className="mt-12 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] text-muted-foreground/40 opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "420ms",
					}}
				>
					<span
						aria-hidden
						className="block size-1 rounded-full bg-muted-foreground/40"
					/>
					<span>Local-first · Yours alone</span>
					<span
						aria-hidden
						className="block size-1 rounded-full bg-muted-foreground/40"
					/>
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
					className="opacity-0"
					style={{
						animation: "empty-rise 720ms ease-out forwards",
						animationDelay: "0ms",
					}}
				>
					<Eyebrow label="Ready" />
				</div>

				<div
					className="relative opacity-0"
					style={{
						animation: "empty-rise 760ms ease-out forwards",
						animationDelay: "80ms",
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
						animationDelay: "180ms",
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
