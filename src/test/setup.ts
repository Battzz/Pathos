import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { createElement, type SVGProps } from "react";
import { vi } from "vitest";

// Default 1000ms is too tight for GitHub Actions runners where a 55-test
// file can take ~55s of transform+import time; waitFor checks bump into the
// ceiling during multi-render settling. Only affects vitest; production code
// is unchanged.
configure({ asyncUtilTimeout: 3000 });

// React 19.2's dev build schedules passive-effect work through
// `setImmediate`, and its callback reads `window.event` (react-dom's
// `schedulerEvent = window.event;` at react-dom-client.development.js L17920).
// On slow CI runners, that `setImmediate` occasionally fires AFTER vitest
// has torn down the test file's jsdom environment — at which point the
// global `window` binding is gone, and the read throws
// `ReferenceError: window is not defined`. Vitest collects that as an
// unhandled error and exits non-zero even when every test passed.
//
// Wrap all existing `uncaughtException` listeners (vitest registers its
// own error-collector at worker start, before setup files run) so we can
// short-circuit ONLY this specific, benign teardown-race error. Any other
// uncaught exception still reaches vitest's collector and fails the run
// as before.
if (
	typeof process !== "undefined" &&
	!process.env.HELMOR_REACT_SCHEDULER_FILTER_INSTALLED
) {
	process.env.HELMOR_REACT_SCHEDULER_FILTER_INSTALLED = "1";
	const isBenignReactSchedulerTeardown = (error: unknown) =>
		error instanceof ReferenceError &&
		/window is not defined/.test(error.message) &&
		typeof error.stack === "string" &&
		error.stack.includes("react-dom-client.development.js");

	const existingListeners = process.listeners("uncaughtException");
	process.removeAllListeners("uncaughtException");
	for (const listener of existingListeners) {
		process.on("uncaughtException", (error, origin) => {
			if (isBenignReactSchedulerTeardown(error)) {
				return;
			}
			(listener as (err: Error, origin: string) => void)(
				error as Error,
				origin,
			);
		});
	}
}

vi.mock("lottie-web/build/player/lottie_svg", () => ({
	default: {
		loadAnimation: vi.fn(() => ({
			destroy: vi.fn(),
		})),
	},
}));

vi.mock("@lobehub/icons", () => ({
	Github: (props: SVGProps<SVGSVGElement>) =>
		createElement("svg", { ...props, "data-testid": "mock-github-icon" }),
}));

// @tanstack/react-virtual requires a layout engine to determine visible items.
// jsdom has none, so mock the virtualizer to render all items unconditionally.
vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: (opts: {
		count: number;
		estimateSize: (i: number) => number;
		getItemKey: (i: number) => string | number;
	}) => {
		let offset = 0;
		const items = Array.from({ length: opts.count }, (_, i) => {
			const size = opts.estimateSize(i);
			const start = offset;
			offset += size;
			return { index: i, key: opts.getItemKey(i), size, start };
		});
		return {
			getVirtualItems: () => items,
			getTotalSize: () => offset,
			scrollToIndex: () => {},
		};
	},
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(() => ({
		onCloseRequested: vi.fn(async () => () => {}),
		setBadgeCount: vi.fn(async () => {}),
	})),
}));

vi.mock("@tauri-apps/api/webview", () => ({
	getCurrentWebview: vi.fn(() => ({
		setZoom: vi.fn(async () => {}),
	})),
}));

// `src/lib/api.ts` always calls `invoke` from `@tauri-apps/api/core` now —
// there is no browser-mode fallback layer anymore. jsdom has no Tauri runtime,
// so without this mock every test that triggers a real API function (via
// importOriginal in its own vi.mock setup) would throw and cascade into
// cleared workspace state. Return sensible defaults for the handful of
// commands the boot path hits; individual tests still mock `./lib/api`
// directly when they need specific return values.
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(async (command: string) => {
		switch (command) {
			case "get_github_identity_session":
				return {
					status: "connected",
					session: {
						provider: "test",
						githubUserId: 0,
						login: "test",
						name: "Test User",
						avatarUrl: null,
						primaryEmail: null,
						tokenExpiresAt: null,
						refreshTokenExpiresAt: null,
					},
				};
			case "get_github_cli_status":
				return {
					status: "ready",
					host: "github.com",
					login: "test",
					version: "test",
					message: "ok",
				};
			case "get_github_cli_user":
				return {
					login: "test",
					id: 0,
					name: "Test",
					avatarUrl: null,
					email: null,
				};
			case "list_github_accessible_repositories":
				return [];
			case "list_repositories":
				return [];
			case "list_agent_model_sections":
				return [];
			case "get_add_repository_defaults":
				return { lastCloneDirectory: null };
			case "get_data_info":
				return null;
			case "get_app_update_status":
				return {
					stage: "idle",
					configured: true,
					autoUpdateEnabled: true,
					update: null,
					lastError: null,
					lastAttemptAt: null,
					downloadedAt: null,
				};
			case "load_auto_close_action_kinds":
				return [];
			case "load_auto_close_opt_in_asked":
				return [];
			case "list_remote_branches":
				return [];
			case "list_workspace_files":
				return [];
			case "list_workspace_changes_with_content":
				return { items: [], prefetched: [] };
			case "list_slash_commands":
				return [];
			case "list_workspace_linked_directories":
				return [];
			case "list_workspace_candidate_directories":
				return [];
			case "lookup_workspace_pr":
				return null;
			case "get_workspace_git_action_status":
				return {
					uncommittedCount: 0,
					conflictCount: 0,
					syncTargetBranch: null,
					syncStatus: "unknown",
					behindTargetCount: 0,
					aheadOfRemoteCount: 0,
					remoteTrackingRef: null,
					pushStatus: "unknown",
				};
			case "get_workspace_pr_action_status":
				return {
					pr: null,
					reviewDecision: null,
					mergeable: null,
					deployments: [],
					checks: [],
					remoteState: "unavailable",
					message: null,
				};
			case "drain_pending_cli_sends":
				return [];
			case "conductor_source_available":
				return false;
			case "detect_installed_editors":
				return [];
			default:
				return undefined;
		}
	}),
	Channel: class {
		onmessage: ((event: unknown) => void) | null = null;
	},
}));

// cmdk calls `scrollIntoView` which jsdom doesn't implement.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}

if (
	typeof window !== "undefined" &&
	typeof window.ResizeObserver === "undefined"
) {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}

	// JSDOM does not provide ResizeObserver.
	window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
	globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("dark"),
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	})) as typeof window.matchMedia;
}

if (typeof HTMLCanvasElement !== "undefined") {
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => ({
			measureText: (text: string) => ({
				width: text.length * 8,
				actualBoundingBoxAscent: 10,
				actualBoundingBoxDescent: 4,
				fontBoundingBoxAscent: 10,
				fontBoundingBoxDescent: 4,
			}),
			save: () => {},
			restore: () => {},
			scale: () => {},
			clearRect: () => {},
			fillRect: () => {},
			setTransform: () => {},
			resetTransform: () => {},
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fillText: () => {},
			font: "",
			textBaseline: "alphabetic",
		})),
	});
}
