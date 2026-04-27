import { MarkGithubIcon } from "@primer/octicons-react";
import { ArrowLeft, ArrowRight, GitPullRequestArrow } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	type ForgeCliStatus,
	type ForgeProvider,
	getForgeCliStatus,
	openForgeCliAuthTerminal,
} from "@/lib/api";
import { SetupItem } from "../components/setup-item";
import type { OnboardingStep } from "../types";

const CLI_AUTH_POLL_INTERVAL_MS = 2000;
const CLI_AUTH_POLL_TIMEOUT_MS = 120_000;

export function RepositoryCliStep({
	step,
	onBack,
	onNext,
}: {
	step: OnboardingStep;
	onBack: () => void;
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
					<RepositoryCliSetupItem
						provider="github"
						host="github.com"
						icon={<MarkGithubIcon size={20} />}
						label="GitHub CLI"
						description="Run gh auth login to connect GitHub locally."
					/>
					<RepositoryCliSetupItem
						provider="gitlab"
						host="gitlab.com"
						icon={<GitPullRequestArrow className="size-5" />}
						label="GitLab CLI"
						description="Run glab auth login to connect GitLab locally."
					/>
				</div>

				<div className="mt-7 flex items-center gap-3">
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

function RepositoryCliSetupItem({
	provider,
	host,
	icon,
	label,
	description,
}: {
	provider: ForgeProvider;
	host: string;
	icon: ReactNode;
	label: string;
	description: string;
}) {
	const [status, setStatus] = useState<ForgeCliStatus | null>(null);
	const [checking, setChecking] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);

	const clearPoll = useCallback(() => {
		if (pollTimerRef.current !== null) {
			clearTimeout(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	const refreshStatus = useCallback(async () => {
		const next = await getForgeCliStatus(provider, host);
		setStatus(next);
		return next;
	}, [host, provider]);

	useEffect(() => {
		let cancelled = false;
		setChecking(true);
		void getForgeCliStatus(provider, host)
			.then((next) => {
				if (!cancelled) {
					setStatus(next);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setStatus({
						status: "error",
						provider,
						host,
						cliName: provider === "gitlab" ? "glab" : "gh",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			})
			.finally(() => {
				if (!cancelled) {
					setChecking(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [host, provider]);

	useEffect(() => clearPoll, [clearPoll]);

	const pollUntilReady = useCallback(
		(startedAt = Date.now()) => {
			clearPoll();
			pollTimerRef.current = setTimeout(async () => {
				try {
					const next = await refreshStatus();
					if (next.status === "ready") {
						setConnecting(false);
						inFlightRef.current = false;
						toast.success(`${next.cliName} connected`);
						return;
					}
				} catch {
					// Auth may still be in progress in Terminal.
				}
				if (Date.now() - startedAt >= CLI_AUTH_POLL_TIMEOUT_MS) {
					setConnecting(false);
					inFlightRef.current = false;
					toast(`Finish ${label} auth in Terminal, then click Set up again.`);
					return;
				}
				pollUntilReady(startedAt);
			}, CLI_AUTH_POLL_INTERVAL_MS);
		},
		[clearPoll, label, refreshStatus],
	);

	const handleSetUp = useCallback(async () => {
		if (connecting || inFlightRef.current) {
			return;
		}
		inFlightRef.current = true;
		clearPoll();
		setConnecting(true);
		try {
			const current =
				status?.status === "ready" ? status : await refreshStatus();
			if (current.status === "ready") {
				setConnecting(false);
				inFlightRef.current = false;
				return;
			}
			await openForgeCliAuthTerminal(provider, host);
			toast(`Complete ${current.cliName || label} auth in Terminal.`);
			pollUntilReady();
		} catch (error) {
			setConnecting(false);
			inFlightRef.current = false;
			toast.error(
				error instanceof Error ? error.message : "Failed to open Terminal.",
			);
		}
	}, [
		clearPoll,
		connecting,
		host,
		label,
		pollUntilReady,
		provider,
		refreshStatus,
		status,
	]);

	const ready = status?.status === "ready";
	const message = status?.status === "ready" ? status.message : status?.message;

	return (
		<SetupItem
			icon={icon}
			label={label}
			description={
				message ? (
					<>
						{description}
						<span
							className={
								status?.status === "error"
									? "mt-1 block text-destructive"
									: "mt-1 block"
							}
						>
							{message}
						</span>
					</>
				) : (
					description
				)
			}
			actionLabel={checking ? "Checking" : connecting ? "Waiting" : "Set up"}
			onAction={handleSetUp}
			busy={checking || connecting}
			ready={ready}
		/>
	);
}
