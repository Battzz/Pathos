import { executeRepoScript, type ScriptEvent, stopRepoScript } from "@/lib/api";
import { dedupUrlKey, extractLocalUrls } from "./detect-urls";

export type ScriptStatus = "idle" | "running" | "exited";

type Listener = {
	onChunk: (data: string) => void;
	onStatusChange: (status: ScriptStatus) => void;
	onUrlsChange?: (urls: string[]) => void;
};

/**
 * Max bytes of stdout/stderr retained per script entry. Long-running dev
 * servers (vite, webpack) can emit hundreds of MB if left unbounded, which
 * blows up memory and stalls the main thread on tab-switch replay.
 * ~2 MB ≈ 20k lines of typical output — well beyond xterm's 5000-line
 * scrollback, so replay can fully repopulate the visible buffer.
 */
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

/** Inserted once at the head of replay when earlier output was dropped. */
export const TRUNCATION_NOTICE =
	"\r\n\x1b[2m… earlier output truncated (buffer limit reached) …\x1b[0m\r\n";

export type ScriptEntry = {
	chunks: string[];
	/** Cached sum of chunk lengths; kept in sync by `appendChunk`. */
	bufferedBytes: number;
	/** True once any chunk has been dropped from the head. */
	truncated: boolean;
	status: ScriptStatus;
	exitCode: number | null;
	/**
	 * Localhost-style dev-server URLs detected in stdout/stderr so far, in
	 * first-seen order and deduped via {@link dedupUrlKey}. Populated lazily
	 * as new chunks arrive. Empty when the script hasn't printed any banner.
	 */
	urls: string[];
};

/** Append a chunk and evict from the head until under the byte cap. */
function appendChunk(entry: ScriptEntry, data: string) {
	entry.chunks.push(data);
	entry.bufferedBytes += data.length;

	while (entry.bufferedBytes > MAX_CHUNK_BYTES && entry.chunks.length > 1) {
		const dropped = entry.chunks.shift();
		if (dropped === undefined) break;
		entry.bufferedBytes -= dropped.length;
		entry.truncated = true;
	}
}

/** Module-level stores — survive React mount/unmount cycles. */
const entries = new Map<string, ScriptEntry>();
const listeners = new Map<string, Listener>();

function key(workspaceId: string, scriptType: string) {
	return `${workspaceId}:${scriptType}`;
}

export function getScriptState(workspaceId: string, scriptType: string) {
	return entries.get(key(workspaceId, scriptType)) ?? null;
}

export function startScript(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
) {
	const k = key(workspaceId, scriptType);

	const entry: ScriptEntry = {
		chunks: [],
		bufferedBytes: 0,
		truncated: false,
		status: "running",
		exitCode: null,
		urls: [],
	};
	entries.set(k, entry);

	listeners.get(k)?.onStatusChange("running");
	// Reset URL listener to empty — previous run's URLs don't apply.
	listeners.get(k)?.onUrlsChange?.([]);

	executeRepoScript(
		repoId,
		scriptType,
		(event: ScriptEvent) => {
			if (entries.get(k) !== entry) return;

			switch (event.type) {
				case "started":
					break;
				case "stdout":
				case "stderr": {
					appendChunk(entry, event.data);
					listeners.get(k)?.onChunk(event.data);

					// Cheap short-circuit: once a dev server has settled into
					// steady-state, ~every chunk is HMR / request-log noise with
					// no URL. Skip the regex work when the chunk can't possibly
					// contain one. `event.data.includes("http")` is a plain
					// substring scan — ~100x faster than the ANSI+URL regex
					// combo and totally safe (any real localhost URL has "http"
					// verbatim in bytes, even when wrapped in ANSI).
					//
					// We still run detection on every chunk until we've seen at
					// least one URL, so the initial banner is never missed.
					if (entry.urls.length > 0 && !event.data.includes("http")) {
						break;
					}

					// Scan the fresh chunk for dev-server URLs. We keep a deduped,
					// first-seen-ordered list on the entry and only fire the listener
					// when something actually changed.
					const fresh = extractLocalUrls(event.data);
					if (fresh.length > 0) {
						const seen = new Set(entry.urls.map(dedupUrlKey));
						let changed = false;
						for (const url of fresh) {
							const k2 = dedupUrlKey(url);
							if (!seen.has(k2)) {
								seen.add(k2);
								entry.urls.push(url);
								changed = true;
							}
						}
						if (changed) {
							listeners.get(k)?.onUrlsChange?.([...entry.urls]);
						}
					}
					break;
				}
				case "exited":
					entry.status = "exited";
					entry.exitCode = event.code;
					listeners.get(k)?.onStatusChange("exited");
					break;
				case "error": {
					const msg = `\r\n\x1b[31m${event.message}\x1b[0m\r\n`;
					appendChunk(entry, msg);
					entry.status = "exited";
					listeners.get(k)?.onChunk(msg);
					listeners.get(k)?.onStatusChange("exited");
					break;
				}
			}
		},
		workspaceId,
	).catch((err) => {
		if (entries.get(k) !== entry) return;
		const msg = `\r\n\x1b[31mFailed to start: ${err}\x1b[0m\r\n`;
		appendChunk(entry, msg);
		entry.status = "exited";
		listeners.get(k)?.onChunk(msg);
		listeners.get(k)?.onStatusChange("exited");
	});
}

export function stopScript(
	repoId: string,
	scriptType: "setup" | "run",
	workspaceId: string,
) {
	void stopRepoScript(repoId, scriptType, workspaceId);
}

/** Attach a live listener. Returns current entry for replay, or null. */
export function attach(
	workspaceId: string,
	scriptType: string,
	listener: Listener,
): ScriptEntry | null {
	listeners.set(key(workspaceId, scriptType), listener);
	return entries.get(key(workspaceId, scriptType)) ?? null;
}

/** Detach the live listener (entry stays alive). */
export function detach(workspaceId: string, scriptType: string) {
	listeners.delete(key(workspaceId, scriptType));
}

/** Reset all state. Test-only. */
export function _resetForTesting() {
	entries.clear();
	listeners.clear();
}
