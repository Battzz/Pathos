import { ArrowRight } from "lucide-react";
import pathosLogoSrc from "@/assets/pathos-logo-light.png";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "../types";
import { Atmosphere, MetaLine, RuleSegment } from "./editorial-chrome";

const REVEAL = {
	rule: 60,
	topMeta: 220,
	greek: 340,
	wordmark: 460,
	tagline: 760,
	cta: 1020,
	footer: 1180,
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
				"transition-none",
				isActive
					? "editorial-active editorial-instant translate-y-0 opacity-100 blur-0"
					: "pointer-events-none translate-y-0 opacity-0 blur-0",
			)}
		>
			<Atmosphere />

			<header className="relative z-10 flex shrink-0 items-center justify-between gap-8 px-12 pl-32 pt-14">
				<MetaLine delay={REVEAL.topMeta}>
					<RuleSegment align="start" delay={REVEAL.rule} />
					<span>Pathos · Edition I</span>
				</MetaLine>
				<MetaLine align="end" delay={REVEAL.topMeta}>
					<span>Local · Yours · Offline</span>
					<RuleSegment align="end" delay={REVEAL.rule} />
				</MetaLine>
			</header>

			<div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-center px-12">
				<div className="grid grid-cols-12 items-end gap-x-16 gap-y-10">
					<div className="col-span-12 lg:col-span-7">
						<div
							className="editorial-stage mb-7 flex items-baseline gap-4"
							style={{ animationDelay: `${REVEAL.greek}ms` }}
						>
							<span aria-hidden className="block h-px w-9 bg-foreground/30" />
							<span className="font-display text-[20px] italic leading-none text-foreground/65">
								πάθος
							</span>
							<span className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-muted-foreground/55">
								/ páthos / n.
							</span>
						</div>

						<h1
							aria-label="Pathos"
							className="font-display font-normal leading-[0.88] tracking-[-0.035em] text-foreground/95"
						>
							<span className="block overflow-hidden pb-2">
								<span
									className="editorial-mask block text-[clamp(7.5rem,14vw,13rem)]"
									style={{ animationDelay: `${REVEAL.wordmark}ms` }}
								>
									Pathos
									<span style={{ color: "var(--editorial-accent)" }}>.</span>
								</span>
							</span>
						</h1>
					</div>

					<div className="col-span-12 lg:col-span-5 lg:pb-4">
						<p
							className="editorial-stage font-display text-[clamp(20px,2.1vw,26px)] leading-[1.4] text-foreground/80 [text-wrap:balance]"
							style={{ animationDelay: `${REVEAL.tagline}ms` }}
						>
							<span className="text-foreground/95">AI generates the code.</span>
							<br />
							Pathos is where you{" "}
							<span style={{ color: "var(--editorial-accent)" }}>
								orchestrate
							</span>
							, <span style={{ color: "var(--editorial-accent)" }}>review</span>
							, and{" "}
							<span style={{ color: "var(--editorial-accent)" }}>ship</span> it.
						</p>

						<div
							className="editorial-stage mt-10"
							style={{ animationDelay: `${REVEAL.cta}ms` }}
						>
							<button
								type="button"
								onClick={onNext}
								className="group/cta relative inline-flex cursor-pointer items-center gap-3 py-2 pr-1 font-mono text-[12px] uppercase tracking-[0.36em] text-foreground/85 transition-colors duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:text-foreground"
							>
								<span className="transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/cta:translate-x-0.5">
									Explore
								</span>
								<ArrowRight
									className="size-3.5 transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/cta:translate-x-1"
									strokeWidth={1.4}
								/>
							</button>
						</div>
					</div>
				</div>
			</div>

			<footer className="relative z-10 flex shrink-0 items-end justify-between gap-8 px-12 pb-10">
				<div
					className="editorial-stage flex items-center gap-3"
					style={{ animationDelay: `${REVEAL.footer}ms` }}
				>
					<img
						src={pathosLogoSrc}
						alt=""
						aria-hidden
						draggable={false}
						className="size-7 rounded-[6px] opacity-90"
					/>
					<div className="flex flex-col gap-0.5">
						<span className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-foreground/75">
							Pathos
						</span>
						<span className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground/55">
							A workshop for the things you ship
						</span>
					</div>
				</div>
				<MetaLine align="end" delay={REVEAL.footer}>
					<span>MMXXV</span>
					<span className="text-foreground/30">·</span>
					<span>Made by hand</span>
				</MetaLine>
			</footer>
		</section>
	);
}
