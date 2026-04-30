import { ArrowRight } from "lucide-react";
import type { AgentLoginProvider } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentLoginStatus } from "../types";
import { ReadyStatus } from "./ready-status";

export function AgentStatusAction({
	provider,
	status,
	waiting = false,
	onPrimeLogin,
	onStartLogin,
}: {
	provider: AgentLoginProvider;
	status: AgentLoginStatus;
	waiting?: boolean;
	onPrimeLogin?: (provider: AgentLoginProvider) => void;
	onStartLogin?: (provider: AgentLoginProvider) => void;
}) {
	if (status === "ready") {
		return <ReadyStatus />;
	}

	return (
		<button
			type="button"
			title={waiting ? "Restart setup" : undefined}
			onMouseEnter={() => {
				onPrimeLogin?.(provider);
			}}
			onFocus={() => {
				onPrimeLogin?.(provider);
			}}
			onClick={() => {
				onStartLogin?.(provider);
			}}
			className={cn(
				"group/action inline-flex cursor-pointer items-center gap-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.32em] text-foreground/85 transition-colors duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:text-foreground",
				waiting && "text-foreground/95",
			)}
		>
			<span className="transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/action:translate-x-0.5">
				{waiting ? (
					<>
						<span className="group-hover/action:hidden">Waiting…</span>
						<span className="hidden group-hover/action:inline">Restart</span>
					</>
				) : (
					"Log in"
				)}
			</span>
			<ArrowRight
				className="size-3 transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover/action:translate-x-1"
				strokeWidth={1.5}
			/>
		</button>
	);
}
