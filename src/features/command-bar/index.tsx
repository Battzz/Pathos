import type { LucideIcon } from "lucide-react";
import {
	Beaker,
	CircleUser,
	CornerDownLeft,
	Cpu,
	Download,
	ExternalLink,
	FolderOpen,
	GitBranch,
	GitMerge,
	Globe,
	ImportIcon,
	Keyboard,
	MessageSquare,
	PaintBucket,
	PanelLeft,
	PanelRight,
	Plus,
	Search,
	Settings,
	SquarePen,
	Wrench,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandList,
} from "@/components/ui/command";
import type { RepositoryFolder, WorkspaceSessionSummary } from "@/lib/api";
import {
	requestCloneProject,
	requestOpenProject,
} from "@/lib/project-action-events";
import { buildNavigationItems, buildRecentChatItems } from "./navigation-items";
import { PaletteItem, PaletteShortcut, type Segment } from "./palette-item";

type CommandBarProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	repositoryFolders: RepositoryFolder[];
	currentWorkspaceId: string | null;
	currentSessionId: string | null;
	currentWorkspaceSessions: WorkspaceSessionSummary[];
	canCreateSession: boolean;
	canOpenWorkspace: boolean;
	onSelectWorkspace: (workspaceId: string) => void;
	onSelectChat: (workspaceId: string, sessionId: string) => void;
	onSelectSession: (sessionId: string) => void;
	onCreateSession: () => void;
	onOpenSettings: (section?: string) => void;
	onToggleLeftSidebar: () => void;
	onToggleRightSidebar: () => void;
	onFocusComposer: () => void;
	onOpenWorkspaceInEditor: () => void;
	shortcuts: {
		openCommandBar: string | null;
		openProject: string | null;
		newSession: string | null;
		settings: string | null;
		focusComposer: string | null;
		openWorkspaceInEditor: string | null;
		toggleLeftSidebar: string | null;
		toggleRightSidebar: string | null;
	};
};

const SETTINGS_SECTIONS: ReadonlyArray<{
	key: string;
	label: string;
	icon: LucideIcon;
	keywords?: string;
}> = [
	{
		key: "general",
		label: "General",
		icon: Settings,
		keywords: "notifications usage stats confirm",
	},
	{
		key: "appearance",
		label: "Appearance",
		icon: PaintBucket,
		keywords: "theme font dark light",
	},
	{
		key: "model",
		label: "Models",
		icon: Cpu,
		keywords: "default model commit provider api keys",
	},
	{
		key: "shortcuts",
		label: "Shortcuts",
		icon: Keyboard,
		keywords: "keyboard hotkeys bindings",
	},
	{ key: "git", label: "Git", icon: GitMerge, keywords: "branch prefix vcs" },
	{
		key: "experimental",
		label: "Experimental",
		icon: Beaker,
		keywords: "cli install lab features",
	},
	{
		key: "import",
		label: "Import",
		icon: ImportIcon,
		keywords: "conductor migrate",
	},
	{
		key: "developer",
		label: "Developer",
		icon: Wrench,
		keywords: "dev tools internal",
	},
	{
		key: "account",
		label: "Account",
		icon: CircleUser,
		keywords: "github auth login workspace",
	},
];

type Entry = {
	id: string;
	value: string;
	icon: LucideIcon;
	segments: Segment[];
	shortcut?: string | null;
	trailing?: React.ReactNode;
	active?: boolean;
	disabled?: boolean;
	onSelect: () => void;
};

