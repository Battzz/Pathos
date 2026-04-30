import pathosLogoSrc from "@/assets/pathos-logo-light.png";
import { cn } from "@/lib/utils";

/**
 * The opening sequence of the onboarding flow. A short typographic
 * title-card that plays once on first mount before handing off to the
 * intro/welcome — the spine of the brand stamped onto the page.
 *
 * The inner reveal animations live behind the `.editorial-active` parent
 * gate, so they only fire when this card actually becomes visible to the
 * user (not silently while a boot curtain is on top).
 */
export function OnboardingSplash({ active }: { active: boolean }) {
	return (
		<div
			aria-hidden={!active}
			className={cn(
				"absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-background",
				"transition-[opacity,filter] duration-[700ms] ease-[cubic-bezier(.4,0,.2,1)]",
				active
					? "editorial-active opacity-100 blur-0"
					: "pointer-events-none opacity-0 blur-[10px]",
			)}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
					backgroundSize: "220px 220px",
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 opacity-[0.45]"
				style={{
					background:
						"radial-gradient(ellipse 60% 40% at 50% 50%, color-mix(in oklch, var(--editorial-accent) 12%, transparent), transparent 65%)",
				}}
			/>

			<div className="relative flex flex-col items-center">
				<span
					aria-hidden
					className="editorial-trace absolute -top-14 block h-px w-40 bg-foreground/30"
					style={{ animationDelay: "80ms" }}
				/>
				<span
					aria-hidden
					className="editorial-trace absolute -bottom-14 block h-px w-40 bg-foreground/30"
					style={{ animationDelay: "200ms" }}
				/>

				<div
					className="editorial-stage"
					style={{ animationDelay: "280ms", animationDuration: "800ms" }}
				>
					<img
						src={pathosLogoSrc}
						alt=""
						aria-hidden
						draggable={false}
						className="size-16 rounded-[12px] opacity-95 shadow-2xl shadow-black/35"
					/>
				</div>

				<span
					className="editorial-stage mt-7 font-mono text-[10.5px] uppercase tracking-[0.5em] text-foreground/65"
					style={{ animationDelay: "520ms", animationDuration: "700ms" }}
				>
					Pathos
				</span>

				<span
					className="editorial-stage mt-3 font-display text-[20px] italic text-foreground/55"
					style={{ animationDelay: "720ms", animationDuration: "700ms" }}
				>
					πάθος
				</span>
			</div>
		</div>
	);
}
