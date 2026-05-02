import "./App.css";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	Check,
	ChevronDown,
	CircleAlertIcon,
	FolderOpen,
	PanelLeftIcon,
	PanelRightIcon,
} from "lucide-react";
import {
	lazy,
	Suspense,
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { QuitConfirmDialog } from "@/components/quit-confirm-dialog";
import { SplashScreen } from "@/components/splash-screen";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommandBar } from "@/features/command-bar";
import { useWorkspaceCommitLifecycle } from "@/features/commit/hooks/use-commit-lifecycle";
import { useDockUnreadBadge } from "@/features/dock-badge";
import { WorkspaceEditorSurface } from "@/features/editor";
import { WorkspaceInspectorSidebar } from "@/features/inspector";
import { DiffStatsBadge } from "@/features/inspector/diff-stats-badge";
import { WorkspacesSidebarContainer } from "@/features/navigation/container";
import { requestSwitchSpace } from "@/features/navigation/space-events";
import { AppOnboarding } from "@/features/onboarding";
import { seedNewSessionInCache } from "@/features/panel/session-cache";
import { useConfirmSessionClose } from "@/features/panel/use-confirm-session-close";
import {
	isSettingsSection,
	SettingsButton,
	SettingsDialog,
	type SettingsSection,
} from "@/features/settings";
import { getShortcut } from "@/features/shortcuts/registry";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import {
	type ShortcutHandler,
	useAppShortcuts,
} from "@/features/shortcuts/use-app-shortcuts";
import { useGlobalHotkeySync } from "@/features/shortcuts/use-global-hotkey-sync";
import { AppUpdateButton } from "@/features/updater/app-update-button";
import { useAppUpdater } from "@/features/updater/use-app-updater";
import { EditorIcon } from "@/shell/editor-icon";
import { useEnsureDefaultModel } from "@/shell/hooks/use-ensure-default-model";
import { useShellPanels } from "@/shell/hooks/use-panels";
import { useUiSyncBridge } from "@/shell/hooks/use-ui-sync-bridge";
import {
	findAdjacentSessionId,
	findAdjacentWorkspaceId,
	flattenWorkspaceRows,
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	PREFERRED_EDITOR_STORAGE_KEY,
	SIDEBAR_RESIZE_HIT_AREA,
} from "@/shell/layout";
import { clampZoom, useZoom, ZOOM_STEP } from "@/shell/use-zoom";
import {
	createSession,
	drainPendingCliSends,
	markSessionRead,
	markSessionUnread,
	openWorkspaceInEditor,
	openWorkspaceInFinder,
	prewarmSlashCommandsForWorkspace,
	type RepositoryFolder,
	type RepositoryFolderChat,
	syncWorkspaceWithTargetBranch,
	triggerWorkspaceFetch,
	unhideSession,
	type WorkspaceDetail,
	type WorkspaceGroup,
	type WorkspaceSessionSummary,
} from "./lib/api";
import {
	type ComposerInsertRequest,
	type ResolvedComposerInsertRequest,
	resolveComposerInsertTarget,
} from "./lib/composer-insert";
import { ComposerInsertProvider } from "./lib/composer-insert-context";
import type { DiffOpenOptions, EditorSessionState } from "./lib/editor-session";
import { isPathWithinRoot } from "./lib/editor-session";
import {
	archivedWorkspacesQueryOptions,
	createPathosQueryClient,
	detectedEditorsQueryOptions,
	githubIdentityQueryOptions,
	pathosQueryKeys,
	pathosQueryPersister,
	repositoryFoldersQueryOptions,
	sessionThreadMessagesQueryOptions,
	workspaceChangeRequestQueryOptions,
	workspaceChangesQueryOptions,
	workspaceDetailQueryOptions,
	workspaceForgeActionStatusQueryOptions,
	workspaceForgeQueryOptions,
	workspaceGitActionStatusQueryOptions,
	workspaceGroupsQueryOptions,
	workspaceSessionsQueryOptions,
} from "./lib/query-client";
import { SendingSessionsProvider } from "./lib/sending-sessions-context";
import {
	type AppSettings,
	DEFAULT_SETTINGS,
	loadSettings,
	resolveTheme,
	SettingsContext,
	type ShortcutOverrides,
	saveSettings,
	THEME_STORAGE_KEY,
	type ThemeMode,
	useSettings,
} from "./lib/settings";
import { flushSidebarListsIfIdle } from "./lib/sidebar-mutation-gate";
import { useOsNotifications } from "./lib/use-os-notifications";
import {
	recomputeWorkspaceDetailUnread,
	recomputeWorkspaceUnreadInGroups,
	summaryToArchivedRow,
} from "./lib/workspace-helpers";
import {
	type WorkspaceToastOptions,
	WorkspaceToastProvider,
} from "./lib/workspace-toast-context";
import { StreamingFooterOverlapScenario } from "./test/e2e-scenarios/streaming-footer-overlap";

const SETTINGS_RELOAD_EVENT = "pathos:reload-settings";
const OPEN_SETTINGS_EVENT = "pathos:open-settings";

const WorkspaceConversationContainer = lazy(() =>
	import("@/features/conversation").then((module) => ({
		default: module.WorkspaceConversationContainer,
	})),
);

function clearRepositoryFolderChatUnread(
	folders: RepositoryFolder[] | undefined,
	sessionId: string,
): RepositoryFolder[] | undefined {
	if (!folders) return folders;
	let changed = false;
	const nextFolders = folders.map((folder) => {
		let folderChanged = false;
		const chats = folder.chats.map((chat) => {
			if (chat.sessionId !== sessionId || chat.unreadCount === 0) {
				return chat;
			}
			folderChanged = true;
			changed = true;
			return { ...chat, unreadCount: 0 };
		});
		if (!folderChanged) return folder;
		return { ...folder, chats };
	});
	return changed ? nextFolders : folders;
}

function clearGenericChatUnread(
	chats: RepositoryFolderChat[] | undefined,
	sessionId: string,
): RepositoryFolderChat[] | undefined {
	if (!chats) return chats;
	let changed = false;
	const nextChats = chats.map((chat) => {
		if (chat.sessionId !== sessionId || chat.unreadCount === 0) {
			return chat;
		}
		changed = true;
		return { ...chat, unreadCount: 0 };
	});
	return changed ? nextChats : chats;
}

function App() {
	const e2eScenario =
		typeof window === "undefined"
			? null
			: new URLSearchParams(window.location.search).get("e2eScenario");

	if (e2eScenario === "streaming-footer-overlap") {
		return <StreamingFooterOverlapScenario />;
	}

	return <MainApp />;
}

