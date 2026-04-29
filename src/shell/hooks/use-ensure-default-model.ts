import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AgentModelSection } from "@/lib/api";
import { agentModelSectionsQueryOptions } from "@/lib/query-client";
import { useSettings } from "@/lib/settings";
import { findModelOption } from "@/lib/workspace-helpers";

const KNOWN_MODEL_PROVIDERS = ["claude", "codex"] as const;
const DEFAULT_COMMIT_ACTION_MODEL_ID = "gpt-5.4-mini";

function isModelCatalogSettled(sections: AgentModelSection[]) {
	if (sections.length === 0) return false;
	const sectionsById = new Map(
		sections.map((section) => [section.id, section]),
	);
	return KNOWN_MODEL_PROVIDERS.every((provider) => {
		const section = sectionsById.get(provider);
		if (!section) return false;
		return (section.status ?? "ready") !== "error";
	});
}

/**
 * Invariant: once the model catalog is ready, `settings.defaultModelId` must
 * point to a model that exists in the catalog. If it doesn't (never set, or
 * the previously-picked model is gone), pick a reasonable default and write
 * it back. This is the single place that decides the initial default — every
 * other consumer reads `settings.defaultModelId` directly.
 */
export function useEnsureDefaultModel() {
	const { settings, isLoaded, updateSettings } = useSettings();
	const modelSectionsQuery = useQuery(agentModelSectionsQueryOptions());
	const sections = modelSectionsQuery.data;

	useEffect(() => {
		if (!isLoaded) return;
		if (!sections || sections.length === 0) return;
		const allOptions = sections.flatMap((s) => s.options);
		const nextSettings: {
			defaultModelId?: string;
			commitActionModelId?: string;
		} = {};

		// Already valid — nothing to do.
		const defaultModelValid =
			settings.defaultModelId &&
			findModelOption(sections, settings.defaultModelId);
		const commitActionModelValid =
			settings.commitActionModelId &&
			findModelOption(sections, settings.commitActionModelId);
		if (defaultModelValid && commitActionModelValid) {
			return;
		}

		const catalogSettled = isModelCatalogSettled(sections);
		if (!defaultModelValid) {
			// User previously saved a model but it's not in the catalog. Only
			// repair it once every provider has reached a terminal state.
			if (settings.defaultModelId && !catalogSettled) return;

			// Never been set (null), or a previously-saved value is now
			// definitively unavailable — pick a sensible available default.
			const pick =
				sections.find((s) => s.id === "claude")?.options[0]?.id ??
				allOptions[0]?.id ??
				null;
			if (pick) {
				nextSettings.defaultModelId = pick;
			}
		}

		if (!commitActionModelValid) {
			if (settings.commitActionModelId && !catalogSettled) return;
			const pick =
				findModelOption(sections, DEFAULT_COMMIT_ACTION_MODEL_ID)?.id ??
				sections.find((s) => s.id === "codex")?.options[0]?.id ??
				allOptions[0]?.id ??
				null;
			if (pick) {
				nextSettings.commitActionModelId = pick;
			}
		}

		if (Object.keys(nextSettings).length === 0) return;
		updateSettings(nextSettings);
	}, [
		isLoaded,
		sections,
		settings.defaultModelId,
		settings.commitActionModelId,
		updateSettings,
	]);
}
