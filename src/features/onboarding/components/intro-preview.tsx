import { ArrowRight } from "lucide-react";
import helmorLogoSrc from "@/assets/helmor-logo.png";
import { Button } from "@/components/ui/button";
import { HelmorOnboardingMockup } from "../mockup";
import type { OnboardingStep } from "../types";

export function IntroPreview({
	step,
	onNext,
}: {
	step: OnboardingStep;
	onNext: () => void;
}) {
	return (
		<div
			aria-hidden={step !== "intro"}
			className={`relative z-10 grid h-full items-center gap-12 px-14 pt-10 pb-12 transition-[grid-template-columns] duration-700 ease-[cubic-bezier(.22,.82,.2,1)] max-lg:grid-cols-1 max-lg:content-center max-lg:gap-8 max-lg:px-8 ${
				step === "intro"
					? "grid-cols-[minmax(320px,0.72fr)_minmax(540px,1.28fr)]"
					: "grid-cols-[minmax(360px,0.84fr)_minmax(460px,1.16fr)]"
			}`}
		>
			<section
				className={`flex min-w-0 flex-col items-start transition-transform duration-1000 ease-[cubic-bezier(.22,.82,.2,1)] ${step !== "intro" ? "pointer-events-none -translate-x-[58vw]" : "translate-x-0"}`}
			>
				<img
					src={helmorLogoSrc}
					alt="Helmor"
					draggable={false}
					className="size-16 rounded-[11px] opacity-95"
				/>
				<h1 className="mt-8 text-5xl font-semibold leading-[1.1] tracking-normal max-lg:text-4xl">
					<span className="block text-muted-foreground">AI made</span>
					<span className="block text-muted-foreground">coding faster.</span>
					<span className="mt-4 block text-foreground">Helmor is about</span>
					<span className="block text-foreground">finishing the</span>
					<span className="block text-foreground">rest of the loop.</span>
				</h1>
				<p className="mt-10 max-w-md text-base leading-7 text-muted-foreground">
					An open-source local workbench for multi-agent software development.
					Built for orchestration, review, testing, merge, and everything around
					the code.
				</p>

				<Button
					type="button"
					size="lg"
					onClick={onNext}
					className="mt-8 h-11 gap-2 px-4 text-[0.95rem]"
				>
					Next
					<ArrowRight data-icon="inline-end" className="size-4" />
				</Button>
			</section>

			<section
				aria-label="Helmor preview"
				className={`relative flex min-h-[420px] min-w-0 items-center justify-center transition-transform duration-1000 ease-[cubic-bezier(.22,.82,.2,1)] max-lg:hidden ${
					step === "skills"
						? "translate-x-[32vw] translate-y-[2vh]"
						: step === "repoImport"
							? "translate-x-[28vw] translate-y-0"
							: step === "completeTransition"
								? "translate-x-[52vw] -translate-y-[18vh] opacity-0"
								: step === "conductorTransition"
									? "translate-x-[44vw] -translate-y-[12vh] opacity-0"
									: step === "corner"
										? "-translate-x-[86vw] translate-y-[57vh]"
										: step === "agents"
											? "-translate-x-[22vw] -translate-y-[51vh]"
											: "translate-x-0 translate-y-0"
				}`}
			>
				<div
					aria-hidden
					className="absolute left-6 top-7 h-28 w-64 border-l border-t border-border/70"
				/>
				<div
					aria-hidden
					className="absolute bottom-9 right-2 h-32 w-72 border-r border-b border-border/70"
				/>
				<div
					className={`relative w-full max-w-[760px] overflow-hidden rounded-lg border border-border/70 bg-card shadow-2xl shadow-black/35 transition-transform duration-1000 ease-[cubic-bezier(.22,.82,.2,1)] ${
						step === "intro"
							? "scale-100"
							: step === "skills"
								? "scale-[1.72]"
								: step === "repoImport"
									? "scale-[1.4]"
									: step === "completeTransition"
										? "scale-[1.95]"
										: step === "conductorTransition"
											? "scale-[1.95]"
											: step === "corner"
												? "scale-[2.24]"
												: step === "agents"
													? "scale-[1.5]"
													: "scale-100"
					}`}
				>
					<HelmorOnboardingMockup interactive={step !== "intro"} />
				</div>
			</section>
		</div>
	);
}
