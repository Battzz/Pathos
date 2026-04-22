import type { AgentModelSection } from "./api";

const MODEL_CATALOG_CACHE_KEY = "helmor-agent-model-sections";

function canUseLocalStorage(): boolean {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

export function hasUsableAgentModelSections(
	sections: readonly AgentModelSection[] | null | undefined,
): boolean {
	return (sections ?? []).some((section) => section.options.length > 0);
}

export function readCachedAgentModelSections():
	| AgentModelSection[]
	| undefined {
	if (!canUseLocalStorage()) return undefined;
	try {
		const raw = window.localStorage.getItem(MODEL_CATALOG_CACHE_KEY);
		if (!raw) return undefined;
		const parsed = JSON.parse(raw) as AgentModelSection[];
		return hasUsableAgentModelSections(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function writeCachedAgentModelSections(
	sections: readonly AgentModelSection[],
): void {
	if (!canUseLocalStorage() || !hasUsableAgentModelSections(sections)) return;
	try {
		window.localStorage.setItem(
			MODEL_CATALOG_CACHE_KEY,
			JSON.stringify(sections),
		);
	} catch {
		// ignore
	}
}