function MainApp() {
	const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(
		null,
	);
	const [settingsWorkspaceRepoId, setSettingsWorkspaceRepoId] = useState<
		string | null
	>(null);
	const [settingsInitialSection, setSettingsInitialSection] =
		useState<SettingsSection>();
	const [queryClient] = useState(() => createPathosQueryClient());
	const preloadSettings = useMemo<AppSettings>(() => {
		const t = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
		return { ...DEFAULT_SETTINGS, theme: t ?? DEFAULT_SETTINGS.theme };
	}, []);

	const settingsContextValue = useMemo(
		() => ({
			settings: appSettings ?? preloadSettings,
			isLoaded: appSettings !== null,
			updateSettings: (patch: Partial<AppSettings>) => {
				setAppSettings((previous) => {
					const next = { ...(previous ?? DEFAULT_SETTINGS), ...patch };
					return next;
				});
				return saveSettings(patch);
			},
		}),
		[appSettings, preloadSettings],
	);
	useEffect(() => {
		const handleOpenSettings = (event: Event) => {
			const detail =
				event instanceof CustomEvent &&
				event.detail &&
				typeof event.detail === "object"
					? (event.detail as { section?: unknown })
					: {};
			const section = isSettingsSection(detail.section)
				? detail.section
				: undefined;
			setSettingsInitialSection(section);
			setSettingsWorkspaceId(null);
			setSettingsWorkspaceRepoId(null);
			setSettingsOpen(true);
		};
		window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
		return () =>
			window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
	}, []);
	const [splashVisible, setSplashVisible] = useState(true);
	const [splashMounted, setSplashMounted] = useState(true);

	const hideSplashAfterBoot = useCallback(() => {
		window.setTimeout(() => {
			setSplashVisible(false);
			window.setTimeout(() => setSplashMounted(false), 400);
		}, 1000);
	}, []);

	const completeOnboarding = useCallback(() => {
		setSplashMounted(true);
		setSplashVisible(true);
		setAppSettings((previous) => ({
			...(previous ?? DEFAULT_SETTINGS),
			onboardingCompleted: true,
		}));
		void saveSettings({ onboardingCompleted: true });

		requestAnimationFrame(() => {
			requestAnimationFrame(hideSplashAfterBoot);
		});
	}, [hideSplashAfterBoot]);

	useEffect(() => {
		let cancelled = false;
		void loadSettings().then((settings) => {
			if (cancelled) return;
			setAppSettings(settings);
			// When onboarding is needed, the OnboardingSplash takes over the
			// "Pathos is starting" moment with its own brand sequence — so we
			// dismiss the boot splash as soon as we know, instead of holding
			// for a full second behind the curtain.
			const minDelay = settings.onboardingCompleted ? 1000 : 0;
			window.setTimeout(() => {
				if (cancelled) return;
				setSplashVisible(false);
				window.setTimeout(() => setSplashMounted(false), 400);
			}, minDelay);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const handleSettingsReload = () => {
			void loadSettings().then(setAppSettings);
		};

		window.addEventListener(SETTINGS_RELOAD_EVENT, handleSettingsReload);
		return () => {
			window.removeEventListener(SETTINGS_RELOAD_EVENT, handleSettingsReload);
		};
	}, []);

	return (
		<SettingsContext.Provider value={settingsContextValue}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{
					persister: pathosQueryPersister,
					dehydrateOptions: {
						shouldDehydrateQuery: (query) => {
							// Never persist session thread messages — they must
							// always be loaded fresh from the DB. Stale streaming
							// snapshots surviving app restart was a root cause of
							// cross-session message contamination.
							const key = query.queryKey;
							if (
								key[0] === "sessionMessages" &&
								key.length >= 3 &&
								key[2] === "thread"
							) {
								return false;
							}
							if (key[0] === "slashCommands") {
								return false;
							}
							if (key[0] === "agentModelSections") {
								return false;
							}
							if (key[0] === "githubIdentity") {
								return false;
							}
							// Workspace lists are fast local DB queries — always
							// load fresh to avoid "ghost workspace" errors on startup.
							if (
								key[0] === "workspaceGroups" ||
								key[0] === "archivedWorkspaces"
							) {
								return false;
							}
							if (
								key[0] === "workspaceChanges" ||
								key[0] === "workspaceFiles"
							) {
								return false;
							}
							return query.state.status === "success";
						},
					},
				}}
				onSuccess={() => {
					// Discard any leftover workspace list data from older
					// cache snapshots so we never select a ghost workspace.
					queryClient.removeQueries({
						queryKey: pathosQueryKeys.workspaceGroups,
					});
					queryClient.removeQueries({
						queryKey: pathosQueryKeys.archivedWorkspaces,
					});
				}}
			>
				<StartupPreloader />
				{appSettings === null ? null : !appSettings.onboardingCompleted ? (
					<AppOnboarding onComplete={completeOnboarding} />
				) : (
					<AppShell
						onOpenSettings={(workspaceId, workspaceRepoId, initialSection) => {
							setSettingsInitialSection(
								initialSection as SettingsSection | undefined,
							);
							setSettingsWorkspaceId(workspaceId);
							setSettingsWorkspaceRepoId(workspaceRepoId);
							setSettingsOpen(true);
						}}
					/>
				)}
				{splashMounted && <SplashScreen visible={splashVisible} />}
				<SettingsDialog
					open={settingsOpen}
					workspaceId={settingsWorkspaceId}
					workspaceRepoId={settingsWorkspaceRepoId}
					initialSection={settingsInitialSection}
					onClose={() => {
						setSettingsOpen(false);
						void queryClient.invalidateQueries({
							queryKey: ["repoScripts"],
						});
					}}
				/>
			</PersistQueryClientProvider>
		</SettingsContext.Provider>
	);
}

function StartupPreloader() {
	const queryClient = useQueryClient();
	useEffect(() => {
		void queryClient.prefetchQuery(githubIdentityQueryOptions());
	}, [queryClient]);

	return null;
}

function AppShell({
	onOpenSettings,
}: {
	onOpenSettings: (
		workspaceId: string | null,
		workspaceRepoId: string | null,
		initialSection?: string,
	) => void;
}) {
	useZoom();
	const queryClient = useQueryClient();
	const workspaceSelectionRequestRef = useRef(0);
	const sessionSelectionRequestRef = useRef(0);
	const startupPrefetchedWorkspaceRef = useRef<string | null>(null);
	const warmedWorkspaceIdsRef = useRef<Set<string>>(new Set());
	const selectedWorkspaceIdRef = useRef<string | null>(null);
	const selectedSessionIdRef = useRef<string | null>(null);
	// Tracks which session we last persisted as "read" so the auto-read effect
	// stays idempotent when interaction-required state churns without the
	// displayed session changing.
	const lastMarkedReadSessionIdRef = useRef<string | null>(null);
	// Bumped whenever the user re-clicks the already-selected workspace. The
	// mark-session-read effect depends on this tick so a manual "mark as
	// unread" followed by clicking the same workspace clears the dot, even
	// though displayedSessionId didn't change.
	const [workspaceReselectTick, setWorkspaceReselectTick] = useState(0);
	const lastMarkedReadReselectTickRef = useRef(0);

	const workspaceViewModeRef = useRef<"conversation" | "editor">(
		"conversation",
	);
	const sessionSelectionHistoryByWorkspaceRef = useRef<
		Record<string, string[]>
	>({});
	const pushWorkspaceToast = useCallback(
		(
			description: string,
			title = "Action failed",
			variant: "default" | "destructive" = "destructive",
			opts?: {
				action?: WorkspaceToastOptions["action"];
				persistent?: boolean;
			},
		) => {
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const action = opts?.action
				? {
						label: opts.action.label,
						onClick: () => {
							opts.action?.onClick();
							toast.dismiss(id);
						},
					}
				: undefined;
			const cancel = opts?.action
				? {
						label: "Dismiss",
						onClick: () => {
							toast.dismiss(id);
						},
					}
				: undefined;
			const toastOptions = {
				id,
				description,
				duration: opts?.persistent ? Number.POSITIVE_INFINITY : 4200,
				action,
				cancel,
			};

			if (variant === "destructive") {
				// Inline the alert icon inside the title so it sits on the same
				// line (sonner's default icon slot is hidden for the error variant
				// via `errorToastClass` — see `components/ui/sonner.tsx`).
				const titleNode = (
					<span className="inline-flex items-center gap-1.5">
						<CircleAlertIcon className="size-3.5 shrink-0" />
						<span>{title}</span>
					</span>
				);
				toast.error(titleNode, toastOptions);
				return;
			}

			toast(title, toastOptions);
		},
		[],
	);
	const {
		handleResizeKeyDown,
		handleResizeStart,
		inspectorWidth,
		isInspectorResizing,
		isSidebarResizing,
		sidebarCollapsed,
		sidebarWidth,
		setSidebarCollapsed,
		shellPanelsRef,
		shellPanelsStyle,
	} = useShellPanels();
	const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
	const [inspectorSidebarMountedKey, setInspectorSidebarMountedKey] = useState<
		string | null
	>(null);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
		null,
	);
	const [displayedWorkspaceId, setDisplayedWorkspaceId] = useState<
		string | null
	>(null);
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const [displayedSessionId, setDisplayedSessionId] = useState<string | null>(
		null,
	);
	const inspectorSidebarShouldRender =
		!inspectorCollapsed && Boolean(displayedSessionId);
	const inspectorSidebarMountKey = inspectorSidebarShouldRender
		? `${selectedWorkspaceId ?? ""}:${displayedSessionId ?? ""}`
		: null;
	const inspectorSidebarMounted =
		inspectorSidebarMountKey !== null &&
		inspectorSidebarMountedKey === inspectorSidebarMountKey;
	const [workspaceViewMode, setWorkspaceViewMode] = useState<
		"conversation" | "editor"
	>("conversation");
	const [editorSession, setEditorSession] = useState<EditorSessionState | null>(
		null,
	);
	const [, setSendingWorkspaceIds] = useState<Set<string>>(() => new Set());
	// Session IDs currently streaming — reported by WorkspaceConversationContainer
	// and consumed by the commit button driver to detect stream completion.
	const [sendingSessionIds, setSendingSessionIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [pendingComposerInserts, setPendingComposerInserts] = useState<
		ResolvedComposerInsertRequest[]
	>([]);
	const [commandBarOpen, setCommandBarOpen] = useState(false);
	// Tracks sessions that have reached a terminal "done" event at least once
	// in this app run. Used by the commit lifecycle to know when to prompt.
	// Distinct from "unread" — `unreadCount` is the persisted, cross-restart
	// signal driven entirely from the backend.
	const [settledSessionIds, setSettledSessionIds] = useState<Set<string>>(
		() => new Set(),
	);
	// Sessions that terminated via abort (stop stream) rather than normal
	// completion. Used by the commit lifecycle to return the button to idle
	// when the user aborts an action session (e.g. Create PR).
	const [abortedSessionIds, setAbortedSessionIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [interactionRequiredSessions, setInteractionRequiredSessions] =
		useState<Map<string, string>>(() => new Map());
	const interactionRequiredSessionIds = useMemo(
		() => new Set(interactionRequiredSessions.keys()),
		[interactionRequiredSessions],
	);
	useEffect(() => {
		if (inspectorSidebarMountKey === null) {
			setInspectorSidebarMountedKey(null);
			return;
		}

		const frameId = window.requestAnimationFrame(() => {
			setInspectorSidebarMountedKey(inspectorSidebarMountKey);
		});

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, [inspectorSidebarMountKey]);
	// Persist "session read" once the user actually views a session AND it is
	// not waiting on an interaction prompt. Workspace.unread is purely derived
	// from sessions, so clearing the session naturally drops the workspace red
	// dot when no other sessions remain unread. Selecting a workspace alone
	// must NOT clear unread state — only opening a session does.
	//
	// Optimistically applies the cleared state to the cache so the sidebar dot
	// and dock badge react instantly, then commits via IPC + invalidate. If the
	// IPC fails the optimistic patch is rolled back.
	useEffect(() => {
		if (!displayedSessionId) {
			lastMarkedReadSessionIdRef.current = null;
			return;
		}
		if (interactionRequiredSessionIds.has(displayedSessionId)) {
			// Reset the dedupe key so once the interaction completes the next
			// effect run will fire the IPC.
			lastMarkedReadSessionIdRef.current = null;
			return;
		}
		if (
			lastMarkedReadSessionIdRef.current === displayedSessionId &&
			workspaceReselectTick === lastMarkedReadReselectTickRef.current
		) {
			return;
		}

		const sessionId = displayedSessionId;
		const workspaceId = selectedWorkspaceIdRef.current;
		lastMarkedReadSessionIdRef.current = sessionId;
		lastMarkedReadReselectTickRef.current = workspaceReselectTick;

		// Snapshot for rollback on IPC failure.
		const previousGroups = queryClient.getQueryData(
			pathosQueryKeys.workspaceGroups,
		);
		const previousRepositoryFolders = queryClient.getQueryData(
			pathosQueryKeys.repositoryFolders,
		);
		const previousGenericChats = queryClient.getQueryData(
			pathosQueryKeys.genericChats,
		);
		const previousDetail = workspaceId
			? queryClient.getQueryData(pathosQueryKeys.workspaceDetail(workspaceId))
			: undefined;
		const previousSessions = workspaceId
			? queryClient.getQueryData(pathosQueryKeys.workspaceSessions(workspaceId))
			: undefined;

		// Optimistic: clear this session's unread in the sessions cache, then
		// recompute the owning workspace's hasUnread / unreadSessionCount /
		// workspaceUnread from the patched session list. Sidebar dot and dock
		// badge react instantly; the IPC + invalidate afterwards reconciles.
		let remainingUnread = 0;
		if (workspaceId) {
			const currentSessions = queryClient.getQueryData<
				WorkspaceSessionSummary[] | undefined
			>(pathosQueryKeys.workspaceSessions(workspaceId));
			if (Array.isArray(currentSessions)) {
				const patched = currentSessions.map((session) =>
					session.id === sessionId ? { ...session, unreadCount: 0 } : session,
				);
				remainingUnread = patched.filter((s) => s.unreadCount > 0).length;
				queryClient.setQueryData<WorkspaceSessionSummary[]>(
					pathosQueryKeys.workspaceSessions(workspaceId),
					patched,
				);
			}
			queryClient.setQueryData<WorkspaceGroup[] | undefined>(
				pathosQueryKeys.workspaceGroups,
				(current) =>
					recomputeWorkspaceUnreadInGroups(
						current,
						workspaceId,
						remainingUnread,
					),
			);
			queryClient.setQueryData<WorkspaceDetail | null | undefined>(
				pathosQueryKeys.workspaceDetail(workspaceId),
				(current) =>
					current
						? recomputeWorkspaceDetailUnread(current, remainingUnread)
						: current,
			);
		}
		queryClient.setQueryData<RepositoryFolder[] | undefined>(
			pathosQueryKeys.repositoryFolders,
			(current) => clearRepositoryFolderChatUnread(current, sessionId),
		);
		queryClient.setQueryData<RepositoryFolderChat[] | undefined>(
			pathosQueryKeys.genericChats,
			(current) => clearGenericChatUnread(current, sessionId),
		);

		void markSessionRead(sessionId)
			.then(() => {
				// Skip sidebar-list invalidations while a sidebar mutation
				// (archive/restore/create/delete/pin) is in flight: the server
				// state is mid-transition and a refetch here would overwrite
				// the optimistic cache with a stale snapshot, bouncing the row
				// back to its pre-mutation position. The mutation owner flushes
				// these lists in its own `.finally`.
				flushSidebarListsIfIdle(queryClient);
				const invalidations: Promise<void>[] = [];
				if (workspaceId) {
					invalidations.push(
						queryClient.invalidateQueries({
							queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
						}),
						queryClient.invalidateQueries({
							queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
						}),
					);
				}
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.repositoryFolders,
					}),
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.genericChats,
					}),
				);
				return Promise.all(invalidations);
			})
			.catch((error) => {
				// Roll back the optimistic patch and reset dedupe so a retry can
				// succeed.
				queryClient.setQueryData(
					pathosQueryKeys.workspaceGroups,
					previousGroups,
				);
				queryClient.setQueryData(
					pathosQueryKeys.repositoryFolders,
					previousRepositoryFolders,
				);
				queryClient.setQueryData(
					pathosQueryKeys.genericChats,
					previousGenericChats,
				);
				if (workspaceId) {
					queryClient.setQueryData(
						pathosQueryKeys.workspaceDetail(workspaceId),
						previousDetail,
					);
					queryClient.setQueryData(
						pathosQueryKeys.workspaceSessions(workspaceId),
						previousSessions,
					);
				}
				if (lastMarkedReadSessionIdRef.current === sessionId) {
					lastMarkedReadSessionIdRef.current = null;
				}
				console.error("[app] mark session read on view:", error);
			});
	}, [
		displayedSessionId,
		interactionRequiredSessionIds,
		queryClient,
		workspaceReselectTick,
	]);

	const {
		settings: appSettings,
		isLoaded: areSettingsLoaded,
		updateSettings,
	} = useSettings();
	const appUpdateStatus = useAppUpdater();
	useDockUnreadBadge();
	useEnsureDefaultModel();
	const notify = useOsNotifications(appSettings);
	const installedEditorsQuery = useQuery(detectedEditorsQueryOptions());
	const installedEditors = installedEditorsQuery.data ?? [];
	const [preferredEditorId, setPreferredEditorId] = useState<string | null>(
		() => localStorage.getItem(PREFERRED_EDITOR_STORAGE_KEY),
	);
	const preferredEditor =
		installedEditors.find((e) => e.id === preferredEditorId) ??
		installedEditors[0] ??
		null;
	const openPreferredEditorShortcut = getShortcut(
		appSettings.shortcuts,
		"workspace.openInEditor",
	);
	const addRepositoryShortcut = getShortcut(
		appSettings.shortcuts,
		"workspace.addRepository",
	);
	const newChatShortcut = getShortcut(appSettings.shortcuts, "session.new");
	const deleteChatShortcut = getShortcut(
		appSettings.shortcuts,
		"session.close",
	);
	const commandBarShortcut = getShortcut(
		appSettings.shortcuts,
		"commandBar.open",
	);
	const leftSidebarToggleShortcut = getShortcut(
		appSettings.shortcuts,
		"sidebar.left.toggle",
	);
	const rightSidebarToggleShortcut = getShortcut(
		appSettings.shortcuts,
		"sidebar.right.toggle",
	);
	const handleUpdateGlobalHotkeyShortcuts = useCallback(
		(shortcuts: ShortcutOverrides) => updateSettings({ shortcuts }),
		[updateSettings],
	);
	useGlobalHotkeySync({
		isLoaded: areSettingsLoaded,
		shortcuts: appSettings.shortcuts,
		updateShortcuts: handleUpdateGlobalHotkeyShortcuts,
	});
	const handleOpenPreferredEditor = useCallback(() => {
		if (!selectedWorkspaceId || !preferredEditor) return;
		void openWorkspaceInEditor(selectedWorkspaceId, preferredEditor.id).catch(
			(e) =>
				pushWorkspaceToast(String(e), `Failed to open ${preferredEditor.name}`),
		);
	}, [preferredEditor, pushWorkspaceToast, selectedWorkspaceId]);
	const handleToggleTheme = useCallback(() => {
		updateSettings({
			theme: resolveTheme(appSettings.theme) === "dark" ? "light" : "dark",
		});
	}, [appSettings.theme, updateSettings]);
	const handleToggleZenMode = useCallback(() => {
		const zenActive = sidebarCollapsed && inspectorCollapsed;
		setSidebarCollapsed(!zenActive);
		setInspectorCollapsed(!zenActive);
	}, [inspectorCollapsed, setSidebarCollapsed, sidebarCollapsed]);
	const handleToggleInspectorSidebar = useCallback(() => {
		setInspectorCollapsed((collapsed) => !collapsed);
	}, []);
	const handleOpenModelPicker = useCallback(() => {
		window.dispatchEvent(new Event("pathos:open-model-picker"));
	}, []);
	const handlePullLatest = useCallback(async () => {
		if (!selectedWorkspaceId) return;
		try {
			const result = await syncWorkspaceWithTargetBranch(selectedWorkspaceId);
			if (result.outcome === "updated") {
				toast.success(`Pulled latest from ${result.targetBranch}`);
			} else if (result.outcome === "alreadyUpToDate") {
				toast(`Already up to date with ${result.targetBranch}`);
			} else {
				toast.error(`Pull from ${result.targetBranch} needs attention`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to pull target branch updates.",
			);
		} finally {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey:
						pathosQueryKeys.workspaceGitActionStatus(selectedWorkspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceChangeRequest(selectedWorkspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey:
						pathosQueryKeys.workspaceForgeActionStatus(selectedWorkspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceDetail(selectedWorkspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceGroups,
				}),
				queryClient.invalidateQueries({ queryKey: ["workspaceChanges"] }),
			]);
		}
	}, [queryClient, selectedWorkspaceId]);

	const navigationGroupsQuery = useQuery(workspaceGroupsQueryOptions());
	const navigationArchivedQuery = useQuery(archivedWorkspacesQueryOptions());
	const repositoryFoldersQuery = useQuery(repositoryFoldersQueryOptions());
	const workspaceGroups = navigationGroupsQuery.data ?? [];
	const archivedRows = useMemo(
		() => (navigationArchivedQuery.data ?? []).map(summaryToArchivedRow),
		[navigationArchivedQuery.data],
	);
	const selectedWorkspaceDetailQuery = useQuery({
		...workspaceDetailQueryOptions(selectedWorkspaceId ?? "__none__"),
		enabled: selectedWorkspaceId !== null,
	});
	const selectedWorkspaceSessionsQuery = useQuery({
		...workspaceSessionsQueryOptions(selectedWorkspaceId ?? "__none__"),
		enabled: selectedWorkspaceId !== null,
	});
	const handleOpenSettings = useCallback(
		(initialSection?: unknown): void => {
			const section = isSettingsSection(initialSection)
				? initialSection
				: undefined;
			onOpenSettings(
				selectedWorkspaceId,
				selectedWorkspaceDetailQuery.data?.repoId ?? null,
				section,
			);
		},
		[
			onOpenSettings,
			selectedWorkspaceDetailQuery.data?.repoId,
			selectedWorkspaceId,
		],
	);
	const selectedWorkspaceDetail =
		selectedWorkspaceDetailQuery.data ??
		(selectedWorkspaceId
			? queryClient.getQueryData<WorkspaceDetail | null>(
					pathosQueryKeys.workspaceDetail(selectedWorkspaceId),
				)
			: null) ??
		null;
	const hasResolvedSelectedWorkspace =
		selectedWorkspaceId !== null && selectedWorkspaceDetail !== null;
	const workspaceRootPath =
		selectedWorkspaceDetail?.state === "archived"
			? null
			: (selectedWorkspaceDetail?.rootPath ?? null);
	const workspaceChangesQuery = useQuery({
		...workspaceChangesQueryOptions(workspaceRootPath ?? ""),
		enabled: Boolean(workspaceRootPath),
	});
	const workspaceDiffStats = useMemo(() => {
		const items = workspaceChangesQuery.data?.items ?? [];
		return items.reduce(
			(stats, item) => ({
				insertions: stats.insertions + item.insertions,
				deletions: stats.deletions + item.deletions,
			}),
			{ insertions: 0, deletions: 0 },
		);
	}, [workspaceChangesQuery.data]);
	const hasWorkspaceDiffStats =
		workspaceDiffStats.insertions > 0 || workspaceDiffStats.deletions > 0;

	const handleCopyWorkspacePath = useCallback(() => {
		if (!workspaceRootPath) return;
		void navigator.clipboard.writeText(workspaceRootPath).then(() => {
			toast.success("Path copied", {
				description: workspaceRootPath,
				duration: 2000,
			});
		});
	}, [workspaceRootPath]);

	const workspaceForgeQuery = useQuery({
		...workspaceForgeQueryOptions(selectedWorkspaceId ?? "__none__"),
		enabled: hasResolvedSelectedWorkspace,
	});
	const workspaceForge = workspaceForgeQuery.data ?? null;
	const workspaceForgeProvider = workspaceForge?.provider ?? "unknown";
	const workspaceForgeQueriesEnabled =
		hasResolvedSelectedWorkspace &&
		selectedWorkspaceDetail?.state !== "archived" &&
		(workspaceForgeProvider === "gitlab" ||
			workspaceForgeProvider === "github");

	// Seed the change-request query with whatever PR snapshot is already
	// persisted on the workspace row. Lets the inspector render the PR badge
	// optimistically on first visit, before the live forge query returns.
	const workspaceChangeRequestSeed = useMemo(
		() => ({
			prSyncState: selectedWorkspaceDetail?.prSyncState,
			prUrl: selectedWorkspaceDetail?.prUrl ?? null,
			prTitle: selectedWorkspaceDetail?.prTitle ?? null,
		}),
		[
			selectedWorkspaceDetail?.prSyncState,
			selectedWorkspaceDetail?.prUrl,
			selectedWorkspaceDetail?.prTitle,
		],
	);
	const workspaceChangeRequestQuery = useQuery({
		...workspaceChangeRequestQueryOptions(
			selectedWorkspaceId ?? "__none__",
			workspaceChangeRequestSeed,
		),
		enabled: workspaceForgeQueriesEnabled,
	});
	const workspaceChangeRequest = workspaceChangeRequestQuery.data ?? null;
	const pullRequestUrl =
		workspaceChangeRequest?.url || selectedWorkspaceDetail?.prUrl || null;
	const handleOpenPullRequest = useCallback(() => {
		if (!pullRequestUrl) return;
		void openUrl(pullRequestUrl).catch((error) => {
			pushWorkspaceToast(
				error instanceof Error ? error.message : String(error),
				"Unable to open pull request",
				"destructive",
			);
		});
	}, [pullRequestUrl, pushWorkspaceToast]);

	const workspaceForgeActionStatusQuery = useQuery({
		...workspaceForgeActionStatusQueryOptions(
			selectedWorkspaceId ?? "__none__",
		),
		enabled: workspaceForgeQueriesEnabled,
	});
	const workspaceForgeActionStatus =
		workspaceForgeActionStatusQuery.data ?? null;

	// Drive the inspector's git-header shimmer. Only show it on the first
	// cold fetch — not on background refetches, and not while we're already
	// rendering a placeholder built from the persisted PR snapshot.
	const workspaceForgeIsRefreshing =
		(workspaceChangeRequestQuery.isFetching &&
			(workspaceChangeRequestQuery.data === undefined ||
				workspaceChangeRequestQuery.isPlaceholderData)) ||
		(workspaceForgeActionStatusQuery.isFetching &&
			workspaceForgeActionStatusQuery.data === undefined);

	const workspaceGitActionStatusQuery = useQuery({
		...workspaceGitActionStatusQueryOptions(selectedWorkspaceId ?? "__none__"),
		enabled:
			hasResolvedSelectedWorkspace &&
			selectedWorkspaceDetail?.state !== "archived",
	});
	const workspaceGitActionStatus = workspaceGitActionStatusQuery.data ?? null;

	const clearWorkspaceRuntimeState = useCallback(() => {
		selectedWorkspaceIdRef.current = null;
		selectedSessionIdRef.current = null;
		setSelectedWorkspaceId(null);
		setDisplayedWorkspaceId(null);
		setSelectedSessionId(null);
		setDisplayedSessionId(null);
		setWorkspaceViewMode("conversation");
		setEditorSession(null);
	}, []);

	useEffect(() => {
		if (
			!selectedWorkspaceId ||
			!selectedWorkspaceDetailQuery.isError ||
			selectedWorkspaceDetailQuery.isFetching
		) {
			return;
		}

		clearWorkspaceRuntimeState();
	}, [
		clearWorkspaceRuntimeState,
		selectedWorkspaceDetailQuery.isError,
		selectedWorkspaceDetailQuery.isFetching,
		selectedWorkspaceId,
	]);

	useEffect(() => {
		selectedWorkspaceIdRef.current = selectedWorkspaceId;
	}, [selectedWorkspaceId]);

	useEffect(() => {
		selectedSessionIdRef.current = selectedSessionId;
	}, [selectedSessionId]);

	useEffect(() => {
		workspaceViewModeRef.current = workspaceViewMode;
	}, [workspaceViewMode]);

	// Persist last workspace/session for restore-on-launch
	useEffect(() => {
		if (selectedWorkspaceId) {
			void saveSettings({ lastWorkspaceId: selectedWorkspaceId });
		}
	}, [selectedWorkspaceId]);

	useEffect(() => {
		if (selectedSessionId) {
			void saveSettings({ lastSessionId: selectedSessionId });
		}
	}, [selectedSessionId]);

	const rememberSessionSelection = useCallback(
		(workspaceId: string | null, sessionId: string | null) => {
			if (!workspaceId || !sessionId) {
				return;
			}

			const current =
				sessionSelectionHistoryByWorkspaceRef.current[workspaceId] ?? [];
			const next = [...current.filter((id) => id !== sessionId), sessionId];
			sessionSelectionHistoryByWorkspaceRef.current[workspaceId] =
				next.slice(-16);
		},
		[],
	);

	useEffect(() => {
		if (!editorSession) {
			return;
		}

		if (isPathWithinRoot(editorSession.path, workspaceRootPath)) {
			return;
		}

		setWorkspaceViewMode("conversation");
		setEditorSession(null);
	}, [editorSession, workspaceRootPath]);

	useEffect(() => {
		const apply = () => {
			const effective = resolveTheme(appSettings.theme);
			document.documentElement.classList.toggle("dark", effective === "dark");
			document.documentElement.style.colorScheme = effective;
			// Sync the native window appearance so NSVisualEffectView
			// vibrancy under transparent panels picks the right material
			// (light/dark) instead of always following the system.
			void import("@tauri-apps/api/window")
				.then(({ getCurrentWindow }) => getCurrentWindow().setTheme(effective))
				.catch(() => {});
			// Monaco's theme is synced via a MutationObserver inside
			// `monaco-runtime.ts` — avoid importing it here to keep Monaco out
			// of the critical boot path and out of tests that never open the
			// editor.
		};

		apply();

		if (
			appSettings.theme === "system" &&
			typeof window.matchMedia === "function"
		) {
			const mq = window.matchMedia("(prefers-color-scheme: dark)");
			mq.addEventListener("change", apply);
			return () => mq.removeEventListener("change", apply);
		}
	}, [appSettings.theme]);

	const confirmDiscardEditorChanges = useCallback(
		(action: string) => {
			if (!editorSession?.dirty) {
				return true;
			}

			if (typeof window === "undefined") {
				return false;
			}

			return window.confirm(
				`You have unsaved changes in ${editorSession.path}. Discard them and ${action}?`,
			);
		},
		[editorSession],
	);

	const handleEditorSurfaceError = useCallback(
		(description: string, title = "Editor action failed") => {
			pushWorkspaceToast(description, title);
		},
		[pushWorkspaceToast],
	);

	const handleOpenEditorFile = useCallback(
		(path: string, options?: DiffOpenOptions) => {
			if (!workspaceRootPath) {
				pushWorkspaceToast(
					"Open a workspace with a resolved root path before using the in-app editor.",
					"Editor unavailable",
				);
				return;
			}

			setInspectorCollapsed(false);

			if (editorSession?.path === path && workspaceViewMode === "editor") {
				return;
			}

			if (!confirmDiscardEditorChanges("open another file")) {
				return;
			}

			const status = options?.fileStatus ?? "M";

			// Background fetch so the next view reflects latest remote state
			if (selectedWorkspaceId) {
				triggerWorkspaceFetch(selectedWorkspaceId);
			}

			setWorkspaceViewMode("editor");
			setEditorSession({
				kind: "diff",
				path,
				inline: status !== "M",
				dirty: false,
				fileStatus: status,
				originalRef: options?.originalRef,
				modifiedRef: options?.modifiedRef,
			});
		},
		[
			confirmDiscardEditorChanges,
			editorSession?.path,
			pushWorkspaceToast,
			selectedWorkspaceId,
			workspaceViewMode,
			workspaceRootPath,
		],
	);

	const handleOpenFileReference = useCallback(
		(path: string, line?: number, column?: number) => {
			if (!workspaceRootPath) {
				pushWorkspaceToast(
					"Open a workspace with a resolved root path before using the in-app editor.",
					"Editor unavailable",
				);
				return;
			}

			if (!isPathWithinRoot(path, workspaceRootPath)) {
				pushWorkspaceToast(
					"Only files inside the current workspace can be opened in the in-app editor.",
					"File unavailable",
				);
				return;
			}

			if (
				editorSession?.path !== path &&
				!confirmDiscardEditorChanges("open another file")
			) {
				return;
			}

			if (selectedWorkspaceId) {
				triggerWorkspaceFetch(selectedWorkspaceId);
			}

			setWorkspaceViewMode("editor");
			setEditorSession((current) => ({
				kind: "file",
				path,
				line,
				column,
				dirty: current?.path === path ? current.dirty : false,
				originalText: current?.path === path ? current.originalText : undefined,
				modifiedText: current?.path === path ? current.modifiedText : undefined,
				mtimeMs: current?.path === path ? current.mtimeMs : undefined,
			}));
		},
		[
			confirmDiscardEditorChanges,
			editorSession?.path,
			pushWorkspaceToast,
			selectedWorkspaceId,
			workspaceRootPath,
		],
	);

	const handleEditorSessionChange = useCallback(
		(session: EditorSessionState) => {
			setEditorSession(session);
		},
		[],
	);

	const handleExitEditorMode = useCallback(() => {
		if (!confirmDiscardEditorChanges("return to chat")) {
			return;
		}

		setWorkspaceViewMode("conversation");
		setEditorSession(null);
	}, [confirmDiscardEditorChanges]);

	const primeWorkspaceDisplay = useCallback(
		async (workspaceId: string, preferredSessionId?: string | null) => {
			const [workspaceDetail, workspaceSessions] = await Promise.all([
				queryClient.ensureQueryData(workspaceDetailQueryOptions(workspaceId)),
				queryClient.ensureQueryData(workspaceSessionsQueryOptions(workspaceId)),
			]);

			const resolvedSessionId =
				preferredSessionId ??
				workspaceDetail?.activeSessionId ??
				workspaceSessions.find((session) => session.active)?.id ??
				workspaceSessions[0]?.id ??
				null;

			if (resolvedSessionId) {
				await queryClient.ensureQueryData(
					sessionThreadMessagesQueryOptions(resolvedSessionId),
				);
			}

			return {
				workspaceId,
				sessionId: resolvedSessionId,
			};
		},
		[queryClient],
	);

	const resolveCachedWorkspaceDisplay = useCallback(
		(workspaceId: string, preferredSessionId?: string | null) => {
			const workspaceDetail = queryClient.getQueryData<WorkspaceDetail | null>(
				pathosQueryKeys.workspaceDetail(workspaceId),
			);
			const workspaceSessions = queryClient.getQueryData<
				WorkspaceSessionSummary[] | undefined
			>(pathosQueryKeys.workspaceSessions(workspaceId));

			if (!workspaceDetail || !Array.isArray(workspaceSessions)) {
				return null;
			}

			const sessionId =
				preferredSessionId ??
				workspaceDetail.activeSessionId ??
				workspaceSessions.find((session) => session.active)?.id ??
				workspaceSessions[0]?.id ??
				null;
			const hasSessionMessages =
				sessionId === null ||
				queryClient.getQueryData([
					...pathosQueryKeys.sessionMessages(sessionId),
					"thread",
				]) !== undefined;

			if (!hasSessionMessages) {
				return null;
			}

			return {
				workspaceId,
				sessionId,
			};
		},
		[queryClient],
	);

	const resolvePreferredSessionId = useCallback(
		(workspaceId: string) => {
			const sessionHistory =
				sessionSelectionHistoryByWorkspaceRef.current[workspaceId] ?? [];
			const workspaceDetail = queryClient.getQueryData<WorkspaceDetail | null>(
				pathosQueryKeys.workspaceDetail(workspaceId),
			);
			const workspaceSessions =
				queryClient.getQueryData<WorkspaceSessionSummary[] | undefined>(
					pathosQueryKeys.workspaceSessions(workspaceId),
				) ?? [];

			const sessionIds =
				workspaceSessions.length > 0
					? new Set(workspaceSessions.map((session) => session.id))
					: null;

			if (sessionIds) {
				for (let i = sessionHistory.length - 1; i >= 0; i -= 1) {
					const sessionId = sessionHistory[i];
					if (sessionIds.has(sessionId)) {
						return sessionId;
					}
				}
			}

			if (sessionHistory.length > 0) {
				return sessionHistory[sessionHistory.length - 1] ?? null;
			}

			// Restore last session from persisted settings
			if (
				appSettings.lastSessionId &&
				(!sessionIds || sessionIds.has(appSettings.lastSessionId))
			) {
				return appSettings.lastSessionId;
			}

			return (
				workspaceDetail?.activeSessionId ??
				workspaceSessions.find((session) => session.active)?.id ??
				workspaceSessions[0]?.id ??
				null
			);
		},
		[queryClient, appSettings.lastSessionId],
	);

	const primeInitialWorkspaceDisplay = useCallback(
		async (workspaceId: string) => {
			await primeWorkspaceDisplay(workspaceId);
		},
		[primeWorkspaceDisplay],
	);

	useEffect(() => {
		if (!selectedWorkspaceId || displayedWorkspaceId !== null) {
			return;
		}

		if (startupPrefetchedWorkspaceRef.current === selectedWorkspaceId) {
			return;
		}

		startupPrefetchedWorkspaceRef.current = selectedWorkspaceId;
		void primeInitialWorkspaceDisplay(selectedWorkspaceId).catch(() => {
			// Keep the first paint path resilient even if prewarm fails.
		});
	}, [displayedWorkspaceId, primeInitialWorkspaceDisplay, selectedWorkspaceId]);

	useEffect(() => {
		const candidateWorkspaceIds = flattenWorkspaceRows(
			workspaceGroups,
			archivedRows,
		)
			.map((row) => row.id)
			.filter((workspaceId) => workspaceId !== selectedWorkspaceId)
			.slice(0, 4);

		if (candidateWorkspaceIds.length === 0) {
			return;
		}

		let cancelled = false;
		let timeoutId: number | null = null;

		const warmNext = async (index: number) => {
			if (cancelled || index >= candidateWorkspaceIds.length) {
				return;
			}

			const workspaceId = candidateWorkspaceIds[index];
			if (!workspaceId || warmedWorkspaceIdsRef.current.has(workspaceId)) {
				void warmNext(index + 1);
				return;
			}

			warmedWorkspaceIdsRef.current.add(workspaceId);
			try {
				await primeWorkspaceDisplay(workspaceId);
			} catch {
				// Best-effort background warmup only.
			}

			if (!cancelled) {
				timeoutId = window.setTimeout(() => {
					void warmNext(index + 1);
				}, 150);
			}
		};

		timeoutId = window.setTimeout(() => {
			void warmNext(0);
		}, 400);

		return () => {
			cancelled = true;
			if (timeoutId !== null) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [
		archivedRows,
		primeWorkspaceDisplay,
		selectedWorkspaceId,
		workspaceGroups,
	]);

	const handleSelectWorkspace = useCallback(
		(workspaceId: string | null, preferredSessionId?: string | null) => {
			if (workspaceId === selectedWorkspaceIdRef.current) {
				// Re-clicking the currently selected workspace: force the
				// mark-session-read effect to re-evaluate so a lingering dot
				// from a manual "mark as unread" clears, without tearing down
				// the current session view.
				if (workspaceId !== null) {
					setWorkspaceReselectTick((tick) => tick + 1);
				}
				return;
			}

			const requestId = workspaceSelectionRequestRef.current + 1;
			workspaceSelectionRequestRef.current = requestId;
			sessionSelectionRequestRef.current += 1;
			selectedWorkspaceIdRef.current = workspaceId;
			const immediateSessionId = workspaceId
				? (preferredSessionId ?? resolvePreferredSessionId(workspaceId))
				: null;
			selectedSessionIdRef.current = immediateSessionId;
			setSelectedWorkspaceId(workspaceId);
			setSelectedSessionId(immediateSessionId);

			if (workspaceId) {
				// Skip git fetch while the worktree is still being created —
				// `state === "initializing"` means Phase 2 hasn't finished
				// materializing the worktree on disk yet.
				const cachedDetail = queryClient.getQueryData<WorkspaceDetail | null>(
					pathosQueryKeys.workspaceDetail(workspaceId),
				);
				if (cachedDetail?.state !== "initializing") {
					triggerWorkspaceFetch(workspaceId);
					// Prewarm the slash-command cache for the new workspace so
					// the next `/` press hits warm data (or at least falls back
					// to the repo-level cache while this refresh completes).
					void prewarmSlashCommandsForWorkspace(workspaceId);
				}
			}

			// Session-level completed dots are cleared reactively via the
			// displayedSessionId effect — only the actually-viewed session
			// loses its dot, not every session in the workspace.
			if (workspaceId === null) {
				if (workspaceSelectionRequestRef.current !== requestId) {
					return;
				}
				setDisplayedWorkspaceId(null);
				setDisplayedSessionId(null);
				return;
			}

			startTransition(() => {
				setDisplayedWorkspaceId(workspaceId);
				setDisplayedSessionId(immediateSessionId);
			});

			const cachedWorkspaceDisplay = resolveCachedWorkspaceDisplay(
				workspaceId,
				immediateSessionId,
			);
			if (cachedWorkspaceDisplay) {
				selectedSessionIdRef.current = cachedWorkspaceDisplay.sessionId;
				rememberSessionSelection(workspaceId, cachedWorkspaceDisplay.sessionId);
				setSelectedSessionId(cachedWorkspaceDisplay.sessionId);
				if (workspaceSelectionRequestRef.current !== requestId) {
					return;
				}
				startTransition(() => {
					setDisplayedWorkspaceId(cachedWorkspaceDisplay.workspaceId);
					setDisplayedSessionId(cachedWorkspaceDisplay.sessionId);
				});
				scheduleWorkspaceDisplayPrefetch(
					queryClient,
					workspaceId,
					cachedWorkspaceDisplay.sessionId,
				);
				return;
			}

			void primeWorkspaceDisplay(workspaceId, preferredSessionId)
				.then(({ sessionId }) => {
					if (workspaceSelectionRequestRef.current !== requestId) {
						return;
					}

					selectedSessionIdRef.current = sessionId;
					rememberSessionSelection(workspaceId, sessionId);
					setSelectedSessionId(sessionId);
					startTransition(() => {
						setDisplayedWorkspaceId(workspaceId);
						setDisplayedSessionId(sessionId);
					});
				})
				.catch(() => {
					if (workspaceSelectionRequestRef.current !== requestId) {
						return;
					}

					startTransition(() => {
						setDisplayedWorkspaceId(workspaceId);
						setDisplayedSessionId(null);
					});
				});
		},
		[
			primeWorkspaceDisplay,
			queryClient,
			rememberSessionSelection,
			resolveCachedWorkspaceDisplay,
			resolvePreferredSessionId,
		],
	);

	const handleSelectChat = useCallback(
		(workspaceId: string, sessionId: string) => {
			// Record the session as the latest preferred for this workspace
			// so subsequent workspace re-selections (e.g. via the sidebar
			// keyboard nav) restore this chat instead of falling back to the
			// primary session.
			rememberSessionSelection(workspaceId, sessionId);
			if (workspaceId === selectedWorkspaceIdRef.current) {
				if (sessionId !== selectedSessionIdRef.current) {
					selectedSessionIdRef.current = sessionId;
					setSelectedSessionId(sessionId);
					startTransition(() => {
						setDisplayedSessionId(sessionId);
					});
				}
				return;
			}
			handleSelectWorkspace(workspaceId, sessionId);
		},
		[handleSelectWorkspace, rememberSessionSelection],
	);

	const handleSelectSession = useCallback(
		(sessionId: string | null) => {
			if (sessionId === selectedSessionIdRef.current) {
				return;
			}

			const requestId = sessionSelectionRequestRef.current + 1;
			sessionSelectionRequestRef.current = requestId;
			rememberSessionSelection(selectedWorkspaceIdRef.current, sessionId);
			selectedSessionIdRef.current = sessionId;
			setSelectedSessionId(sessionId);
			if (sessionId === null) {
				if (sessionSelectionRequestRef.current !== requestId) {
					return;
				}
				setDisplayedSessionId(null);
				return;
			}

			if (sessionSelectionRequestRef.current !== requestId) {
				return;
			}
			startTransition(() => {
				setDisplayedSessionId(sessionId);
			});
			scheduleInteractionBackgroundTask(() => {
				void queryClient.prefetchQuery(
					sessionThreadMessagesQueryOptions(sessionId),
				);
			});
		},
		[queryClient, rememberSessionSelection],
	);

	const {
		commitButtonMode,
		commitButtonState,
		handleInspectorCommitAction,
		handlePendingPromptConsumed,
		pendingPromptForSession,
		queuePendingPromptForSession,
	} = useWorkspaceCommitLifecycle({
		queryClient,
		selectedWorkspaceId,
		selectedWorkspaceIdRef,
		selectedRepoId: selectedWorkspaceDetailQuery.data?.repoId ?? null,
		selectedWorkspaceTargetBranch:
			selectedWorkspaceDetailQuery.data?.intendedTargetBranch ??
			selectedWorkspaceDetailQuery.data?.defaultBranch ??
			null,
		selectedWorkspaceRemote: selectedWorkspaceDetailQuery.data?.remote ?? null,
		changeRequest: workspaceChangeRequest,
		forgeDetection: workspaceForge,
		forgeActionStatus: workspaceForgeActionStatus,
		workspaceGitActionStatus,
		completedSessionIds: settledSessionIds,
		abortedSessionIds,
		interactionRequiredSessionIds,
		sendingSessionIds,
		onSelectSession: handleSelectSession,
		pushToast: pushWorkspaceToast,
	});

	const handleSessionCompleted = useCallback(
		(sessionId: string, workspaceId: string) => {
			setSettledSessionIds((prev) => {
				if (prev.has(sessionId)) return prev;
				const next = new Set(prev);
				next.add(sessionId);
				return next;
			});

			const isCurrentSession = sessionId === selectedSessionIdRef.current;
			const isFocusedCurrentSession = document.hasFocus() && isCurrentSession;
			// Bump session-level unread whenever the completion is not visible to
			// the user. Workspace.unread is derived from sessions, so this also
			// drives the sidebar workspace dot and the dock/app-switcher badge.
			if (!isFocusedCurrentSession) {
				void markSessionUnread(sessionId)
					.then(() => {
						// Same rationale as the mark-read path — defer the
						// sidebar-list flush when a mutation owns the cache.
						flushSidebarListsIfIdle(queryClient);
						return Promise.all([
							queryClient.invalidateQueries({
								queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
							}),
							queryClient.invalidateQueries({
								queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
							}),
						]);
					})
					.catch((error) => {
						console.error("[app] mark session unread on completion:", error);
					});
			}
			// OS notification: skip when user is focused on this session
			if (isFocusedCurrentSession) return;
			const name =
				queryClient.getQueryData<WorkspaceDetail | null>(
					pathosQueryKeys.workspaceDetail(workspaceId),
				)?.title ?? "Workspace";
			notify({ title: "Session completed", body: name });
		},
		[notify, queryClient],
	);

	const handleSessionAborted = useCallback((sessionId: string) => {
		setAbortedSessionIds((prev) => {
			if (prev.has(sessionId)) return prev;
			const next = new Set(prev);
			next.add(sessionId);
			return next;
		});
	}, []);

	const lastInteractionCountsRef = useRef<Map<string, number>>(new Map());
	const handleInteractionSessionsChange = useCallback(
		(nextMap: Map<string, string>, counts: Map<string, number>) => {
			// Notify for new sessions or sessions with increased interaction count
			for (const [sessionId, workspaceId] of nextMap) {
				const count = counts.get(sessionId) ?? 0;
				const prev = lastInteractionCountsRef.current.get(sessionId) ?? 0;
				if (count > prev) {
					const name =
						queryClient.getQueryData<WorkspaceDetail | null>(
							pathosQueryKeys.workspaceDetail(workspaceId),
						)?.title ?? "Workspace";
					notify({ title: "Input needed", body: name });
				}
			}
			// Track counts (only for sessions still in the map)
			const nextCounts = new Map<string, number>();
			for (const [sessionId] of nextMap) {
				nextCounts.set(sessionId, counts.get(sessionId) ?? 0);
			}
			lastInteractionCountsRef.current = nextCounts;

			setInteractionRequiredSessions((current) => {
				if (current.size === nextMap.size) {
					let unchanged = true;
					for (const [sessionId, workspaceId] of nextMap) {
						if (current.get(sessionId) !== workspaceId) {
							unchanged = false;
							break;
						}
					}
					if (unchanged) return current;
				}
				return new Map(nextMap);
			});
		},
		[notify, queryClient],
	);

	const getCloseableCurrentSession = useCallback(() => {
		if (workspaceViewModeRef.current !== "conversation") {
			return null;
		}

		const workspaceId = selectedWorkspaceIdRef.current;
		const sessionId = selectedSessionIdRef.current;
		if (!workspaceId || !sessionId) {
			return null;
		}

		const workspace = queryClient.getQueryData<WorkspaceDetail | null>(
			pathosQueryKeys.workspaceDetail(workspaceId),
		);
		const sessions =
			queryClient.getQueryData<WorkspaceSessionSummary[]>(
				pathosQueryKeys.workspaceSessions(workspaceId),
			) ?? [];
		if (!workspace || !sessions.some((session) => session.id === sessionId)) {
			return null;
		}

		return {
			workspaceId,
			sessionId,
			workspace,
			sessions,
			session: sessions.find((candidate) => candidate.id === sessionId) ?? null,
		};
	}, [queryClient]);

	// Stack of recently hidden sessions for "Reopen closed session". LIFO so
	// repeated invocations walk back through history. Empty (deleted) sessions
	// are not tracked because the backend can't restore them.
	const recentlyClosedSessionsRef = useRef<
		{ sessionId: string; workspaceId: string }[]
	>([]);
	const handleSessionHidden = useCallback(
		(sessionId: string, workspaceId: string) => {
			recentlyClosedSessionsRef.current = [
				{ sessionId, workspaceId },
				...recentlyClosedSessionsRef.current.filter(
					(entry) => entry.sessionId !== sessionId,
				),
			].slice(0, 20);
		},
		[],
	);

	const { requestClose: requestCloseSession, dialogNode: closeConfirmDialog } =
		useConfirmSessionClose({
			sendingSessionIds,
			onSelectSession: handleSelectSession,
			onSessionHidden: handleSessionHidden,
			pushToast: pushWorkspaceToast,
			queryClient,
		});

	const handleReopenClosedSession = useCallback(async () => {
		const next = recentlyClosedSessionsRef.current[0];
		if (!next) return;
		recentlyClosedSessionsRef.current =
			recentlyClosedSessionsRef.current.slice(1);
		try {
			await unhideSession(next.sessionId);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceDetail(next.workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceSessions(next.workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceGroups,
				}),
			]);
			handleSelectWorkspace(next.workspaceId);
			handleSelectSession(next.sessionId);
		} catch (error) {
			pushWorkspaceToast(
				error instanceof Error ? error.message : String(error),
				"Unable to reopen session",
				"destructive",
			);
		}
	}, [
		handleSelectSession,
		handleSelectWorkspace,
		pushWorkspaceToast,
		queryClient,
	]);

	const handleCloseSelectedSession = useCallback(async () => {
		const currentSession = getCloseableCurrentSession();
		if (!currentSession?.session) {
			return;
		}

		const { workspaceId, sessionId, workspace, sessions, session } =
			currentSession;

		await requestCloseSession({
			workspace,
			sessions,
			session,
			activateAdjacent: true,
			onSessionsChanged: () => {
				void Promise.all([
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
					}),
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
					}),
					queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceGroups,
					}),
					queryClient.invalidateQueries({
						queryKey: [...pathosQueryKeys.sessionMessages(sessionId), "thread"],
					}),
				]);
			},
		});
	}, [getCloseableCurrentSession, queryClient, requestCloseSession]);

	const handleCreateSession = useCallback(async () => {
		const workspaceId = selectedWorkspaceIdRef.current;
		if (!workspaceId) {
			return;
		}

		try {
			const { sessionId } = await createSession(workspaceId);
			const cachedWorkspace =
				queryClient.getQueryData<WorkspaceDetail | null>(
					pathosQueryKeys.workspaceDetail(workspaceId),
				) ?? null;
			seedNewSessionInCache({
				queryClient,
				workspaceId,
				sessionId,
				workspace: cachedWorkspace,
				existingSessions:
					queryClient.getQueryData<WorkspaceSessionSummary[]>(
						pathosQueryKeys.workspaceSessions(workspaceId),
					) ?? [],
			});
			handleSelectSession(sessionId);

			void Promise.all([
				...(cachedWorkspace
					? [
							queryClient.invalidateQueries({
								queryKey: pathosQueryKeys.repoScripts(
									cachedWorkspace.repoId,
									workspaceId,
								),
							}),
						]
					: []),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
				}),
				queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceGroups,
				}),
			]);
		} catch (error) {
			pushWorkspaceToast(
				error instanceof Error ? error.message : String(error),
				"Unable to create session",
			);
		}
	}, [handleSelectSession, pushWorkspaceToast, queryClient]);

	const handleNavigateSessions = useCallback(
		(offset: -1 | 1) => {
			const workspaceId = selectedWorkspaceIdRef.current;
			if (!workspaceId) {
				return;
			}

			const workspaceSessions =
				queryClient.getQueryData<WorkspaceSessionSummary[]>(
					pathosQueryKeys.workspaceSessions(workspaceId),
				) ?? [];
			const nextSessionId = findAdjacentSessionId(
				workspaceSessions,
				selectedSessionIdRef.current,
				offset,
			);

			if (!nextSessionId) {
				return;
			}

			handleSelectSession(nextSessionId);
		},
		[handleSelectSession, queryClient],
	);

	const handleNavigateWorkspaces = useCallback(
		(offset: -1 | 1) => {
			const nextWorkspaceId = findAdjacentWorkspaceId(
				workspaceGroups,
				archivedRows,
				selectedWorkspaceIdRef.current,
				offset,
			);

			if (!nextWorkspaceId) {
				return;
			}

			handleSelectWorkspace(nextWorkspaceId);
		},
		[archivedRows, handleSelectWorkspace, workspaceGroups],
	);

	const globalShortcutHandlers = useMemo<ShortcutHandler[]>(
		() => [
			{
				id: "commandBar.open" as const,
				callback: () => setCommandBarOpen((open) => !open),
			},
			{
				id: "settings.open" as const,
				callback: handleOpenSettings,
			},
			{
				id: "workspace.copyPath" as const,
				callback: handleCopyWorkspacePath,
				enabled: Boolean(workspaceRootPath),
			},
			{
				id: "workspace.openInEditor" as const,
				callback: handleOpenPreferredEditor,
				enabled: Boolean(selectedWorkspaceId && preferredEditor),
			},
			{
				id: "workspace.addRepository" as const,
				callback: () =>
					window.dispatchEvent(new Event("pathos:open-add-repository")),
			},
			{
				id: "workspace.previous" as const,
				callback: () => handleNavigateWorkspaces(-1),
			},
			{
				id: "workspace.next" as const,
				callback: () => handleNavigateWorkspaces(1),
			},
			{
				id: "session.previous" as const,
				callback: () => handleNavigateSessions(-1),
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "session.next" as const,
				callback: () => handleNavigateSessions(1),
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "session.close" as const,
				callback: () => {
					if (!getCloseableCurrentSession()) return;
					void handleCloseSelectedSession();
				},
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "session.new" as const,
				callback: (): void => void handleCreateSession(),
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "session.reopenClosed" as const,
				callback: () => void handleReopenClosedSession(),
			},
			{
				id: "script.run" as const,
				callback: () => window.dispatchEvent(new Event("pathos:run-script")),
			},
			{
				id: "theme.toggle" as const,
				callback: handleToggleTheme,
			},
			{
				id: "sidebar.left.toggle" as const,
				callback: () => setSidebarCollapsed((collapsed) => !collapsed),
			},
			{
				id: "sidebar.right.toggle" as const,
				callback: handleToggleInspectorSidebar,
			},
			{
				id: "zen.toggle" as const,
				callback: handleToggleZenMode,
			},
			{
				id: "action.createPr" as const,
				callback: () => void handleInspectorCommitAction("create-pr"),
			},
			{
				id: "action.commitAndPush" as const,
				callback: () => void handleInspectorCommitAction("commit-and-push"),
			},
			{
				id: "action.pullLatest" as const,
				callback: () => void handlePullLatest(),
				enabled: Boolean(selectedWorkspaceId),
			},
			{
				id: "action.mergePr" as const,
				callback: () => void handleInspectorCommitAction("merge"),
			},
			{
				id: "action.fixErrors" as const,
				callback: () => void handleInspectorCommitAction("fix"),
			},
			{
				id: "action.openPullRequest" as const,
				callback: handleOpenPullRequest,
				enabled: Boolean(pullRequestUrl),
			},
			{
				id: "composer.focus" as const,
				callback: () =>
					window.dispatchEvent(new Event("pathos:focus-composer")),
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "composer.openModelPicker" as const,
				callback: handleOpenModelPicker,
				enabled: workspaceViewMode === "conversation",
			},
			{
				id: "zoom.in" as const,
				callback: () =>
					updateSettings({
						zoomLevel: clampZoom(appSettings.zoomLevel + ZOOM_STEP),
					}),
			},
			{
				id: "zoom.out" as const,
				callback: () =>
					updateSettings({
						zoomLevel: clampZoom(appSettings.zoomLevel - ZOOM_STEP),
					}),
			},
			{
				id: "zoom.reset" as const,
				callback: () => updateSettings({ zoomLevel: 1.0 }),
			},
			...(
				[
					"space.switch.1",
					"space.switch.2",
					"space.switch.3",
					"space.switch.4",
					"space.switch.5",
					"space.switch.6",
					"space.switch.7",
					"space.switch.8",
					"space.switch.9",
				] as const
			).map(
				(id, i): ShortcutHandler => ({
					id,
					callback: () => requestSwitchSpace(i + 1),
				}),
			),
		],
		[
			appSettings.zoomLevel,
			getCloseableCurrentSession,
			handleCloseSelectedSession,
			handleCopyWorkspacePath,
			handleCreateSession,
			handleInspectorCommitAction,
			handleNavigateSessions,
			handleNavigateWorkspaces,
			handleOpenModelPicker,
			handleOpenPreferredEditor,
			handleOpenPullRequest,
			handleOpenSettings,
			handlePullLatest,
			handleReopenClosedSession,
			handleToggleTheme,
			handleToggleZenMode,
			handleToggleInspectorSidebar,
			preferredEditor,
			pullRequestUrl,
			selectedWorkspaceId,
			setCommandBarOpen,
			setSidebarCollapsed,
			updateSettings,
			workspaceRootPath,
			workspaceViewMode,
		],
	);
	useAppShortcuts({
		overrides: appSettings.shortcuts,
		handlers: globalShortcutHandlers,
	});

	const handleResolveDisplayedSession = useCallback(
		(sessionId: string | null) => {
			rememberSessionSelection(selectedWorkspaceIdRef.current, sessionId);
			selectedSessionIdRef.current = sessionId;
			setSelectedSessionId((current) =>
				current === sessionId ? current : sessionId,
			);
			setDisplayedSessionId((current) =>
				current === sessionId ? current : sessionId,
			);
		},
		[rememberSessionSelection],
	);

	const processPendingCliSends = useCallback(async () => {
		try {
			const sends = await drainPendingCliSends();
			if (sends.length === 0) return;

			const first = sends[0];

			await queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.workspaceGroups,
			});
			if (first.workspaceId) {
				await queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceSessions(first.workspaceId),
				});
			}

			handleSelectWorkspace(first.workspaceId);

			setTimeout(() => {
				queuePendingPromptForSession({
					sessionId: first.sessionId,
					prompt: first.prompt,
					modelId: first.modelId,
					permissionMode: first.permissionMode,
				});
				handleSelectSession(first.sessionId);
			}, 100);
		} catch (error) {
			console.error("[pendingCliSend] drain failed:", error);
		}
	}, [
		handleSelectSession,
		handleSelectWorkspace,
		queryClient,
		queuePendingPromptForSession,
	]);

	useUiSyncBridge({
		queryClient,
		processPendingCliSends,
		openChat: (workspaceId, sessionId) => {
			handleSelectChat(workspaceId, sessionId);
		},
		reloadSettings: () => {
			window.dispatchEvent(new Event(SETTINGS_RELOAD_EVENT));
		},
		refreshGithubIdentity: async () => {
			await queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.githubIdentity,
			});
			await queryClient.prefetchQuery(githubIdentityQueryOptions());
		},
	});

	// ── Pending CLI sends: on window focus, drain queued prompts ────────
	// When `pathos send` detects the App is running it writes the prompt
	// into `pending_cli_sends` instead of starting its own sidecar. On
	// the next focus event we pick those up and replay them through the
	// normal streaming path (setPendingPromptForSession → auto-submit).
	useEffect(() => {
		let unlisten: (() => void) | undefined;

		void import("@tauri-apps/api/event").then(({ listen }) => {
			void listen("tauri://focus", async () => {
				// Smart fetch: refresh target branch for the active workspace
				// so file tree diffs stay current after the user returns.
				const wsId = selectedWorkspaceIdRef.current;
				if (wsId) {
					triggerWorkspaceFetch(wsId);
				}

				await processPendingCliSends();
			}).then((fn) => {
				unlisten = fn;
			});
		});

		return () => {
			unlisten?.();
		};
	}, [processPendingCliSends]);

	// Close-confirmation is handled by <QuitConfirmDialog /> which registers
	// its own onCloseRequested listener.  No need for a separate hook here.

	useEffect(() => {
		if (workspaceViewMode === "editor") {
			return;
		}

		let disposed = false;
		let unlisten: (() => void) | undefined;

		void listen("pathos://close-current-session", () => {
			if (!getCloseableCurrentSession()) {
				return;
			}

			void handleCloseSelectedSession();
		}).then((fn) => {
			if (disposed) {
				fn();
				return;
			}
			unlisten = fn;
		});

		return () => {
			disposed = true;
			unlisten?.();
		};
	}, [
		getCloseableCurrentSession,
		handleCloseSelectedSession,
		workspaceViewMode,
	]);

	const handleInsertIntoComposer = useCallback(
		(request: ComposerInsertRequest) => {
			const resolvedTarget = resolveComposerInsertTarget(request.target, {
				selectedWorkspaceId,
				displayedWorkspaceId,
				displayedSessionId,
			});
			const targetWorkspaceId = resolvedTarget.workspaceId;
			if (!targetWorkspaceId) {
				pushWorkspaceToast(
					"Open a workspace before inserting content into the composer.",
					"Can't insert content",
				);
				return;
			}

			const items = request.items.filter((item) => {
				if (item.kind === "text") return item.text.length > 0;
				if (item.kind === "custom-tag") {
					return (
						item.label.trim().length > 0 && item.submitText.trim().length > 0
					);
				}
				return item.path.length > 0;
			});
			if (items.length === 0) return;

			setPendingComposerInserts((current) => [
				...current,
				{
					id: crypto.randomUUID(),
					workspaceId: targetWorkspaceId,
					sessionId: resolvedTarget.sessionId ?? null,
					items,
					behavior: request.behavior ?? "append",
					createdAt: Date.now(),
				},
			]);
		},
		[
			displayedSessionId,
			displayedWorkspaceId,
			pushWorkspaceToast,
			selectedWorkspaceId,
		],
	);

	const handlePendingComposerInsertsConsumed = useCallback((ids: string[]) => {
		if (ids.length === 0) return;
		const consumed = new Set(ids);
		setPendingComposerInserts((current) =>
			current.filter((r) => !consumed.has(r.id)),
		);
	}, []);

	return (
		<TooltipProvider delayDuration={0}>
			<WorkspaceToastProvider value={pushWorkspaceToast}>
				<SendingSessionsProvider value={sendingSessionIds}>
					<ComposerInsertProvider value={handleInsertIntoComposer}>
						<main
							aria-label="Application shell"
							className="relative h-screen overflow-hidden bg-transparent font-sans text-foreground antialiased"
						>
							<div
								ref={shellPanelsRef}
								className="relative flex h-full min-h-0 bg-transparent"
								style={shellPanelsStyle}
							>
								{workspaceViewMode === "conversation" && (
									<>
										{!sidebarCollapsed && (
											<aside
												aria-label="Workspace sidebar"
												data-pathos-sidebar-root
												className="relative flex h-full shrink-0 flex-col overflow-hidden bg-transparent"
												style={{ width: "var(--pathos-sidebar-width)" }}
											>
												<div className="min-h-0 flex-1">
													<WorkspacesSidebarContainer
														selectedWorkspaceId={selectedWorkspaceId}
														selectedSessionId={selectedSessionId}
														interactionRequiredSessionIds={
															interactionRequiredSessionIds
														}
														addRepositoryShortcut={addRepositoryShortcut}
														newChatShortcut={newChatShortcut}
														deleteChatShortcut={deleteChatShortcut}
														onSelectWorkspace={handleSelectWorkspace}
														onSelectChat={handleSelectChat}
														footerControls={
															<SettingsButton
																onClick={handleOpenSettings}
																shortcut={getShortcut(
																	appSettings.shortcuts,
																	"settings.open",
																)}
															/>
														}
														pushWorkspaceToast={pushWorkspaceToast}
													/>
												</div>
												<div className="absolute right-[12px] top-[6px] z-20 flex items-center gap-[2px]">
													<AppUpdateButton status={appUpdateStatus} />
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																aria-label="Collapse left sidebar"
																onClick={() => setSidebarCollapsed(true)}
																variant="ghost"
																size="icon-xs"
																className="text-muted-foreground hover:text-foreground"
															>
																<PanelLeftIcon
																	className="size-4"
																	strokeWidth={1.6}
																/>
															</Button>
														</TooltipTrigger>
														<TooltipContent
															side="bottom"
															className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
														>
															<span>Collapse left sidebar</span>
															{leftSidebarToggleShortcut ? (
																<InlineShortcutDisplay
																	hotkey={leftSidebarToggleShortcut}
																	className="text-tooltip-foreground/55"
																/>
															) : null}
														</TooltipContent>
													</Tooltip>
												</div>
											</aside>
										)}

										{!sidebarCollapsed && (
											<div
												role="separator"
												tabIndex={0}
												aria-label="Resize sidebar"
												aria-orientation="vertical"
												aria-valuemin={MIN_SIDEBAR_WIDTH}
												aria-valuemax={MAX_SIDEBAR_WIDTH}
												aria-valuenow={sidebarWidth}
												onMouseDown={handleResizeStart("sidebar")}
												onKeyDown={handleResizeKeyDown("sidebar")}
												className="group absolute inset-y-0 z-30 cursor-ew-resize touch-none outline-none"
												style={{
													left: `calc(var(--pathos-sidebar-width) - ${SIDEBAR_RESIZE_HIT_AREA / 2}px)`,
													width: `${SIDEBAR_RESIZE_HIT_AREA}px`,
												}}
											>
												<span
													aria-hidden="true"
													className={`pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 transition-[width,background-color,box-shadow] ${
														isSidebarResizing
															? "w-[2px] bg-foreground/80 shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:shadow-[0_0_12px_rgba(255,255,255,0.16)]"
															: "w-px bg-border group-hover:w-[2px] group-hover:bg-muted-foreground/75 group-focus-visible:w-[2px] group-focus-visible:bg-muted-foreground/75"
													}`}
												/>
											</div>
										)}
									</>
								)}

								<section
									aria-label="Workspace panel"
									className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-chat-surface"
								>
									{workspaceViewMode === "conversation" && (
										<div
											aria-label="Workspace panel drag region"
											className="absolute inset-x-0 top-0 z-10 h-9 bg-transparent"
											data-tauri-drag-region
										/>
									)}

									<div
										aria-label="Workspace viewport"
										className="flex min-h-0 flex-1 flex-col bg-chat-surface"
									>
										{workspaceViewMode === "editor" && editorSession && (
											<WorkspaceEditorSurface
												editorSession={editorSession}
												workspaceRootPath={workspaceRootPath}
												onChangeSession={handleEditorSessionChange}
												onExit={handleExitEditorMode}
												onError={handleEditorSurfaceError}
											/>
										)}
										<div
											className={
												workspaceViewMode === "editor"
													? "hidden"
													: "flex min-h-0 flex-1 flex-col"
											}
										>
											<Suspense
												fallback={
													<div className="min-h-0 flex-1 bg-chat-surface" />
												}
											>
												<WorkspaceConversationContainer
													isShellResizing={
														isSidebarResizing || isInspectorResizing
													}
													selectedWorkspaceId={selectedWorkspaceId}
													displayedWorkspaceId={displayedWorkspaceId}
													selectedSessionId={selectedSessionId}
													displayedSessionId={displayedSessionId}
													repoId={
														selectedWorkspaceDetailQuery.data?.repoId ?? null
													}
													sessionSelectionHistory={
														selectedWorkspaceId
															? (sessionSelectionHistoryByWorkspaceRef.current[
																	selectedWorkspaceId
																] ?? [])
															: []
													}
													onSelectSession={handleSelectSession}
													onResolveDisplayedSession={
														handleResolveDisplayedSession
													}
													onSendingWorkspacesChange={setSendingWorkspaceIds}
													onSendingSessionsChange={setSendingSessionIds}
													onInteractionSessionsChange={
														handleInteractionSessionsChange
													}
													interactionRequiredSessionIds={
														interactionRequiredSessionIds
													}
													onSessionCompleted={handleSessionCompleted}
													workspaceChangeRequest={workspaceChangeRequest}
													onSessionAborted={handleSessionAborted}
													pendingPromptForSession={pendingPromptForSession}
													onPendingPromptConsumed={handlePendingPromptConsumed}
													pendingInsertRequests={pendingComposerInserts}
													onPendingInsertRequestsConsumed={
														handlePendingComposerInsertsConsumed
													}
													onQueuePendingPromptForSession={
														queuePendingPromptForSession
													}
													onRequestCloseSession={requestCloseSession}
													workspaceRootPath={workspaceRootPath}
													onOpenFileReference={handleOpenFileReference}
													headerLeading={
														sidebarCollapsed ? (
															<>
																{/* Spacer to avoid macOS traffic lights */}
																<div className="w-[52px] shrink-0" />
																<div className="flex items-center gap-[2px]">
																	<AppUpdateButton status={appUpdateStatus} />
																	<Tooltip>
																		<TooltipTrigger asChild>
																			<Button
																				aria-label="Expand left sidebar"
																				onClick={() =>
																					setSidebarCollapsed(false)
																				}
																				variant="ghost"
																				size="icon-xs"
																				className="text-muted-foreground hover:text-foreground"
																			>
																				<PanelLeftIcon
																					className="size-4"
																					strokeWidth={1.6}
																				/>
																			</Button>
																		</TooltipTrigger>
																		<TooltipContent
																			side="bottom"
																			className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
																		>
																			<span>Expand left sidebar</span>
																			{leftSidebarToggleShortcut ? (
																				<InlineShortcutDisplay
																					hotkey={leftSidebarToggleShortcut}
																					className="text-tooltip-foreground/55"
																				/>
																			) : null}
																		</TooltipContent>
																	</Tooltip>
																</div>
															</>
														) : undefined
													}
													headerActions={
														selectedWorkspaceId && displayedSessionId ? (
															<div className="flex items-center gap-1">
																{installedEditors.length > 0 &&
																preferredEditor ? (
																	<div className="flex items-center">
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<Button
																					variant="ghost"
																					size="xs"
																					aria-label={`Open in ${preferredEditor.name}`}
																					onClick={handleOpenPreferredEditor}
																					className="text-muted-foreground hover:text-foreground"
																				>
																					<EditorIcon
																						editorId={preferredEditor.id}
																						className="size-3.5"
																					/>
																					<span>{preferredEditor.name}</span>
																				</Button>
																			</TooltipTrigger>
																			<TooltipContent
																				side="bottom"
																				sideOffset={4}
																				className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
																			>
																				<span>{`Open in ${preferredEditor.name}`}</span>
																				{openPreferredEditorShortcut ? (
																					<InlineShortcutDisplay
																						hotkey={openPreferredEditorShortcut}
																						className="text-tooltip-foreground/55"
																					/>
																				) : null}
																			</TooltipContent>
																		</Tooltip>
																		<DropdownMenu>
																			<DropdownMenuTrigger asChild>
																				<Button
																					variant="ghost"
																					size="icon-xs"
																					className="w-4 text-muted-foreground hover:text-foreground"
																				>
																					<ChevronDown
																						className="size-2.5"
																						strokeWidth={2}
																					/>
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent
																				side="bottom"
																				align="end"
																				sideOffset={4}
																				className="min-w-[11rem]"
																			>
																				<DropdownMenuItem
																					onClick={() => {
																						void openWorkspaceInFinder(
																							selectedWorkspaceId,
																						).catch((e) =>
																							pushWorkspaceToast(
																								String(e),
																								"Failed to open Finder",
																							),
																						);
																					}}
																					className="flex items-center gap-2"
																				>
																					<FolderOpen
																						className="shrink-0"
																						strokeWidth={1.8}
																					/>
																					<span className="flex-1">Finder</span>
																				</DropdownMenuItem>
																				{installedEditors.map((editor) => (
																					<DropdownMenuItem
																						key={editor.id}
																						onClick={() => {
																							setPreferredEditorId(editor.id);
																							localStorage.setItem(
																								PREFERRED_EDITOR_STORAGE_KEY,
																								editor.id,
																							);
																							void openWorkspaceInEditor(
																								selectedWorkspaceId,
																								editor.id,
																							).catch((e) =>
																								pushWorkspaceToast(
																									String(e),
																									`Failed to open ${editor.name}`,
																								),
																							);
																						}}
																						className="flex items-center gap-2"
																					>
																						<EditorIcon
																							editorId={editor.id}
																							className="shrink-0"
																						/>
																						<span className="flex-1">
																							{editor.name}
																						</span>
																						{editor.id ===
																							preferredEditor.id && (
																							<Check className="ml-auto text-muted-foreground" />
																						)}
																					</DropdownMenuItem>
																				))}
																			</DropdownMenuContent>
																		</DropdownMenu>
																	</div>
																) : null}
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button
																			aria-label={
																				inspectorCollapsed
																					? "Expand right sidebar"
																					: "Collapse right sidebar"
																			}
																			onClick={handleToggleInspectorSidebar}
																			variant="ghost"
																			size="sm"
																			className="h-7 border-transparent bg-transparent px-1.5 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
																		>
																			<span className="inline-flex h-5 items-center gap-1.5 rounded-full px-1.5">
																				<DiffStatsBadge
																					insertions={
																						workspaceDiffStats.insertions
																					}
																					deletions={
																						workspaceDiffStats.deletions
																					}
																				/>
																				{hasWorkspaceDiffStats ? (
																					<span
																						aria-hidden="true"
																						className="size-1 rounded-full bg-muted-foreground/45"
																					/>
																				) : null}
																				<PanelRightIcon
																					className="size-4 shrink-0"
																					strokeWidth={1.6}
																				/>
																			</span>
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent
																		side="bottom"
																		className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
																	>
																		<span>
																			{inspectorCollapsed
																				? "Expand right sidebar"
																				: "Collapse right sidebar"}
																		</span>
																		{rightSidebarToggleShortcut ? (
																			<InlineShortcutDisplay
																				hotkey={rightSidebarToggleShortcut}
																				className="text-tooltip-foreground/55"
																			/>
																		) : null}
																	</TooltipContent>
																</Tooltip>
															</div>
														) : undefined
													}
												/>
											</Suspense>
										</div>
									</div>
								</section>

								{!inspectorCollapsed && displayedSessionId && (
									<>
										<div
											role="separator"
											tabIndex={0}
											aria-label="Resize inspector sidebar"
											aria-orientation="vertical"
											aria-valuemin={MIN_SIDEBAR_WIDTH}
											aria-valuemax={MAX_SIDEBAR_WIDTH}
											aria-valuenow={inspectorWidth}
											onMouseDown={handleResizeStart("inspector")}
											onKeyDown={handleResizeKeyDown("inspector")}
											className="group absolute inset-y-0 z-30 cursor-ew-resize touch-none outline-none"
											style={{
												right: `max(0px, calc(var(--pathos-inspector-width) - ${SIDEBAR_RESIZE_HIT_AREA}px))`,
												width: `${SIDEBAR_RESIZE_HIT_AREA}px`,
											}}
										>
											<span
												aria-hidden="true"
												className={`pointer-events-none absolute inset-y-0 left-0 transition-[width,background-color,box-shadow] ${
													isInspectorResizing
														? "w-[2px] bg-foreground/80 shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:shadow-[0_0_12px_rgba(255,255,255,0.16)]"
														: "w-px bg-border group-hover:w-[2px] group-hover:bg-muted-foreground/75 group-focus-visible:w-[2px] group-focus-visible:bg-muted-foreground/75"
												}`}
											/>
										</div>

										<aside
											aria-label="Inspector sidebar"
											className="relative h-full shrink-0 overflow-hidden bg-sidebar has-[[data-tabs-zoomed=true]]:overflow-visible"
											style={{ width: "var(--pathos-inspector-width)" }}
										>
											{inspectorSidebarMounted ? (
												<WorkspaceInspectorSidebar
													workspaceId={selectedWorkspaceId}
													workspaceRootPath={workspaceRootPath}
													workspaceState={
														selectedWorkspaceDetailQuery.data?.state ?? null
													}
													repoId={
														selectedWorkspaceDetailQuery.data?.repoId ?? null
													}
													workspaceBranch={
														selectedWorkspaceDetailQuery.data?.branch ?? null
													}
													workspaceDefaultBranch={
														selectedWorkspaceDetailQuery.data?.defaultBranch ??
														null
													}
													workspaceRemote={
														selectedWorkspaceDetailQuery.data?.remote ?? null
													}
													workspaceTargetBranch={(() => {
														const d = selectedWorkspaceDetailQuery.data;
														const target =
															d?.intendedTargetBranch ?? d?.defaultBranch;
														if (!target) return null;
														const remote = d?.remote ?? "origin";
														return `${remote}/${target}`;
													})()}
													editorMode={workspaceViewMode === "editor"}
													activeEditorPath={editorSession?.path ?? null}
													onOpenEditorFile={handleOpenEditorFile}
													onCommitAction={handleInspectorCommitAction}
													currentSessionId={displayedSessionId}
													onQueuePendingPromptForSession={
														queuePendingPromptForSession
													}
													commitButtonMode={commitButtonMode}
													commitButtonState={commitButtonState}
													changeRequest={workspaceChangeRequest}
													forgeActionStatus={workspaceForgeActionStatus}
													forgeDetection={workspaceForge}
													workspaceGitActionStatus={workspaceGitActionStatus}
													forgeIsRefreshing={workspaceForgeIsRefreshing}
													onOpenSettings={handleOpenSettings}
												/>
											) : (
												<InspectorSidebarMountPlaceholder />
											)}
										</aside>
									</>
								)}
							</div>
							<CommandBar
								open={commandBarOpen}
								onOpenChange={setCommandBarOpen}
								repositoryFolders={repositoryFoldersQuery.data ?? []}
								currentWorkspaceId={selectedWorkspaceId}
								currentSessionId={selectedSessionId}
								currentWorkspaceSessions={
									selectedWorkspaceSessionsQuery.data ?? []
								}
								canCreateSession={
									workspaceViewMode === "conversation" &&
									Boolean(selectedWorkspaceId)
								}
								canOpenWorkspace={Boolean(
									selectedWorkspaceId && preferredEditor,
								)}
								onSelectWorkspace={handleSelectWorkspace}
								onSelectChat={handleSelectChat}
								onSelectSession={handleSelectSession}
								onCreateSession={() => {
									void handleCreateSession();
								}}
								onOpenSettings={handleOpenSettings}
								onToggleLeftSidebar={() =>
									setSidebarCollapsed((collapsed) => !collapsed)
								}
								onToggleRightSidebar={() => handleToggleInspectorSidebar()}
								onFocusComposer={() =>
									window.dispatchEvent(new Event("pathos:focus-composer"))
								}
								onOpenWorkspaceInEditor={handleOpenPreferredEditor}
								shortcuts={{
									openCommandBar: commandBarShortcut,
									openProject: addRepositoryShortcut,
									newSession: getShortcut(appSettings.shortcuts, "session.new"),
									settings: getShortcut(appSettings.shortcuts, "settings.open"),
									focusComposer: getShortcut(
										appSettings.shortcuts,
										"composer.focus",
									),
									openWorkspaceInEditor: openPreferredEditorShortcut,
									toggleLeftSidebar: leftSidebarToggleShortcut,
									toggleRightSidebar: rightSidebarToggleShortcut,
								}}
							/>
						</main>
						<Toaster
							theme={resolveTheme(appSettings.theme)}
							position="bottom-right"
							visibleToasts={6}
						/>
						{closeConfirmDialog}
					</ComposerInsertProvider>
				</SendingSessionsProvider>
			</WorkspaceToastProvider>
			<QuitConfirmDialog sendingSessionIds={sendingSessionIds} />
		</TooltipProvider>
	);
}

function InspectorSidebarMountPlaceholder() {
	return (
		<div
			aria-hidden="true"
			className="flex h-full min-h-0 flex-col gap-2 bg-sidebar px-3 py-2"
		>
			<div className="h-7 rounded-md border border-border/60 bg-muted/35" />
			<div className="h-7 rounded-md border border-border/60 bg-muted/25" />
			<div className="min-h-0 flex-1 rounded-md border border-border/60 bg-muted/15" />
		</div>
	);
}

function scheduleInteractionBackgroundTask(callback: () => void) {
	const timeoutId = window.setTimeout(() => {
		callback();
	}, 80);
	return () => window.clearTimeout(timeoutId);
}

function scheduleWorkspaceDisplayPrefetch(
	queryClient: QueryClient,
	workspaceId: string,
	sessionId: string | null,
) {
	scheduleInteractionBackgroundTask(() => {
		void queryClient.prefetchQuery(workspaceDetailQueryOptions(workspaceId));
		void queryClient.prefetchQuery(workspaceSessionsQueryOptions(workspaceId));
		if (sessionId) {
			void queryClient.prefetchQuery(
				sessionThreadMessagesQueryOptions(sessionId),
			);
		}
	});
}
export default App;
