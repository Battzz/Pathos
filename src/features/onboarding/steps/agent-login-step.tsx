import { useCallback, useState } from "react";
import type { AgentLoginProvider } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AgentStatusAction } from "../components/agent-status-action";
import {
	StepBackButton,
	StepNextButton,
	StepShell,
} from "../components/editorial-chrome";
import { LoginTerminalPreview } from "../components/login-terminal-preview";
import type { AgentLoginItem, OnboardingStep } from "../types";

export function AgentLoginStep({
	step,
	loginItems,
	onBack,
	onNext,
	onRefreshLoginItems,
}: {
	step: OnboardingStep;
	loginItems: AgentLoginItem[];
	onBack: () => void;
	onNext: () => void;
	onRefreshLoginItems: () => void;
}) {
	const [primedLoginProvider, setPrimedLoginProvider] =
		useState<AgentLoginProvider | null>(null);
	const [activeLoginProvider, setActiveLoginProvider] =
		useState<AgentLoginProvider | null>(null);
	const [loginInstanceId, setLoginInstanceId] = useState<string | null>(null);
	const [waitingProvider, setWaitingProvider] =
		useState<AgentLoginProvider | null>(null);
	const terminalProvider = activeLoginProvider ?? primedLoginProvider;
	const terminalActive = activeLoginProvider !== null;

	const startLogin = useCallback((provider: AgentLoginProvider) => {
		setPrimedLoginProvider(provider);
		setActiveLoginProvider(provider);
		setWaitingProvider(provider);
		setLoginInstanceId(crypto.randomUUID());
	}, []);

	const handleTerminalExit = useCallback(
		(code: number | null) => {
			onRefreshLoginItems();
			if (code !== 0) {
				setWaitingProvider((current) =>
					current === activeLoginProvider ? null : current,
				);
			}
		},
		[activeLoginProvider, onRefreshLoginItems],
	);

	const handleTerminalError = useCallback(() => {
		setWaitingProvider(null);
	}, []);

	return (
		<StepShell
			active={step === "agents"}
			ariaLabel="Log in to your agents"
			metaLabel="Pathos · Agents"
			step={2}
			title="Log in to your agents"
			subtitle="Pathos uses your local Claude Code and Codex sessions. Sign in now or skip and connect them later."
			footer={
				<>
					<StepBackButton onClick={onBack} />
					<StepNextButton onClick={onNext} />
				</>
			}
		>
			<div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm">
				{loginItems.map(
					({ icon: Icon, provider, label, description, status }) => (
						<div
							key={label}
							role="group"
							aria-label={label}
							className="flex items-start gap-3.5 border-t border-border/50 px-4 py-3.5 first:border-t-0"
						>
							<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.02] text-foreground/85">
								<Icon className="size-4" />
							</div>
							<div className="min-w-0 flex-1 pt-px">
								<div className="text-[14px] font-medium leading-tight text-foreground">
									{label}
								</div>
								<p className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">
									{description}
								</p>
							</div>
							<div className="flex shrink-0 items-center pt-0.5">
								<AgentStatusAction
									provider={provider}
									status={status}
									waiting={waitingProvider === provider}
									onPrimeLogin={setPrimedLoginProvider}
									onStartLogin={startLogin}
								/>
							</div>
						</div>
					),
				)}
			</div>

			<div
				className={cn(
					"overflow-hidden transition-all duration-700 ease-[cubic-bezier(.22,.82,.2,1)]",
					terminalActive ? "h-[282px]" : "h-0",
				)}
			>
				<div className="relative h-[270px] pt-3">
					<LoginTerminalPreview
						provider={terminalProvider}
						instanceId={loginInstanceId}
						active={terminalActive}
						onExit={handleTerminalExit}
						onError={handleTerminalError}
					/>
				</div>
			</div>
		</StepShell>
	);
}
