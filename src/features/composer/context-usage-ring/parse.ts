// Parses `context_usage_meta` JSON (and Codex rate-limits JSON) into
// display-ready shapes for the ring + popover. One shape per source;
// no model matching, no legacy fallback — sidecar always writes the
// current format.

/** Baseline: written at turn end by both Claude and Codex. */
export type StoredContextUsageMeta = {
	readonly usedTokens: number;
	readonly maxTokens: number;
	readonly percentage: number;
};

/** Claude-only rich breakdown from `q.getContextUsage()`. Fetched live
 *  on hover. */
export type ClaudeRichContextUsage = StoredContextUsageMeta & {
	readonly isAutoCompactEnabled: boolean;
	readonly categories: ReadonlyArray<{ name: string; tokens: number }>;
};

/** <60 default, 60–80 warning, >=80 danger. */
export type RingTier = "default" | "warning" | "danger";

export function ringTier(percentage: number): RingTier {
	if (percentage >= 80) return "danger";
	if (percentage >= 60) return "warning";
	return "default";
}

/** Ring display. `rich` is set when Claude's hover fetch has resolved. */
export type DisplayResolution =
	| { readonly kind: "empty" }
	| {
			readonly kind: "full";
			readonly usedTokens: number;
			readonly maxTokens: number;
			readonly percentage: number;
			readonly tier: RingTier;
			readonly rich: ClaudeRichContextUsage | null;
	  };

/** Rich overrides baseline when present (same units, strictly fresher). */
export function resolveContextUsageDisplay(
	baseline: StoredContextUsageMeta | null,
	rich: ClaudeRichContextUsage | null,
): DisplayResolution {
	const effective = rich ?? baseline;
	if (!effective) return { kind: "empty" };
	return {
		kind: "full",
		usedTokens: effective.usedTokens,
		maxTokens: effective.maxTokens,
		percentage: effective.percentage,
		tier: ringTier(effective.percentage),
		rich,
	};
}

// ── JSON parsers ───────────────────────────────────────────────────────

type Json = unknown;

function asNumber(v: Json): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asObject(v: Json): Record<string, Json> | null {
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, Json>)
		: null;
}

function clampPercent(used: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, Math.max(0, (used / max) * 100));
}

export function parseStoredMeta(
	json: string | null | undefined,
): StoredContextUsageMeta | null {
	if (!json) return null;
	let parsed: Json;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	const root = asObject(parsed);
	if (!root) return null;
	const used = asNumber(root.usedTokens);
	const max = asNumber(root.maxTokens);
	if (used === null || max === null) return null;
	return {
		usedTokens: used,
		maxTokens: max,
		percentage: asNumber(root.percentage) ?? clampPercent(used, max),
	};
}

export function parseClaudeRichMeta(
	json: string | null | undefined,
): ClaudeRichContextUsage | null {
	if (!json) return null;
	let parsed: Json;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	const root = asObject(parsed);
	if (!root) return null;
	const used = asNumber(root.usedTokens);
	const max = asNumber(root.maxTokens);
	if (used === null || max === null) return null;
	const rawCategories = Array.isArray(root.categories) ? root.categories : [];
	const categories: Array<{ name: string; tokens: number }> = [];
	for (const entry of rawCategories) {
		const obj = asObject(entry);
		if (!obj) continue;
		const name = typeof obj.name === "string" ? obj.name : null;
		const tokens = asNumber(obj.tokens);
		if (!name || tokens === null) continue;
		categories.push({ name, tokens });
	}
	return {
		usedTokens: used,
		maxTokens: max,
		percentage: asNumber(root.percentage) ?? clampPercent(used, max),
		isAutoCompactEnabled: root.isAutoCompactEnabled === true,
		categories,
	};
}

// ── Formatting helpers ────────────────────────────────────────────────

/** "12.4k" / "1.0M" / "0". */
export function formatTokens(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens <= 0) return "0";
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

// ── Codex rate limits (orthogonal to context meta) ─────────────────────

export type RateLimitWindowDisplay = {
	usedPercent: number;
	leftPercent: number;
	label: string | null;
	resetsAt: number | null;
	expired: boolean;
};

export type CodexRateLimitsDisplay = {
	primary: RateLimitWindowDisplay | null;
	secondary: RateLimitWindowDisplay | null;
};

export function parseCodexRateLimits(
	json: string | null | undefined,
	now: number = Date.now() / 1000,
): CodexRateLimitsDisplay | null {
	if (!json) return null;
	let parsed: Json;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	const root = asObject(parsed);
	if (!root) return null;
	const primary = parseWindow(asObject(root.primary), now);
	const secondary = parseWindow(asObject(root.secondary), now);
	if (!primary && !secondary) return null;
	return { primary, secondary };
}

function parseWindow(
	obj: Record<string, Json> | null,
	now: number,
): RateLimitWindowDisplay | null {
	if (!obj) return null;
	const used = asNumber(obj.usedPercent);
	if (used === null) return null;
	const usedClamped = Math.max(0, Math.min(100, used));
	const minutes = asNumber(obj.windowDurationMins);
	const resetsAt = asNumber(obj.resetsAt);
	return {
		usedPercent: usedClamped,
		leftPercent: 100 - usedClamped,
		label: formatWindowLabel(minutes),
		resetsAt,
		expired: resetsAt !== null && resetsAt < now,
	};
}

function formatWindowLabel(minutes: number | null): string | null {
	if (minutes === null || minutes <= 0) return null;
	if (minutes % (60 * 24) === 0) return `${minutes / 60 / 24}d limit`;
	if (minutes % 60 === 0) return `${minutes / 60}h limit`;
	return `${minutes}m limit`;
}

/** Format a unix-seconds timestamp like "Apr 23, 1:29 PM". */
export function formatResetsAt(unixSeconds: number): string {
	const d = new Date(unixSeconds * 1000);
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
