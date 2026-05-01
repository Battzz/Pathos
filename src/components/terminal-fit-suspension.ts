// Global suspend counter shared by every mounted terminal. Callers wrap
// layout animations or shell resizes to skip per-frame FitAddon reflows; a
// final fit runs once the last release fires.
let terminalFitSuspendCount = 0;
const terminalRefitListeners = new Set<() => void>();

/** Pause FitAddon.fit() across every mounted TerminalOutput. Idempotent release. */
export function suspendTerminalFit(): () => void {
	terminalFitSuspendCount++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		terminalFitSuspendCount--;
		if (terminalFitSuspendCount === 0) {
			for (const listener of terminalRefitListeners) listener();
		}
	};
}

export function isTerminalFitSuspended() {
	return terminalFitSuspendCount > 0;
}

export function addTerminalRefitListener(listener: () => void) {
	terminalRefitListeners.add(listener);
	return () => {
		terminalRefitListeners.delete(listener);
	};
}
