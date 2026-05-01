import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedIdentityNet } from "@/components/animated-identity-net";
import { cn } from "@/lib/utils";

/**
 * Onboarding chrome split into two voices:
 *
 * - The welcome screen (`intro-preview.tsx`) keeps the editorial feel —
 *   `Atmosphere`, `MetaLine`, `RuleSegment` and the `EDITORIAL_REVEAL`
 *   timings drive its cinematic open.
 * - The four setup screens use `StepShell`, a calm app-native frame —
 *   solid background, small mono meta line, sans title, hairline card,
 *   ghost/outline footer buttons.
 */

export const EDITORIAL_REVEAL = {
	rule: 60,
	topMeta: 220,
	preTitle: 340,
	title: 460,
	subtitle: 760,
	content: 940,
	footer: 1100,
} as const;

const STEP_REVEAL = {
	meta: 60,
	title: 180,
	subtitle: 320,
	content: 460,
	footer: 600,
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
			className="group/back -ml-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
		>
			<ArrowLeft
				className="size-3.5 transition-transform duration-300 ease-out group-hover/back:-translate-x-0.5"
				strokeWidth={1.75}
			/>
			<span>Back</span>
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
			className="group/next inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
		>
			<span>{label}</span>
			<ArrowRight
				className="size-3.5 transition-transform duration-300 ease-out group-hover/next:translate-x-0.5"
				strokeWidth={1.75}
			/>
		</button>
	);
}

export function StepShell({
	active,
	ariaLabel,
	metaLabel = "Pathos · Setup",
	step,
	totalSteps = 5,
	title,
	subtitle,
	children,
	footer,
	contentClassName,
	maxWidth = "max-w-[640px]",
	netVariant,
}: {
	active: boolean;
	ariaLabel: string;
	metaLabel?: string;
	step: number;
	totalSteps?: number;
	title: ReactNode;
	subtitle: ReactNode;
	children: ReactNode;
	footer: ReactNode;
	contentClassName?: string;
	maxWidth?: string;
	netVariant?: number;
}) {
	const stepLabel = String(step).padStart(2, "0");
	const totalLabel = String(totalSteps).padStart(2, "0");
	const variant = netVariant ?? step - 1;

	return (
		<section
			aria-label={ariaLabel}
			aria-hidden={!active}
			className={cn(
				"absolute inset-0 z-20 flex flex-col overflow-hidden bg-background text-foreground",
				active
					? "editorial-active editorial-instant translate-y-0 opacity-100"
					: "pointer-events-none translate-y-0 opacity-0",
			)}
		>
			<div
				className="editorial-stage absolute inset-0 z-0"
				style={{ animationDelay: `${STEP_REVEAL.meta}ms` }}
			>
				<AnimatedIdentityNet variant={variant} />
			</div>

			<div
				className={cn(
					"relative z-10 mx-auto flex w-full flex-1 flex-col px-10 pt-20 pb-10",
					maxWidth,
				)}
			>
				<div
					className="editorial-stage flex shrink-0 items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/70"
					style={{ animationDelay: `${STEP_REVEAL.meta}ms` }}
				>
					<span>{metaLabel}</span>
					<span className="tabular-nums text-foreground/65">
						{stepLabel}
						<span className="mx-1.5 text-muted-foreground/40">/</span>
						{totalLabel}
					</span>
				</div>

				<div className="mt-12 flex shrink-0 flex-col">
					<h2
						className="editorial-stage text-[28px] font-medium leading-[1.18] tracking-[-0.018em] text-foreground"
						aria-label={typeof title === "string" ? title : undefined}
						style={{ animationDelay: `${STEP_REVEAL.title}ms` }}
					>
						{title}
					</h2>
					<p
						className="editorial-stage mt-2.5 max-w-[480px] text-[14px] leading-[1.6] text-muted-foreground"
						style={{ animationDelay: `${STEP_REVEAL.subtitle}ms` }}
					>
						{subtitle}
					</p>
				</div>

				<div
					className={cn(
						"editorial-stage mt-10 flex min-h-0 flex-1 flex-col",
						contentClassName,
					)}
					style={{ animationDelay: `${STEP_REVEAL.content}ms` }}
				>
					{children}
				</div>

				<footer
					className="editorial-stage flex shrink-0 items-center justify-between gap-4 pt-8"
					style={{ animationDelay: `${STEP_REVEAL.footer}ms` }}
				>
					{footer}
				</footer>
			</div>
		</section>
	);
}
