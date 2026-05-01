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
				"group/action inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground/95 transition-colors hover:bg-muted",
				waiting && "border-foreground/25 bg-muted",
			)}
		>
			<span>
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
				className="size-3 transition-transform duration-300 ease-out group-hover/action:translate-x-0.5"
				strokeWidth={2}
			/>
		</button>
	);
}
