/**
 * Manual overrides for the Claude model list.
 *
 * `query.supportedModels()` from the Claude Agent SDK is the source of truth
 * for what Claude models are currently available, but its output is:
 *   - Unstable across calls (A/B rollout / account flags).
 *   - Missing capability flags we care about (e.g. `supportsFastMode`).
 *
 * This file lets us patch that list by hand. Each entry's `id` matches
 * against `ProviderModelInfo.id` returned by the SDK.
 *
 * Merge rules (see `applyClaudeModelOverrides`):
 *   - id matches an SDK model  → fields present here override the SDK's;
 *                                 fields omitted fall through to the SDK.
 *   - id does NOT match any    → entry is added as a new model; omitted
 *                                 fields get sensible defaults.
 *
 * Only `id` is required. Every other field is optional and only has effect
 * if you explicitly set it. There is NO heuristic — if you want a model to
 * show fast mode, set `supportsFastMode: true` on it here.
 */

import type { ProviderModelInfo } from "./session-manager.js";

export type ClaudeModelOverride = { readonly id: string } & Partial<
	Omit<ProviderModelInfo, "id">
>;

export const CLAUDE_MODEL_OVERRIDES: readonly ClaudeModelOverride[] = [
	// Opus 4.6 1M — intermittently missing from `supportedModels()` output.
	// Pin it here so it always shows up with fast mode enabled.
	{
		id: "claude-opus-4-6[1m]",
		label: "Opus 4.6 1M",
		cliModel: "claude-opus-4-6[1m]",
		effortLevels: ["low", "medium", "high", "max"],
		supportsFastMode: true,
	},
];

/**
 * Merge SDK-returned models with `CLAUDE_MODEL_OVERRIDES`.
 * Preserves SDK ordering; any net-new entries are appended in override order.
 */
export function applyClaudeModelOverrides(
	sdkModels: readonly ProviderModelInfo[],
): ProviderModelInfo[] {
	const byId = new Map<string, ProviderModelInfo>();
	for (const m of sdkModels) byId.set(m.id, { ...m });

	for (const override of CLAUDE_MODEL_OVERRIDES) {
		const existing = byId.get(override.id);
		if (existing) {
			// Merge — any field set in override wins; unset keys keep SDK value.
			byId.set(override.id, { ...existing, ...override });
		} else {
			// New model: fill gaps with safe defaults.
			byId.set(override.id, {
				id: override.id,
				label: override.label ?? override.id,
				cliModel: override.cliModel ?? override.id,
				effortLevels: override.effortLevels ?? [],
				supportsFastMode: override.supportsFastMode ?? false,
			});
		}
	}

	const out: ProviderModelInfo[] = [];
	const seen = new Set<string>();
	for (const m of sdkModels) {
		const v = byId.get(m.id);
		if (v) {
			out.push(v);
			seen.add(m.id);
		}
	}
	for (const override of CLAUDE_MODEL_OVERRIDES) {
		if (seen.has(override.id)) continue;
		const v = byId.get(override.id);
		if (v) out.push(v);
	}
	return out;
}

/**
 * Server-side gate: does this model id have `supportsFastMode: true` in the
 * override table? Used by `sendMessage` to ignore a `fastMode: true` flag
 * coming from the UI when the selected model doesn't actually support it.
 *
 * Matches the UI gate (`supportsFastMode === true` on the listed model),
 * so the two can't drift as long as both read from `CLAUDE_MODEL_OVERRIDES`.
 */
export function claudeModelSupportsFastMode(
	modelId: string | undefined | null,
): boolean {
	if (!modelId) return false;
	return CLAUDE_MODEL_OVERRIDES.some(
		(o) => o.id === modelId && o.supportsFastMode === true,
	);
}
