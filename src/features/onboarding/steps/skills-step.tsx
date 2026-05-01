import { PackageCheck, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	getCliStatus,
	getPathosSkillsStatus,
	installCli,
	installPathosSkills,
} from "@/lib/api";
import {
	StepBackButton,
	StepNextButton,
	StepShell,
} from "../components/editorial-chrome";
import { SetupItem } from "../components/setup-item";
import type { OnboardingStep } from "../types";

const SETUP_FAILED_MESSAGE =
	"Something went wrong — don't worry, Pathos will work fine without it.";

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
	const [isInstallingCli, setIsInstallingCli] = useState(false);
	const [cliInstalled, setCliInstalled] = useState(false);
	const [cliInstallFailed, setCliInstallFailed] = useState(false);
	const [isInstallingSkills, setIsInstallingSkills] = useState(false);
	const [skillsInstalled, setSkillsInstalled] = useState(false);
	const [skillsInstallFailed, setSkillsInstallFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void Promise.all([getCliStatus(), getPathosSkillsStatus()])
			.then(([cliStatus, skillsStatus]) => {
				if (!cancelled) {
					setCliInstalled(cliStatus.installState === "managed");
					setSkillsInstalled(skillsStatus.installed);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleInstallCli = useCallback(async () => {
		if (isInstallingCli) {
			return;
		}
		setIsInstallingCli(true);
		setCliInstallFailed(false);
		try {
			const status = await installCli();
			setCliInstalled(status.installState === "managed");
			toast("Pathos CLI installed.");
		} catch {
			setCliInstallFailed(true);
		} finally {
			setIsInstallingCli(false);
		}
	}, [isInstallingCli]);

	const handleInstallSkills = useCallback(async () => {
		if (isInstallingSkills) {
			return;
		}
		setIsInstallingSkills(true);
		setSkillsInstallFailed(false);
		try {
			const status = await installPathosSkills();
			setSkillsInstalled(status.installed);
			toast("Pathos skills installed.");
		} catch {
			setSkillsInstallFailed(true);
		} finally {
			setIsInstallingSkills(false);
		}
	}, [isInstallingSkills]);

	return (
		<StepShell
			active={step === "skills"}
			ariaLabel="Power up Pathos"
			metaLabel="Pathos · Instruments"
			step={4}
			title="Power up Pathos"
			subtitle="Install the CLI and skills so Pathos can split work, run agents, call tools, and carry context across your workspaces."
			footer={
				<>
					<StepBackButton onClick={onBack} />
					<StepNextButton onClick={onNext} disabled={isRoutingImport} />
				</>
			}
		>
			<div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm">
				<SetupItem
					icon={<Terminal className="size-4" strokeWidth={1.7} />}
					label="Pathos CLI"
					description="Control Pathos from your terminal: create workspaces, send prompts, inspect files, and script repeatable flows."
					actionLabel={isInstallingCli ? "Installing" : "Set up"}
					onAction={handleInstallCli}
					busy={isInstallingCli}
					ready={cliInstalled}
					error={cliInstallFailed ? SETUP_FAILED_MESSAGE : null}
				/>
				<SetupItem
					icon={<PackageCheck className="size-4" strokeWidth={1.7} />}
					label="Pathos Skills (Beta)"
					description="Install skills so Pathos can help with more workflows across every workspace."
					actionLabel={isInstallingSkills ? "Installing" : "Set up"}
					onAction={handleInstallSkills}
					busy={isInstallingSkills}
					ready={skillsInstalled}
					error={skillsInstallFailed ? SETUP_FAILED_MESSAGE : null}
				/>
			</div>
		</StepShell>
	);
}