export function CommandBar({
	open,
	onOpenChange,
	repositoryFolders,
	currentWorkspaceId,
	currentSessionId,
	currentWorkspaceSessions,
	canCreateSession,
	canOpenWorkspace,
	onSelectWorkspace,
	onSelectChat,
	onSelectSession,
	onCreateSession,
	onOpenSettings,
	onToggleLeftSidebar,
	onToggleRightSidebar,
	onFocusComposer,
	onOpenWorkspaceInEditor,
	shortcuts,
}: CommandBarProps) {
	const [search, setSearch] = useState("");
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) setSearch("");
	}, [open]);

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list || !open) return;
		list.scrollTop = 0;
		const frame = window.requestAnimationFrame(() => {
			list.scrollTop = 0;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [open, search]);

	const navigationItems = useMemo(
		() => buildNavigationItems(repositoryFolders),
		[repositoryFolders],
	);
	const recentChatItems = useMemo(
		() => buildRecentChatItems(repositoryFolders),
		[repositoryFolders],
	);
	const currentWorkspace = navigationItems.find(
		(item) => item.workspaceId === currentWorkspaceId,
	);
	const visibleSessions = currentWorkspaceSessions.filter((s) => !s.isHidden);

	const run = (action: () => void) => {
		onOpenChange(false);
		action();
	};

	const entries = useMemo<Entry[]>(() => {
		const out: Entry[] = [];

		// 1. Quick actions — always near the top so they're discoverable.
		out.push({
			id: "action-focus-composer",
			value: "action focus chat input composer prompt",
			icon: SquarePen,
			segments: [
				{ label: "Action", primary: true },
				{ label: "Focus chat input" },
			],
			shortcut: shortcuts.focusComposer,
			onSelect: () => run(onFocusComposer),
		});
		out.push({
			id: "action-toggle-left",
			value: "action toggle left sidebar navigation",
			icon: PanelLeft,
			segments: [
				{ label: "Action", primary: true },
				{ label: "Toggle left sidebar" },
			],
			shortcut: shortcuts.toggleLeftSidebar,
			onSelect: () => run(onToggleLeftSidebar),
		});
		out.push({
			id: "action-toggle-right",
			value: "action toggle right sidebar inspector",
			icon: PanelRight,
			segments: [
				{ label: "Action", primary: true },
				{ label: "Toggle right sidebar" },
			],
			shortcut: shortcuts.toggleRightSidebar,
			onSelect: () => run(onToggleRightSidebar),
		});
		out.push({
			id: "action-open-editor",
			value: "action open project editor default app",
			icon: ExternalLink,
			segments: [
				{ label: "Action", primary: true },
				{ label: "Open project in default editor" },
			],
			shortcut: shortcuts.openWorkspaceInEditor,
			disabled: !canOpenWorkspace,
			onSelect: () => run(onOpenWorkspaceInEditor),
		});

		// 2. Project actions
		out.push({
			id: "project-open",
			value: "project open local folder add",
			icon: FolderOpen,
			segments: [
				{ label: "Project", primary: true },
				{ label: "Open local folder" },
			],
			shortcut: shortcuts.openProject,
			onSelect: () => run(requestOpenProject),
		});
		out.push({
			id: "project-clone",
			value: "project clone repository git url",
			icon: Globe,
			segments: [
				{ label: "Project", primary: true },
				{ label: "Clone repository" },
			],
			onSelect: () => run(requestCloneProject),
		});
		if (canCreateSession) {
			out.push({
				id: "project-new-session",
				value: "project new session chat",
				icon: Plus,
				segments: [
					{ label: "Project", primary: true },
					{ label: currentWorkspace?.title ?? "Current" },
					{ label: "New session" },
				],
				shortcut: shortcuts.newSession,
				onSelect: () => run(onCreateSession),
			});
		}

		// 3. Sessions in the current project
		for (const session of visibleSessions) {
			out.push({
				id: `current-session-${session.id}`,
				value: `chat session current ${session.title} ${session.model ?? ""} ${session.status} ${currentWorkspace?.title ?? ""}`,
				icon: MessageSquare,
				segments: [
					{ label: "Chat", primary: true },
					...(currentWorkspace ? [{ label: currentWorkspace.title }] : []),
					{ label: session.title || "Untitled session" },
				],
				active: session.id === currentSessionId,
				trailing: (
					<span>
						{formatRelativeTime(session.lastUserMessageAt ?? session.updatedAt)}
					</span>
				),
				onSelect: () => run(() => onSelectSession(session.id)),
			});
		}

		// 4. Recent chats across all projects
		for (const item of recentChatItems) {
			// Skip duplicates already shown under "current project sessions"
			if (
				item.workspaceId === currentWorkspaceId &&
				visibleSessions.some((s) => s.id === item.sessionId)
			) {
				continue;
			}
			out.push({
				id: `recent-${item.id}`,
				value: item.value,
				icon: MessageSquare,
				segments: [
					{ label: "Chat", primary: true },
					{ label: item.detail },
					{ label: item.title },
				],
				active: item.sessionId === currentSessionId,
				trailing: <span>{formatRelativeTime(item.timestamp)}</span>,
				onSelect: () =>
					run(() => onSelectChat(item.workspaceId, item.sessionId)),
			});
		}

		// 5. All projects (workspaces) — for jumping
		for (const item of navigationItems) {
			if (!item.workspaceId || item.sessionId) continue;
			out.push({
				id: `project-jump-${item.id}`,
				value: `project workspace ${item.value}`,
				icon: GitBranch,
				segments: [{ label: "Project", primary: true }, { label: item.title }],
				active: item.workspaceId === currentWorkspaceId && !currentSessionId,
				trailing: item.detail ? <span>{item.detail}</span> : undefined,
				onSelect: () => {
					if (!item.workspaceId) return;
					run(() => onSelectWorkspace(item.workspaceId as string));
				},
			});
		}

		// 6. Pathos CLI install — surfaces a buried Experimental panel action
		out.push({
			id: "cli-install",
			value: "install pathos cli command line shell terminal experimental",
			icon: Download,
			segments: [{ label: "Pathos", primary: true }, { label: "Install CLI" }],
			onSelect: () => run(() => onOpenSettings("experimental")),
		});

		// 7. Settings — root + every section
		out.push({
			id: "settings-root",
			value: "settings preferences open",
			icon: Settings,
			segments: [{ label: "Settings", primary: true }],
			shortcut: shortcuts.settings,
			onSelect: () => run(() => onOpenSettings()),
		});
		for (const section of SETTINGS_SECTIONS) {
			out.push({
				id: `settings-${section.key}`,
				value: `settings ${section.key} ${section.label} ${section.keywords ?? ""}`,
				icon: section.icon,
				segments: [
					{ label: "Settings", primary: true },
					{ label: section.label },
				],
				onSelect: () => run(() => onOpenSettings(section.key)),
			});
		}

		return out;
	}, [
		canCreateSession,
		canOpenWorkspace,
		currentSessionId,
		currentWorkspace,
		currentWorkspaceId,
		navigationItems,
		onCreateSession,
		onFocusComposer,
		onOpenSettings,
		onOpenWorkspaceInEditor,
		onSelectChat,
		onSelectSession,
		onSelectWorkspace,
		onToggleLeftSidebar,
		onToggleRightSidebar,
		recentChatItems,
		shortcuts,
		visibleSessions,
	]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Command bar"
			description="Run commands, jump to chats, and open projects."
			className="top-[14%] w-[min(720px,calc(100vw-2rem))] max-w-none translate-y-0 overflow-hidden rounded-xl! border border-border/70 bg-popover/95 shadow-[0_28px_70px_-14px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:max-w-none"
		>
			<Command shouldFilter loop className="rounded-none! bg-transparent p-0">
				<div className="px-3 pt-3 pb-2">
					<CommandInput
						autoFocus
						value={search}
						onValueChange={setSearch}
						placeholder="Search commands, chats, projects..."
						wrapperClassName="min-w-0 flex-1 p-0"
						inputGroupClassName="h-11! rounded-lg! border-border/45 bg-background/45 shadow-none! ring-0! *:data-[slot=input-group-addon]:pl-3!"
						className="h-11 text-[15px] font-medium placeholder:text-muted-foreground/50"
					/>
				</div>
				<CommandList
					ref={listRef}
					className="min-h-[20rem] max-h-[min(30rem,60vh)] scroll-py-2 px-2 pb-2 pt-1"
				>
					<CommandEmpty>
						<div className="flex flex-col items-center gap-2.5 py-12 text-muted-foreground/60">
							<Search className="size-4 opacity-70" strokeWidth={1.5} />
							<span className="text-[12px] font-medium tracking-[-0.005em]">
								No matching commands
							</span>
						</div>
					</CommandEmpty>
					<CommandGroup className="p-0 **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-px">
						{entries.map((entry) => (
							<PaletteItem
								key={entry.id}
								value={entry.value}
								icon={entry.icon}
								segments={entry.segments}
								shortcut={entry.shortcut}
								active={entry.active}
								disabled={entry.disabled}
								trailing={entry.trailing}
								onSelect={entry.onSelect}
							/>
						))}
					</CommandGroup>
				</CommandList>
				<div className="flex min-h-9 items-center justify-end border-t border-border/40 bg-background/30 px-3 py-1.5">
					<div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground/75">
						<FooterHint label="Execute">
							<KbdGlyph>
								<CornerDownLeft className="size-2.5" strokeWidth={2.25} />
							</KbdGlyph>
						</FooterHint>
						<FooterHint label="Close">
							<KbdGlyph>esc</KbdGlyph>
						</FooterHint>
						{shortcuts.openCommandBar ? (
							<>
								<span className="hidden h-3 w-px bg-border/50 sm:block" />
								<span className="hidden items-center sm:flex">
									<PaletteShortcut hotkey={shortcuts.openCommandBar} />
								</span>
							</>
						) : null}
					</div>
				</div>
			</Command>
		</CommandDialog>
	);
}

function FooterHint({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<span className="flex items-center gap-1.5">
			{children}
			<span className="tracking-tight">{label}</span>
		</span>
	);
}

function KbdGlyph({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border/55 bg-background/65 px-1 font-mono text-[10.5px] font-medium text-foreground/80">
			{children}
		</kbd>
	);
}

function formatRelativeTime(timestamp: string | null) {
	if (!timestamp) return "";
	const value = Date.parse(timestamp);
	if (Number.isNaN(value)) return "";
	const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
	if (diffSeconds < 60) return "now";
	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays}d`;
	const diffWeeks = Math.floor(diffDays / 7);
	if (diffWeeks < 5) return `${diffWeeks}w`;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(new Date(value));
}
