import { executeRepoScript, type ScriptEvent, stopRepoScript } from "@/lib/api";

export type ScriptStatus = "idle" | "running" | "exited";

type Listener = {
	onChunk: (data: string) => void;
	onStatusChange: (status: ScriptStatus) => void;
	/**
	 * Called at the start of a fresh `startScript` invocation. Gives any
	 * already-attached listener a chance to clear its terminal so output from
	 * a previous run is not mixed with the new run's chunks — important when
	 * `startScript` is triggered from outside the tab (e.g. Cmd+R shortcut)
	 * while the tab is still mounted.
	 */
	onReset?: () => void;
};

type StatusListener = (status: ScriptStatus, exitCode: number | null) => void;

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
/**
 * Status-only subscribers. Unlike `listeners` (one active consumer per key,
 * typically the currently mounted tab panel), this supports multiple observers
 * so both the tab panel and the tab label header can reflect live status.
 */
const statusListeners = new Map<string, Set<StatusListener>>();

function emitStatus(k: string, status: ScriptStatus, exitCode: number | null) {
	const subs = statusListeners.get(k);
	if (!subs) return;
	for (const sub of subs) sub(status, exitCode);
}

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

	// Notify any already-attached listener to reset (e.g. clear its terminal)
	// before we swap in the fresh entry — prevents old output from the
	// previous run bleeding into the new run's stream.
	listeners.get(k)?.onReset?.();

	const entry: ScriptEntry = {
		chunks: [],
		bufferedBytes: 0,
		truncated: false,
		status: "running",
		exitCode: null,
	};
	entries.set(k, entry);

	listeners.get(k)?.onStatusChange("running");
	emitStatus(k, "running", null);

	executeRepoScript(
		repoId,
		scriptType,
		(event: ScriptEvent) => {
			if (entries.get(k) !== entry) return;

			switch (event.type) {
				case "started":
					break;
				case "stdout":
				case "stderr":
					appendChunk(entry, event.data);
					listeners.get(k)?.onChunk(event.data);
					break;
				case "exited":
					entry.status = "exited";
					entry.exitCode = event.code;
					listeners.get(k)?.onStatusChange("exited");
					emitStatus(k, "exited", event.code);
					break;
				case "error": {
					const msg = `\r\n\x1b[31m${event.message}\x1b[0m\r\n`;
					appendChunk(entry, msg);
					entry.status = "exited";
					// No exit code from the backend here — treat as failure.
					entry.exitCode = entry.exitCode ?? 1;
					listeners.get(k)?.onChunk(msg);
					listeners.get(k)?.onStatusChange("exited");
					emitStatus(k, "exited", entry.exitCode);
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
		entry.exitCode = entry.exitCode ?? 1;
		listeners.get(k)?.onChunk(msg);
		listeners.get(k)?.onStatusChange("exited");
		emitStatus(k, "exited", entry.exitCode);
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

/**
 * Subscribe to status-only updates for a script. Multiple subscribers are
 * allowed per key, so both the tab body and the tab header can observe live
 * status changes in parallel. Returns an unsubscribe fn.
 */
export function subscribeStatus(
	workspaceId: string,
	scriptType: string,
	listener: StatusListener,
): () => void {
	const k = key(workspaceId, scriptType);
	let set = statusListeners.get(k);
	if (!set) {
		set = new Set();
		statusListeners.set(k, set);
	}
	set.add(listener);
	return () => {
		const current = statusListeners.get(k);
		if (!current) return;
		current.delete(listener);
		if (current.size === 0) statusListeners.delete(k);
	};
}

/** Reset all state. Test-only. */
export function _resetForTesting() {
	entries.clear();
	listeners.clear();
	statusListeners.clear();
}
