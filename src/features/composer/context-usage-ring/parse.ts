// Parses the opaque `context_usage_meta` JSON. Claude shape has
// `categories[]`; Codex shape has `total.totalTokens` + `modelContextWindow`.
//
// Codex semantics caveat: Codex's `total.*` is the THREAD'S CUMULATIVE
// BILLED tokens — every turn re-sends the entire conversation history as
// input, and `total` keeps adding it up turn after turn. So `total` blows
// past `modelContextWindow` as the conversation grows even though the
// actual context is small. The field that reflects current context fill
// is `last.*` — `last.totalTokens` ≈ tokens occupied by the conversation
// after the most recent turn (the input we'd send next + that turn's
// output). This is what the ring shows as `used`.

export type DisplayCategory = {
	name: string;
	tokens: number;
	percentage: number;
};

export type CodexTokenBreakdown = {
	total: number;
	input: number;
	cachedInput: number;
	output: number;
	reasoningOutput: number;
};

type BaseDisplay = {
	used: number;
	max: number;
	percentage: number;
};

export type ClaudeDisplay = BaseDisplay & {
	source: "claude";
	categories: DisplayCategory[];
	/** Claude SDK option — when true, the agent reclaims context by
	 *  summarising older turns once the window approaches full. */
	autoCompacts: boolean;
};

export type CodexDisplay = BaseDisplay & {
	source: "codex";
	/** Most recent turn's breakdown — this is what fills the context window. */
	last: CodexTokenBreakdown;
};

export type ContextUsageDisplay = ClaudeDisplay | CodexDisplay;

type Json = unknown;

function asNumber(v: Json): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asObject(v: Json): Record<string, Json> | null {
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, Json>)
		: null;
}

function asArray(v: Json): Json[] | null {
	return Array.isArray(v) ? v : null;
}

/** Null for empty / unparseable / unknown shape. */
export function parseContextUsageMeta(
	json: string | null | undefined,
): ContextUsageDisplay | null {
	if (!json) return null;
	let parsed: Json;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	const root = asObject(parsed);
	if (!root) return null;

	if (asArray(root.categories)) return parseClaude(root);
	if (asObject(root.total) && asNumber(root.modelContextWindow) !== null) {
		return parseCodex(root);
	}
	return null;
}

function parseClaude(root: Record<string, Json>): ClaudeDisplay {
	const max = asNumber(root.maxTokens) ?? 0;
	const rawUsed = asNumber(root.totalTokens) ?? 0;
	// Clamp: the SDK may briefly report >100% during autocompact transitions
	// (maxTokens shifts as the threshold moves). A ring at 102% looks broken;
	// pin to the window so the worst case is "100%".
	const used = max > 0 ? Math.min(rawUsed, max) : rawUsed;
	const sdkPct = asNumber(root.percentage);
	const percentage = Math.min(sdkPct ?? computePercentage(used, max), 100);

	const categories: DisplayCategory[] = [];
	const rawCats = asArray(root.categories) ?? [];
	for (const entry of rawCats) {
		const obj = asObject(entry);
		if (!obj) continue;
		const name = typeof obj.name === "string" ? obj.name : null;
		const tokens = asNumber(obj.tokens) ?? 0;
		if (!name) continue;
		// "Free space" is the unallocated remainder — skip from the list.
		if (name === "Free space") continue;
		categories.push({
			name,
			tokens,
			percentage: max > 0 ? (tokens / max) * 100 : 0,
		});
	}
	categories.sort((a, b) => b.tokens - a.tokens);

	return {
		source: "claude",
		used,
		max,
		percentage,
		categories,
		autoCompacts: root.isAutoCompactEnabled === true,
	};
}

function parseCodexBreakdown(
	obj: Record<string, Json> | null,
): CodexTokenBreakdown | null {
	if (!obj) return null;
	return {
		total: asNumber(obj.totalTokens) ?? 0,
		input: asNumber(obj.inputTokens) ?? 0,
		cachedInput: asNumber(obj.cachedInputTokens) ?? 0,
		output: asNumber(obj.outputTokens) ?? 0,
		reasoningOutput: asNumber(obj.reasoningOutputTokens) ?? 0,
	};
}

function parseCodex(root: Record<string, Json>): CodexDisplay {
	// `last` is the source of truth for "how full is the context right now".
	// Fall back to `total` only when `last` is missing (e.g. zero-turn
	// session); for a single-turn thread `total === last` so they match.
	const last = parseCodexBreakdown(asObject(root.last)) ??
		parseCodexBreakdown(asObject(root.total)) ?? {
			total: 0,
			input: 0,
			cachedInput: 0,
			output: 0,
			reasoningOutput: 0,
		};
	const max = asNumber(root.modelContextWindow) ?? 0;
	const used = max > 0 ? Math.min(last.total, max) : last.total;
	return {
		source: "codex",
		used,
		max,
		percentage: Math.min(computePercentage(used, max), 100),
		last,
	};
}

function computePercentage(used: number, max: number): number {
	if (max <= 0) return 0;
	return (used / max) * 100;
}

/** "12.4k" / "1.0M" / "0". */
export function formatTokens(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens <= 0) return "0";
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

/** <60 default, 60–80 warning, >=80 danger. */
export type RingTier = "default" | "warning" | "danger";

export function ringTier(percentage: number): RingTier {
	if (percentage >= 80) return "danger";
	if (percentage >= 60) return "warning";
	return "default";
}

// ── Codex rate limits ───────────────────────────────────────────────────
//
// Stored as the raw `RateLimitSnapshot` JSON Codex sends. `primary` is the
// short window (5h on most plans), `secondary` the long one (7d). Both
// have `usedPercent` (0-100) and `resetsAt` (unix seconds).

export type RateLimitWindowDisplay = {
	/** Tokens already consumed in this window. 0–100. */
	usedPercent: number;
	/** Tokens remaining = 100 - usedPercent, clamped 0–100. */
	leftPercent: number;
	/** Approximate length of the window for the label ("5h" / "7d") — null
	 *  when Codex didn't include it. */
	label: string | null;
	/** Unix seconds when the window rolls over. Null if unknown. */
	resetsAt: number | null;
	/** True when `resetsAt` is in the past — Codex hasn't sent a fresh
	 *  snapshot yet but the local clock says the window already rolled. */
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
