import { cn } from "@/lib/utils";

export function AnimatedIdentityNet({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn("pointer-events-none absolute inset-0 z-0", className)}
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,color-mix(in_srgb,var(--foreground)_8%,transparent),transparent_31%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_80%,black),var(--background))]" />
			<svg
				className="identity-net absolute inset-0 h-full w-full"
				viewBox="0 0 1200 760"
				preserveAspectRatio="none"
			>
				<defs>
					<linearGradient id="identity-net-line" x1="0" x2="1" y1="0" y2="1">
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
						<stop offset="48%" stopColor="currentColor" stopOpacity="0.22" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
					</linearGradient>
				</defs>
				<g className="text-foreground">
					<path
						className="identity-net-line identity-net-line-a"
						d="M-40 180 C130 116 238 226 385 178 S622 85 794 160 1032 274 1240 194"
					/>
					<path
						className="identity-net-line identity-net-line-b"
						d="M-30 470 C118 391 256 442 388 376 S671 343 812 424 1024 538 1230 448"
					/>
					<path
						className="identity-net-line identity-net-line-c"
						d="M112 20 C174 180 148 308 248 438 S432 618 382 790"
					/>
					<path
						className="identity-net-line identity-net-line-d"
						d="M610 -20 C564 142 672 264 624 420 S548 612 646 792"
					/>
					<path
						className="identity-net-line identity-net-line-e"
						d="M1018 -20 C936 132 1016 278 940 398 S836 586 928 790"
					/>
				</g>
				<g className="identity-net-nodes text-foreground">
					<circle cx="238" cy="226" r="3.5" />
					<circle cx="385" cy="178" r="3.5" />
					<circle cx="622" cy="85" r="3.5" />
					<circle cx="794" cy="160" r="3.5" />
					<circle cx="256" cy="442" r="3.5" />
					<circle cx="388" cy="376" r="3.5" />
					<circle cx="812" cy="424" r="3.5" />
					<circle cx="1018" cy="538" r="3.5" />
					<circle cx="624" cy="420" r="3.5" />
					<circle cx="940" cy="398" r="3.5" />
				</g>
			</svg>
			<div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,transparent_18%,transparent_82%,var(--background)_100%)]" />
		</div>
	);
}
