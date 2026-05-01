import { ArrowRight } from "lucide-react";
import { AnimatedIdentityNet } from "@/components/animated-identity-net";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "../types";

const REVEAL = {
	net: 80,
	title: 240,
	subtitle: 600,
	cta: 920,
	footer: 1140,
} as const;

export function IntroPreview({
	step,
	onNext,
}: {
	step: OnboardingStep;
	onNext: () => void;
}) {
	const isActive = step === "intro";

	return (
		<section
			aria-label="Welcome to Pathos"
			aria-hidden={!isActive}
			className={cn(
				"absolute inset-0 z-10 flex flex-col overflow-hidden bg-background text-foreground",
				isActive
					? "editorial-active editorial-instant translate-y-0 opacity-100"
					: "pointer-events-none translate-y-0 opacity-0",
			)}
		>
			<div
				className="editorial-stage absolute inset-0 z-0"
				style={{ animationDelay: `${REVEAL.net}ms` }}
			>
				<AnimatedIdentityNet variant={0} />
			</div>

			<div className="relative z-10 mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start justify-center px-10 pt-16">
				<h1
					aria-label="Pathos"
					className="editorial-stage font-display font-normal leading-[0.95] tracking-[-0.025em] text-foreground/95"
					style={{ animationDelay: `${REVEAL.title}ms` }}
				>
					<span className="block text-[clamp(56px,9vw,92px)]">
						Pathos
						<span aria-hidden style={{ color: "var(--editorial-accent)" }}>
							.
						</span>
					</span>
				</h1>

				<p
					className="editorial-stage mt-7 max-w-[440px] text-[14.5px] leading-[1.6] text-muted-foreground"
					style={{ animationDelay: `${REVEAL.subtitle}ms` }}
				>
					AI generates the code. Pathos is where you{" "}
					<span style={{ color: "var(--editorial-accent)" }}>orchestrate</span>,{" "}
					<span style={{ color: "var(--editorial-accent)" }}>review</span>, and{" "}
					<span style={{ color: "var(--editorial-accent)" }}>ship</span> it.
				</p>

				<button
					type="button"
					onClick={onNext}
					className="editorial-stage group/cta mt-9 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background/80 px-3.5 text-[13px] font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-muted"
					style={{ animationDelay: `${REVEAL.cta}ms` }}
				>
					<span>Get started</span>
					<ArrowRight
						className="size-3.5 transition-transform duration-300 ease-out group-hover/cta:translate-x-0.5"
						strokeWidth={1.75}
					/>
				</button>
			</div>

			<div
				className="editorial-stage relative z-10 flex shrink-0 items-center justify-end gap-2 px-10 pb-8 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/55"
				style={{ animationDelay: `${REVEAL.footer}ms` }}
			>
				<span>Local</span>
				<span aria-hidden className="text-muted-foreground/35">
					·
				</span>
				<span>Yours</span>
				<span aria-hidden className="text-muted-foreground/35">
					·
				</span>
				<span>Offline</span>
			</div>
		</section>
	);
}
