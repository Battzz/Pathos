/**
 * Provider-specific sort rules for the model list returned by `listModels`.
 *
 * Two sorters live here, one per provider, with parallel naming so call
 * sites read symmetrically:
 *   - `sortCodexModels` — version desc, then id asc.
 *   - `sortClaudeModels` — family (Opus → Sonnet → Haiku → other) →
 *                          version desc → 1M first → id asc.
 *
 * Both take and return `ProviderModelInfo[]` so the session managers
 * don't need to know which rule is in play.
 */

import type { ProviderModelInfo } from "./session-manager.js";

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

/**
 * Extract a numeric version from a model id (e.g. "gpt-5.4" → 5.4).
 * "default" gets Infinity so it sorts first (it's the primary model alias).
 */
function codexVersionOf(model: ProviderModelInfo): number {
	if (model.id === "default") return Infinity;
	const m = model.id.match(/(\d+(?:\.\d+)?)/);
	return m?.[1] ? Number.parseFloat(m[1]) : 0;
}

/** Sort Codex models by version desc, then id asc. */
export function sortCodexModels(
	models: ProviderModelInfo[],
): ProviderModelInfo[] {
	return [...models].sort((a, b) => {
		const va = codexVersionOf(a);
		const vb = codexVersionOf(b);
		if (va !== vb) return vb - va;
		return a.id.localeCompare(b.id);
	});
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------
// `default` is the CLI alias for the latest Opus, so it's pinned to the top
// of the Opus group regardless of what label/version it carries.

type ClaudeFamily = "opus" | "sonnet" | "haiku" | "other";

const CLAUDE_FAMILY_RANK: Record<ClaudeFamily, number> = {
	opus: 0,
	sonnet: 1,
	haiku: 2,
	other: 3,
};

function claudeFamilyOf(model: ProviderModelInfo): ClaudeFamily {
	if (model.id === "default") return "opus";
	const haystack = `${model.id} ${model.label}`.toLowerCase();
	if (haystack.includes("opus")) return "opus";
	if (haystack.includes("sonnet")) return "sonnet";
	if (haystack.includes("haiku")) return "haiku";
	return "other";
}

function claudeVersionOf(model: ProviderModelInfo): number {
	if (model.id === "default") return Infinity;
	// Strip "1M" markers so they don't get parsed as a version number.
	const label = model.label.replace(/\b1m\b/gi, "");
	const id = model.id.replace(/\[1m\]/gi, "");
	const m = label.match(/(\d+(?:\.\d+)?)/) ?? id.match(/(\d+(?:\.\d+)?)/);
	return m?.[1] ? Number.parseFloat(m[1]) : 0;
}

function claudeHas1M(model: ProviderModelInfo): boolean {
	return /\b1m\b/i.test(model.label) || /\[1m\]/i.test(model.id);
}

/** Sort Claude models by family → version desc → 1M first → id asc. */
export function sortClaudeModels(
	models: ProviderModelInfo[],
): ProviderModelInfo[] {
	return [...models].sort((a, b) => {
		const fa = CLAUDE_FAMILY_RANK[claudeFamilyOf(a)];
		const fb = CLAUDE_FAMILY_RANK[claudeFamilyOf(b)];
		if (fa !== fb) return fa - fb;

		const va = claudeVersionOf(a);
		const vb = claudeVersionOf(b);
		if (va !== vb) return vb - va;

		const ma = claudeHas1M(a);
		const mb = claudeHas1M(b);
		if (ma !== mb) return ma ? -1 : 1;

		return a.id.localeCompare(b.id);
	});
}
