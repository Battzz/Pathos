import type { ClaudeIcon } from "@/components/icons";
import type { AgentLoginProvider } from "@/lib/api";

export type AgentLoginStatus = "ready" | "needsSetup";

export type AgentLoginItem = {
	icon: typeof ClaudeIcon;
	provider: AgentLoginProvider;
	label: string;
	description: string;
	status: AgentLoginStatus;
};

export type OnboardingStep =
	| "splash"
	| "intro"
	| "agents"
	| "corner"
	| "skills"
	| "conductor"
	| "repoImport";

export type ImportedRepository = {
	id: string;
	name: string;
	source: "local" | "github";
	detail: string;
};
