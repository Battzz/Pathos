import { Button } from "@/components/ui/button";
import type { AgentLoginProvider } from "@/lib/api";
import type { AgentLoginStatus } from "../types";
import { ReadyStatus } from "./ready-status";

export function AgentStatusAction({
	provider,
	status,
	onPrimeLogin,
	onStartLogin,
}: {
	provider: AgentLoginProvider;
	status: AgentLoginStatus;
	onPrimeLogin?: (provider: AgentLoginProvider) => void;
	onStartLogin?: (provider: AgentLoginProvider) => void;
}) {
	if (status === "ready") {
		return <ReadyStatus />;
	}

	return (
		<Button
			type="button"
			size="sm"
			className="h-7 shrink-0 px-2 text-xs"
			onMouseEnter={() => {
				onPrimeLogin?.(provider);
			}}
			onFocus={() => {
				onPrimeLogin?.(provider);
			}}
			onClick={() => {
				onStartLogin?.(provider);
			}}
		>
			Log in
		</Button>
	);
}
