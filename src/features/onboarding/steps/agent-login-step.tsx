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
			chapter={{ number: "II", name: "Agents" }}
			folio="Folio 2 of 5"
			title={
				<>
					Log in to your <em className="not-italic">agents</em>.
				</>
			}
			subtitle={
				<>
					Pathos uses your local Claude Code and Codex login sessions. You can
					log in now, or continue and log in later.
				</>
			}
			footer={
				<>
					<StepBackButton onClick={onBack} />
					<StepNextButton onClick={onNext} />
				</>
			}
		>
			<div className="relative flex w-full gap-8">
				<div
					className={cn(
						"flex-1 transition-[max-width] duration-700 ease-[cubic-bezier(.22,.82,.2,1)]",
						terminalActive ? "max-w-[480px]" : "max-w-none",
					)}
				>
					<div className="flex flex-col">
						{loginItems.map(
							({ icon: Icon, provider, label, description, status }) => (
								<div
									key={label}
									className="group/setup grid grid-cols-[auto_1fr_auto] items-center gap-6 border-t border-border/30 py-5 first:border-t-0"
								>
									<div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/45 bg-foreground/[0.015] text-foreground/85 transition-colors group-hover/setup:border-foreground/30">
										<Icon className="size-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="font-display text-[22px] leading-none text-foreground/95">
											{label}
										</div>
										<p className="mt-2 max-w-[480px] text-[13.5px] leading-[1.55] text-muted-foreground/85">
											{description}
										</p>
									</div>
									<div className="flex shrink-0 items-center">
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
				</div>

				<LoginTerminalPreview
					provider={terminalProvider}
					instanceId={loginInstanceId}
					active={terminalActive}
					onExit={handleTerminalExit}
					onError={handleTerminalError}
				/>
			</div>
		</StepShell>
	);
}
