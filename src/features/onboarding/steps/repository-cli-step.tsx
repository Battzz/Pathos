import { MarkGithubIcon } from "@primer/octicons-react";
import { ArrowRight, GitPullRequestArrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupItem } from "../components/setup-item";
import type { OnboardingStep } from "../types";

export function RepositoryCliStep({
	step,
	onNext,
}: {
	step: OnboardingStep;
	onNext: () => void;
}) {
	return (
		<section
			aria-label="Repository CLI setup"
			aria-hidden={step !== "corner"}
			className={`absolute top-20 right-20 z-30 w-[560px] transition-all duration-1000 ease-[cubic-bezier(.22,.82,.2,1)] ${
				step === "skills"
					? "pointer-events-none translate-x-[118vw] -translate-y-[55vh] opacity-100"
					: step === "corner"
						? "translate-x-0 translate-y-0 opacity-100"
						: "pointer-events-none translate-x-[64vw] -translate-y-[108vh] opacity-100"
			}`}
		>
			<div className="flex flex-col items-start">
				<h2 className="max-w-none text-4xl font-semibold leading-[1.02] tracking-normal text-foreground whitespace-nowrap">
					Set up repository CLIs
				</h2>
				<p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
					Install and authenticate your GitHub or GitLab CLI so Helmor can open
					pull requests and keep repository actions local.
				</p>

				<div className="mt-7 grid w-full gap-3">
					<SetupItem
						icon={<MarkGithubIcon size={20} />}
						label="GitHub CLI"
						description="Run gh auth login to connect GitHub locally."
					/>
					<SetupItem
						icon={<GitPullRequestArrow className="size-5" />}
						label="GitLab CLI"
						description="Run glab auth login to connect GitLab locally."
					/>
				</div>

				<Button
					type="button"
					size="lg"
					onClick={onNext}
					className="mt-7 h-11 gap-2 px-4 text-[0.95rem]"
				>
					Next
					<ArrowRight data-icon="inline-end" className="size-4" />
				</Button>
			</div>
		</section>
	);
}
