/**
 * Dev-only entry point for react-scan.
 *
 * react-scan highlights React components that re-render unnecessarily and
 * surfaces FPS drops / slow interactions as an always-on profiler.
 *
 * Runs in Vite dev builds only. Use `?reactScan=0` when a local debugging
 * session needs to remove the scanner overhead.
 */
export function initDevReactScan() {
	if (!import.meta.env.DEV || typeof window === "undefined") {
		return;
	}

	const queryFlag = new URLSearchParams(window.location.search).get(
		"reactScan",
	);
	if (queryFlag === "0" || queryFlag === "false") {
		return;
	}

	// Dynamic import keeps react-scan out of production bundles. The module has
	// side effects during construction so it must be imported, not tree-shaken.
	void import("react-scan").then(({ scan }) => {
		scan({ enabled: true });
	});
}
