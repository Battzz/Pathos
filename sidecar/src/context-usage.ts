// Context-usage meta builders — one shape for both providers.
//
// Written into `sessions.context_usage_meta` at turn end. No model
// stamping, no provider source: the frontend doesn't gate on either.
// Window size comes from whatever the sidecar last reported; if the
// user switched models, the next turn overwrites it.

export type StoredContextUsageMeta = {
	readonly usedTokens: number;
	readonly maxTokens: number;
	readonly percentage: number;
};

/** Claude-only hover breakdown. Adds categories + auto-compact to the
 *  baseline shape. Fetched live on hover via `getContextUsage` RPC. */
export type ClaudeRichContextUsage = StoredContextUsageMeta & {
	readonly isAutoCompactEnabled: boolean;
	readonly categories: ReadonlyArray<{ name: string; tokens: number }>;
};

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function computePercentage(used: number, max: number): number {
	if (max <= 0) return 0;
	const raw = Math.min(100, Math.max(0, (used / max) * 100));
	return Math.round(raw * 100) / 100;
}

/**
 * Build the persisted meta from any Claude terminal `result` message
 * (success OR error — both carry usage). Returns null when usage data
 * is missing so the sidecar can skip emitting.
 */
export function buildClaudeStoredMeta(
	result: unknown,
): StoredContextUsageMeta | null {
	const root = (result ?? {}) as Record<string, unknown>;
	const usage = (root.usage ?? null) as Record<string, unknown> | null;
	const modelUsage = (root.modelUsage ?? null) as Record<
		string,
		Record<string, unknown>
	> | null;
	if (!usage || !modelUsage) return null;

	const used =
		num(usage.input_tokens) +
		num(usage.cache_creation_input_tokens) +
		num(usage.cache_read_input_tokens) +
		num(usage.output_tokens);

	let max = 0;
	for (const entry of Object.values(modelUsage)) {
		const cw = num(entry?.contextWindow);
		if (cw > max) max = cw;
	}
	if (max <= 0 || used <= 0) return null;

	const usedClamped = Math.min(used, max);
	return {
		usedTokens: usedClamped,
		maxTokens: max,
		percentage: computePercentage(usedClamped, max),
	};
}

/**
 * Reduce `SDKControlGetContextUsageResponse` to the rich shape for the
 * hover popover. Filters the "Free space" pseudo-category.
 */
export function buildClaudeRichMeta(raw: unknown): ClaudeRichContextUsage {
	const root = (raw ?? {}) as Record<string, unknown>;
	const rawCategories = Array.isArray(root.categories) ? root.categories : [];
	const used = num(root.totalTokens);
	const max = num(root.maxTokens);
	const sdkPct = num(root.percentage);
	const percentage =
		sdkPct > 0 ? Math.round(sdkPct * 100) / 100 : computePercentage(used, max);
	return {
		usedTokens: used,
		maxTokens: max,
		percentage,
		isAutoCompactEnabled: root.isAutoCompactEnabled === true,
		categories: rawCategories
			.filter((entry): entry is { name: string; tokens: number } => {
				if (!entry || typeof entry !== "object") return false;
				const e = entry as { name?: unknown; tokens?: unknown };
				return (
					typeof e.name === "string" &&
					e.name !== "Free space" &&
					typeof e.tokens === "number"
				);
			})
			.map(({ name, tokens }) => ({ name, tokens })),
	};
}

/**
 * Build the persisted meta from a Codex `thread/tokenUsage/updated`
 * payload. `usedTokens` = `last.totalTokens` (context fill for the
 * most recent turn, not the cumulative billing counter). `maxTokens` =
 * `modelContextWindow`.
 */
export function buildCodexStoredMeta(
	tokenUsage: unknown,
): StoredContextUsageMeta | null {
	const root = (tokenUsage ?? {}) as Record<string, unknown>;
	const last = (root.last ?? null) as Record<string, unknown> | null;
	const total = (root.total ?? null) as Record<string, unknown> | null;
	const max = num(root.modelContextWindow);
	const used = num(last?.totalTokens ?? total?.totalTokens);
	if (used <= 0 && max <= 0) return null;

	const usedClamped = max > 0 ? Math.min(used, max) : used;
	return {
		usedTokens: usedClamped,
		maxTokens: max,
		percentage: computePercentage(usedClamped, max),
	};
}
