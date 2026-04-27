import { Button } from "@/components/ui/button";
import { type AgentLoginProvider, openAgentLoginTerminal } from "@/lib/api";
import type { AgentLoginStatus } from "../types";

export function AgentStatusAction({
	provider,
	status,
}: {
	provider: AgentLoginProvider;
	status: AgentLoginStatus;
}) {
	if (status === "ready") {
		return (
			<div className="flex shrink-0 items-center gap-2 text-xs font-medium text-emerald-500">
				<span className="relative flex size-2">
					<span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-25" />
					<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
				</span>
				Ready
			</div>
		);
	}

	return (
		<Button
			type="button"
			size="sm"
			className="h-7 shrink-0 px-2 text-xs"
			onClick={() => {
				void openAgentLoginTerminal(provider);
			}}
		>
			Log in
		</Button>
	);
}
