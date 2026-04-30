import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared editorial chrome for the onboarding flow.
 *
 * - `Atmosphere` paints the warm radial wash + grain that backs every screen.
 * - `MetaLine` and `RuleSegment` render the printed-page metadata strips.
 * - `StepShell` wraps each non-intro onboarding step with a matching frame:
 *    metadata header, chapter eyebrow, display-serif title block, content
 *    slot, and Back / Continue footer in the same monospace marks as the
 *    intro CTA.
 */

export const EDITORIAL_REVEAL = {
	rule: 60,
	topMeta: 220,
	title: 360,
	subtitle: 640,
	content: 820,
	footer: 1020,
} as const;

export function Atmosphere() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div
				className="absolute inset-0 opacity-[0.55]"
				style={{
					background:
						"radial-gradient(ellipse 90% 60% at 28% 38%, color-mix(in oklch, var(--foreground) 5%, transparent), transparent 70%)",
				}}
			/>
			<div
				className="absolute inset-0 opacity-[0.32]"
				style={{
					background:
						"radial-gradient(ellipse 80% 50% at 78% 72%, color-mix(in oklch, var(--editorial-accent) 9%, transparent), transparent 68%)",
				}}
			/>
			<div
				className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
					backgroundSize: "220px 220px",
				}}
			/>
		</div>
	);
}

export function MetaLine({
	align = "start",
	delay,
	className,
	children,
}: {
	align?: "start" | "end";
	delay: number;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"editorial-stage flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.32em] text-muted-foreground/65",
				align === "end" && "justify-end",
				className,
			)}
			style={{ animationDelay: `${delay}ms` }}
		>
			{children}
		</div>
	);
}

export function RuleSegment({
	align,
	delay,
	className,
}: {
	align: "start" | "end";
	delay: number;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			data-align={align}
			className={cn(
				"editorial-rule block h-px w-8 bg-foreground/25",
				className,
			)}
			style={{ animationDelay: `${delay}ms` }}
		/>
	);
}

export function StepBackButton({
	onClick,
	disabled,
}: {
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="group/back inline-flex cursor-pointer items-center gap-3 py-2 font-mono text-[12px] uppercase tracking-[0.36em] text-muted-foreground/75 transition-colors duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:text-foreground disabled:cursor-default disabled:opacity-40"
		>
			<ArrowLeft
				className="size-3.5 transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/back:-translate-x-1"
				strokeWidth={1.4}
			/>
			<span className="transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/back:-translate-x-0.5">
				Back
			</span>
		</button>
	);
}

export function StepNextButton({
	label = "Continue",
	onClick,
	disabled,
}: {
	label?: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="group/next relative inline-flex cursor-pointer items-center gap-3 py-2 pr-1 font-mono text-[12px] uppercase tracking-[0.36em] text-foreground/85 transition-colors duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:text-foreground disabled:cursor-default disabled:opacity-40"
		>
			<span className="transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/next:translate-x-0.5">
				{label}
			</span>
			<ArrowRight
				className="size-3.5 transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/next:translate-x-1"
				strokeWidth={1.4}
			/>
		</button>
	);
}

export function StepShell({
	active,
	ariaLabel,
	chapter,
	folio,
	title,
	subtitle,
	children,
	footer,
	contentClassName,
}: {
	active: boolean;
	ariaLabel: string;
	chapter: { number: string; name: string };
	folio: string;
	title: ReactNode;
	subtitle: ReactNode;
	children: ReactNode;
	footer: ReactNode;
	contentClassName?: string;
}) {
	return (
		<section
			aria-label={ariaLabel}
			aria-hidden={!active}
			className={cn(
				"absolute inset-0 z-20 flex flex-col overflow-hidden bg-background text-foreground",
				"transition-none",
				active
					? "editorial-active editorial-instant translate-y-0 opacity-100 blur-0"
					: "pointer-events-none translate-y-0 opacity-0 blur-0",
			)}
		>
			<Atmosphere />

			<header className="relative z-10 flex shrink-0 items-center justify-between gap-8 px-12 pl-32 pt-14">
				<MetaLine delay={EDITORIAL_REVEAL.topMeta}>
					<RuleSegment align="start" delay={EDITORIAL_REVEAL.rule} />
					<span>
						Chapter {chapter.number} · {chapter.name}
					</span>
				</MetaLine>
				<MetaLine align="end" delay={EDITORIAL_REVEAL.topMeta}>
					<span>{folio}</span>
					<RuleSegment align="end" delay={EDITORIAL_REVEAL.rule} />
				</MetaLine>
			</header>

			<div className="relative z-10 mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-12 pt-12">
				<div className="flex shrink-0 flex-col">
					<h2
						className="font-display font-normal leading-[0.95] tracking-[-0.02em] text-foreground/95"
						aria-label={typeof title === "string" ? title : undefined}
					>
						<span className="block overflow-hidden pb-1">
							<span
								className="editorial-mask block text-[clamp(2.6rem,4.4vw,4rem)]"
								style={{ animationDelay: `${EDITORIAL_REVEAL.title}ms` }}
							>
								{title}
							</span>
						</span>
					</h2>

					<p
						className="editorial-stage mt-5 max-w-[560px] text-[clamp(14px,1.15vw,15.5px)] leading-[1.65] text-muted-foreground/85"
						style={{ animationDelay: `${EDITORIAL_REVEAL.subtitle}ms` }}
					>
						{subtitle}
					</p>
				</div>

				<div
					className={cn(
						"editorial-stage mt-12 min-h-0 flex-1",
						contentClassName,
					)}
					style={{ animationDelay: `${EDITORIAL_REVEAL.content}ms` }}
				>
					{children}
				</div>
			</div>

			<footer
				className="editorial-stage relative z-10 flex shrink-0 items-center justify-between gap-8 px-12 pb-10"
				style={{ animationDelay: `${EDITORIAL_REVEAL.footer}ms` }}
			>
				{footer}
			</footer>
		</section>
	);
}
