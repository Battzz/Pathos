import {
	ArrowLeft,
	ArrowRight,
	Layers,
	PackageCheck,
	Sparkles,
	Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupItem } from "../components/setup-item";
import type { OnboardingStep } from "../types";

export function SkillsStep({
	step,
	onBack,
	onNext,
	isRoutingImport,
}: {
	step: OnboardingStep;
	onBack: () => void;
	onNext: () => void;
	isRoutingImport: boolean;
}) {
	return (
		<section
			aria-label="MCP and skills setup"
			aria-hidden={step !== "skills"}
			className={`absolute left-[calc(30vw-260px)] top-20 z-30 w-[520px] transition-all duration-1000 ease-[cubic-bezier(.22,.82,.2,1)] ${
				step === "skills"
					? "translate-x-0 translate-y-0 opacity-100"
					: step === "repoImport"
						? "pointer-events-none translate-x-0 translate-y-0 opacity-0"
						: step === "conductorTransition" || step === "completeTransition"
							? "pointer-events-none scale-[1.08] opacity-0 blur-sm"
							: "pointer-events-none -translate-x-[118vw] translate-y-[55vh] opacity-100"
			}`}
		>
			<div className="flex flex-col items-center">
				<div className="relative h-[270px] w-[420px]">
					<div className="absolute left-10 top-0 h-32 w-[340px] rotate-[-5deg] rounded-lg border border-border/55 bg-card p-4 shadow-2xl shadow-black/20">
						<div className="flex items-center gap-2">
							<Sparkles className="size-4 text-muted-foreground" />
							<div className="h-3 w-24 rounded-full bg-foreground/16" />
						</div>
						<div className="mt-5 grid gap-2">
							<div className="h-2 rounded-full bg-foreground/10" />
							<div className="h-2 w-4/5 rounded-full bg-foreground/10" />
							<div className="h-2 w-2/3 rounded-full bg-foreground/10" />
						</div>
					</div>
					<div className="absolute left-[30px] top-14 h-32 w-[360px] rotate-[3deg] rounded-lg border border-border/60 bg-card p-4 shadow-2xl shadow-black/25">
						<div className="flex items-center gap-2">
							<Layers className="size-4 text-muted-foreground" />
							<div className="h-3 w-28 rounded-full bg-foreground/18" />
						</div>
						<div className="mt-5 grid grid-cols-3 gap-2">
							<div className="h-14 rounded-md bg-foreground/8" />
							<div className="h-14 rounded-md bg-foreground/12" />
							<div className="h-14 rounded-md bg-foreground/8" />
						</div>
					</div>
					<div className="absolute left-5 top-28 h-32 w-[380px] rotate-[-1deg] rounded-lg border border-border/65 bg-card p-4 shadow-2xl shadow-black/30">
						<div className="flex items-center justify-between">
							<div className="h-3 w-32 rounded-full bg-foreground/20" />
							<div className="size-3 rounded-full bg-emerald-500/70" />
						</div>
						<div className="mt-5 grid gap-2">
							<div className="h-2 rounded-full bg-foreground/12" />
							<div className="h-2 w-5/6 rounded-full bg-foreground/12" />
							<div className="h-2 w-3/5 rounded-full bg-foreground/12" />
						</div>
					</div>
				</div>

				<div className="w-full text-center">
					<h2 className="text-3xl font-semibold tracking-normal text-foreground">
						Prepare the local field
					</h2>
					<p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
						Give Helmor the local tools it needs to discover context, call
						servers, and carry useful skills into every workspace.
					</p>
				</div>

				<div className="mt-7 grid w-full gap-3">
					<SetupItem
						icon={<Terminal className="size-5" />}
						label="Helmor CLI"
						description="Install the helmor command so you can spin up workspaces and dispatch agents straight from the terminal."
					/>
					<SetupItem
						icon={<PackageCheck className="size-5" />}
						label="Skills"
						description="Install bundled skills so repeat workflows are ready before your first project."
					/>
				</div>

				<div className="mt-7 flex items-center justify-center gap-3">
					<Button
						type="button"
						variant="ghost"
						size="lg"
						onClick={onBack}
						className="h-11 gap-2 px-4 text-[0.95rem]"
					>
						<ArrowLeft data-icon="inline-start" className="size-4" />
						Back
					</Button>
					<Button
						type="button"
						size="lg"
						onClick={onNext}
						disabled={isRoutingImport}
						className="h-11 gap-2 px-4 text-[0.95rem]"
					>
						Next
						<ArrowRight data-icon="inline-end" className="size-4" />
					</Button>
				</div>
			</div>
		</section>
	);
}
