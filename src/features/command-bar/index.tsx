import {
	CornerDownLeft,
	ExternalLink,
	FolderOpen,
	GitBranch,
	Globe,
	MessageSquare,
	PanelLeft,
	PanelRight,
	Plus,
	Search,
	Settings,
	SquarePen,
} from "lucide-react";
import { useMemo } from "react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import type { RepositoryFolder, WorkspaceSessionSummary } from "@/lib/api";
import {
	requestCloneProject,
	requestOpenProject,
} from "@/lib/project-action-events";
import { buildNavigationItems, sessionDetail } from "./navigation-items";
import { MutedItem, PaletteItem } from "./palette-item";

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
	onOpenSettings: (section?: "shortcuts") => void;
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
	const navigationItems = useMemo(
		() => buildNavigationItems(repositoryFolders),
		[repositoryFolders],
	);
	const currentWorkspace = navigationItems.find(
		(item) => item.workspaceId === currentWorkspaceId,
	);
	const visibleSessions = currentWorkspaceSessions.filter(
		(session) => !session.isHidden,
	);
	const run = (action: () => void) => {
		onOpenChange(false);
		action();
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Command bar"
			description="Open projects, clone repositories, and navigate Pathos."
			className="top-1/2 w-[min(660px,calc(100vw-3rem))] max-w-none -translate-y-1/2 overflow-hidden rounded-2xl! border border-border/80 bg-popover/98 shadow-2xl shadow-black/30 backdrop-blur-xl sm:max-w-none"
		>
			<Command shouldFilter loop className="rounded-none! bg-transparent p-0">
				<div className="flex items-center border-b border-border/65 bg-background/40 px-4 py-3">
					<CommandInput
						autoFocus
						placeholder="Search for projects and commands..."
						wrapperClassName="min-w-0 flex-1 p-0"
						inputGroupClassName="h-9! border-transparent bg-transparent shadow-none! *:data-[slot=input-group-addon]:pl-2!"
						className="h-9 text-[17px] font-medium placeholder:text-muted-foreground/85"
					/>
				</div>
				<CommandList className="max-h-[min(26rem,58vh)] px-3 py-2.5">
					<CommandEmpty>
						<div className="flex flex-col items-center gap-2 py-7 text-muted-foreground">
							<Search className="size-5" strokeWidth={1.7} />
							<span>No matching commands</span>
						</div>
					</CommandEmpty>

					<CommandGroup
						heading="Projects"
						className="py-1.5 **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:tracking-normal **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-0.5"
					>
						<PaletteItem
							value="open project local folder add repository"
							icon={FolderOpen}
							title="Open project"
							detail="Add a local folder"
							shortcut={shortcuts.openProject}
							onSelect={() => run(requestOpenProject)}
						/>
						<PaletteItem
							value="clone project repository url git"
							icon={Globe}
							title="Clone repository"
							detail="Clone from a Git URL"
							onSelect={() => run(requestCloneProject)}
						/>
					</CommandGroup>

					<CommandSeparator className="my-1" />

					<CommandGroup
						heading="Navigation"
						className="py-1.5 **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:tracking-normal **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-0.5"
					>
						{navigationItems.map((item) => (
							<PaletteItem
								key={item.id}
								value={item.value}
								icon={GitBranch}
								title={item.title}
								detail={item.detail}
								active={
									item.workspaceId === currentWorkspaceId &&
									(!item.sessionId || item.sessionId === currentSessionId)
								}
								disabled={!item.workspaceId}
								onSelect={() =>
									run(() => {
										if (!item.workspaceId) return;
										if (item.sessionId) {
											onSelectChat(item.workspaceId, item.sessionId);
											return;
										}
										onSelectWorkspace(item.workspaceId);
									})
								}
							/>
						))}
						{navigationItems.length === 0 ? (
							<MutedItem text="No projects yet" />
						) : null}
					</CommandGroup>

					{currentWorkspace ? (
						<CommandGroup
							heading={`${currentWorkspace.title} Sessions`}
							className="py-1.5 **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:tracking-normal **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-0.5"
						>
							{canCreateSession ? (
								<PaletteItem
									value="new session chat"
									icon={Plus}
									title="New session"
									detail="Start another chat in this project"
									shortcut={shortcuts.newSession}
									onSelect={() => run(onCreateSession)}
								/>
							) : null}
							{visibleSessions.slice(0, 8).map((session) => (
								<PaletteItem
									key={session.id}
									value={`session chat ${session.title} ${session.model ?? ""} ${session.status}`}
									icon={MessageSquare}
									title={session.title || "Untitled session"}
									detail={sessionDetail(session)}
									active={session.id === currentSessionId}
									onSelect={() => run(() => onSelectSession(session.id))}
								/>
							))}
							{visibleSessions.length === 0 ? (
								<MutedItem text="No sessions in this project" />
							) : null}
						</CommandGroup>
					) : null}

					<CommandSeparator className="my-1" />

					<CommandGroup
						heading="Actions"
						className="py-1.5 **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:tracking-normal **:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:gap-0.5"
					>
						<PaletteItem
							value="focus chat input composer prompt"
							icon={SquarePen}
							title="Focus chat input"
							detail="Jump back to the composer"
							shortcut={shortcuts.focusComposer}
							onSelect={() => run(onFocusComposer)}
						/>
						<PaletteItem
							value="open workspace editor default app"
							icon={ExternalLink}
							title="Open project in default app"
							detail="Use your preferred editor"
							shortcut={shortcuts.openWorkspaceInEditor}
							disabled={!canOpenWorkspace}
							onSelect={() => run(onOpenWorkspaceInEditor)}
						/>
						<PaletteItem
							value="toggle left sidebar"
							icon={PanelLeft}
							title="Toggle left sidebar"
							shortcut={shortcuts.toggleLeftSidebar}
							onSelect={() => run(onToggleLeftSidebar)}
						/>
						<PaletteItem
							value="toggle right inspector sidebar"
							icon={PanelRight}
							title="Toggle right sidebar"
							shortcut={shortcuts.toggleRightSidebar}
							onSelect={() => run(onToggleRightSidebar)}
						/>
						<PaletteItem
							value="settings shortcuts customize keyboard command bar"
							icon={Settings}
							title="Customize shortcuts"
							detail="Change command bar and navigation keys"
							shortcut={shortcuts.openCommandBar}
							onSelect={() => run(() => onOpenSettings("shortcuts"))}
						/>
						<PaletteItem
							value="open settings preferences"
							icon={Settings}
							title="Open settings"
							shortcut={shortcuts.settings}
							onSelect={() => run(() => onOpenSettings())}
						/>
					</CommandGroup>
				</CommandList>
				<div className="flex min-h-10 items-center justify-end gap-4 border-t border-border/65 bg-background/45 px-4 text-[12px] font-semibold text-muted-foreground">
					<span className="flex items-center gap-2 text-foreground">
						Open
						<CornerDownLeft className="size-4 text-muted-foreground" />
					</span>
					<span className="h-4 w-px bg-border" />
					{shortcuts.openCommandBar ? (
						<span className="hidden shrink-0 items-center gap-2 sm:flex">
							<span>Actions</span>
							<InlineShortcutDisplay hotkey={shortcuts.openCommandBar} />
						</span>
					) : null}
				</div>
			</Command>
		</CommandDialog>
	);
}
