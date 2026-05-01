import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
	ChevronDown,
	Code2,
	DownloadCloud,
	FlaskConical,
	GitBranch,
	Keyboard,
	Minus,
	Monitor,
	Moon,
	Palette,
	Plus,
	Settings,
	SlidersHorizontal,
	Sparkles,
	Sun,
	UserRound,
	Volume2,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { ModelIcon } from "@/components/model-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcut } from "@/features/shortcuts/registry";
import { ShortcutsSettingsPanel } from "@/features/shortcuts/settings-panel";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import {
	isConductorAvailable,
	loadGithubIdentitySession,
	playNotificationSound,
	type RepositoryCreateOption,
} from "@/lib/api";
import {
	agentModelSectionsQueryOptions,
	pathosQueryKeys,
	repositoriesQueryOptions,
} from "@/lib/query-client";
import {
	NOTIFICATION_SOUNDS,
	type NotificationSound,
	type ThemeMode,
	useSettings,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { clampEffort, findModelOption } from "@/lib/workspace-helpers";
import { SettingsGroup, SettingsRow } from "./components/settings-row";
import { AccountPanel } from "./panels/account";
import { CliInstallPanel } from "./panels/cli-install";
import { ConductorImportPanel } from "./panels/conductor-import";
import { DevToolsPanel } from "./panels/dev-tools";
import { ClaudeCustomProvidersPanel } from "./panels/model-providers";
import { RepositorySettingsPanel } from "./panels/repository-settings";

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const FALLBACK_EFFORT_LEVELS = ["low", "medium", "high"];
const MODEL_SETTINGS_PICKER_CLASS =
	"inline-flex h-7 cursor-pointer items-center rounded-md border border-border/50 bg-muted/30 px-2.5 text-[12px] leading-none text-foreground hover:bg-muted/50";
const NOTIFICATION_SOUND_OPTIONS: Array<{
	value: NotificationSound;
	label: string;
}> = [
	...NOTIFICATION_SOUNDS.map((sound) => ({ value: sound, label: sound })),
	{ value: "none", label: "None" },
];

export type SettingsSection =
	| "general"
	| "shortcuts"
	| "appearance"
	| "model"
	| "git"
	| "experimental"
	| "import"
	| "developer"
	| "account"
	| `repo:${string}`;

export function isSettingsSection(value: unknown): value is SettingsSection {
	if (typeof value !== "string") return false;
	if (value.startsWith("repo:")) return value.length > "repo:".length;
	return (
		value === "general" ||
		value === "shortcuts" ||
		value === "appearance" ||
		value === "model" ||
		value === "git" ||
		value === "experimental" ||
		value === "import" ||
		value === "developer" ||
		value === "account"
	);
}

type SectionMeta = {
	label: string;
	icon: LucideIcon;
	eyebrow: string;
	blurb: string;
};

const FIXED_SECTION_META: Record<
	Exclude<SettingsSection, `repo:${string}`>,
	SectionMeta
> = {
	general: {
		label: "General",
		icon: SlidersHorizontal,
		eyebrow: "Preferences",
		blurb: "Notifications, follow-ups, and other day-to-day defaults.",
	},
	appearance: {
		label: "Appearance",
		icon: Palette,
		eyebrow: "Preferences",
		blurb: "Theme and typography for the chat surface.",
	},
	model: {
		label: "Model",
		icon: Sparkles,
		eyebrow: "Preferences",
		blurb: "Default agent, effort, and commit-action model.",
	},
	shortcuts: {
		label: "Shortcuts",
		icon: Keyboard,
		eyebrow: "Preferences",
		blurb: "Keyboard bindings for the things you do most.",
	},
	git: {
		label: "Git",
		icon: GitBranch,
		eyebrow: "Workspace",
		blurb: "Branch prefix and global Git defaults.",
	},
	experimental: {
		label: "Experimental",
		icon: FlaskConical,
		eyebrow: "Lab",
		blurb: "Opt-in features that aren't quite finished.",
	},
	import: {
		label: "Import",
		icon: DownloadCloud,
		eyebrow: "Tools",
		blurb: "Bring projects in from other agents.",
	},
	developer: {
		label: "Developer",
		icon: Code2,
		eyebrow: "Internal",
		blurb: "Diagnostics for the people building Pathos.",
	},
	account: {
		label: "Account",
		icon: UserRound,
		eyebrow: "You",
		blurb: "Sign-in and identity across forges.",
	},
};

function getSectionMeta(
	section: SettingsSection,
	repos: RepositoryCreateOption[],
): SectionMeta {
	if (section.startsWith("repo:")) {
		const repoId = section.slice(5);
		const repo = repos.find((r) => r.id === repoId);
		return {
			label: repo?.name ?? "Repository",
			icon: GitBranch,
			eyebrow: "Repository",
			blurb: "Per-repository origin, branching, and setup scripts.",
		};
	}
	return FIXED_SECTION_META[section as keyof typeof FIXED_SECTION_META];
}

export const SettingsDialog = memo(function SettingsDialog({
	open,
	workspaceId,
	workspaceRepoId,
	initialSection,
	onClose,
}: {
	open: boolean;
	workspaceId: string | null;
	workspaceRepoId: string | null;
	initialSection?: SettingsSection;
	onClose: () => void;
}) {
	const { settings, updateSettings } = useSettings();
	const queryClient = useQueryClient();
	const [activeSection, setActiveSection] =
		useState<SettingsSection>("general");
	const notificationSoundLabel =
		NOTIFICATION_SOUND_OPTIONS.find(
			(option) => option.value === settings.notificationSound,
		)?.label ?? "Ping";
	const canTestNotificationSound =
		settings.notifications && settings.notificationSound !== "none";
	const [githubLogin, setGithubLogin] = useState<string | null>(null);
	const [conductorEnabled, setConductorEnabled] = useState(false);

	useEffect(() => {
		if (open) {
			setActiveSection(initialSection ?? "general");
		}
	}, [open, initialSection]);

	const reposQuery = useQuery({
		...repositoriesQueryOptions(),
		enabled: open,
	});
	const repositories = reposQuery.data ?? [];
	const modelSectionsQuery = useQuery({
		...agentModelSectionsQueryOptions(),
		enabled: open,
	});
	const allModels = (modelSectionsQuery.data ?? []).flatMap((s) => s.options);
	const selectedDefaultModel = findModelOption(
		modelSectionsQuery.data ?? [],
		settings.defaultModelId,
	);
	const selectedCommitActionModel = findModelOption(
		modelSectionsQuery.data ?? [],
		settings.commitActionModelId,
	);
	const defaultEffortLevels =
		selectedDefaultModel?.effortLevels ?? FALLBACK_EFFORT_LEVELS;
	const defaultModelProvider = selectedDefaultModel?.provider ?? "claude";
	const selectedDefaultEffort =
		settings.defaultEffortsByProvider[defaultModelProvider] ??
		settings.defaultEffort ??
		"high";
	const defaultModelSupportsFastMode =
		selectedDefaultModel?.supportsFastMode === true;
	const defaultModelLabel =
		selectedDefaultModel?.label ??
		(modelSectionsQuery.isPending ? "Loading…" : "Select model");
	const commitActionModelLabel =
		selectedCommitActionModel?.label ??
		settings.commitActionModelId ??
		(modelSectionsQuery.isPending ? "Loading…" : "Select model");
	// Auto-clamp effort when model changes — but only after model metadata
	// has actually loaded, otherwise the fallback levels silently kill max/xhigh.
	useEffect(() => {
		if (!selectedDefaultModel) return;
		const current = selectedDefaultEffort;
		if (
			defaultEffortLevels.length > 0 &&
			!defaultEffortLevels.includes(current)
		) {
			const nextEffort = clampEffort(current, defaultEffortLevels);
			updateSettings({
				defaultEffort: nextEffort,
				defaultEffortsByProvider: {
					...settings.defaultEffortsByProvider,
					[defaultModelProvider]: nextEffort,
				},
			});
		}
	}, [
		selectedDefaultModel,
		selectedDefaultEffort,
		settings.defaultEffortsByProvider,
		defaultModelProvider,
		defaultEffortLevels,
		updateSettings,
	]);

	useEffect(() => {
		if (open) {
			void loadGithubIdentitySession().then((snapshot) => {
				if (snapshot.status === "connected") {
					setGithubLogin(snapshot.session.login);
				}
			});
			void isConductorAvailable().then(setConductorEnabled);
		}
	}, [open]);

	const isDev = import.meta.env.DEV;

	const fixedSections: SettingsSection[] = [
		"general",
		"appearance",
		"model",
		"shortcuts",
		"git",
		"experimental",
		...(conductorEnabled ? (["import"] as const) : []),
		...(isDev ? (["developer"] as const) : []),
		"account",
	];

	const activeRepoId = activeSection.startsWith("repo:")
		? activeSection.slice(5)
		: null;
	const activeRepo = activeRepoId
		? repositories.find((r) => r.id === activeRepoId)
		: null;
	const activeMeta = getSectionMeta(activeSection, repositories);

	return (
		<TooltipProvider delayDuration={0}>
			<Dialog open={open} onOpenChange={onClose}>
				<DialogContent
					aria-describedby={undefined}
					className="settings-dialog-shell h-[min(82vh,680px)] w-[min(86vw,940px)] max-w-[940px] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-[0_30px_120px_-30px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)_inset] sm:max-w-[940px]"
				>
					<div className="relative h-full w-full overflow-hidden">
						{/* Subtle noise + accent gradient atmosphere */}
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 z-0 opacity-[0.035] mix-blend-overlay"
							style={{
								backgroundImage:
									"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
								backgroundSize: "220px 220px",
							}}
						/>
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 z-0 opacity-60"
							style={{
								background:
									"radial-gradient(ellipse 70% 50% at 0% 0%, color-mix(in oklch, var(--editorial-accent) 6%, transparent), transparent 55%)",
							}}
						/>
						<SidebarProvider className="relative z-10 flex h-full min-h-0 w-full min-w-0 gap-0 overflow-hidden">
							{/* Nav sidebar */}
							<nav className="scrollbar-stable flex w-[224px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-sidebar-border/70 bg-sidebar/60 backdrop-blur-sm">
								<div className="flex items-center gap-2 px-5 pt-6 pb-4">
									<span
										aria-hidden
										className="size-1.5 rounded-full bg-foreground/70"
									/>
									<span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80 uppercase">
										Settings
									</span>
								</div>
								<SidebarGroup className="px-2.5">
									<div className="px-2 pt-1 pb-1.5 font-mono text-[9.5px] tracking-[0.22em] text-muted-foreground/55 uppercase">
										Workspace
									</div>
									<SidebarGroupContent>
										<SidebarMenu className="gap-0.5">
											{fixedSections.map((section) => {
												const meta =
													FIXED_SECTION_META[
														section as keyof typeof FIXED_SECTION_META
													];
												const Icon = meta.icon;
												const isActive = activeSection === section;
												return (
													<SidebarMenuItem key={section}>
														<SidebarMenuButton
															isActive={isActive}
															onClick={() => setActiveSection(section)}
															className="relative h-8 gap-2.5 pr-2 pl-3 text-[13px] font-normal data-[active=true]:bg-sidebar-accent/70 data-[active=true]:font-medium"
														>
															<Icon
																className={cn(
																	"size-3.5 shrink-0",
																	isActive
																		? "text-foreground"
																		: "text-muted-foreground/70",
																)}
																strokeWidth={1.6}
															/>
															<span className="truncate">{meta.label}</span>
														</SidebarMenuButton>
													</SidebarMenuItem>
												);
											})}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>

								{repositories.length > 0 && (
									<>
										<SidebarSeparator className="mx-5 my-2 bg-sidebar-border/60" />
										<SidebarGroup className="px-2.5">
											<SidebarGroupLabel className="px-2 font-mono text-[9.5px] tracking-[0.22em] text-muted-foreground/55 uppercase">
												Repositories
											</SidebarGroupLabel>
											<SidebarGroupContent>
												<SidebarMenu className="gap-0.5">
													{repositories.map((repo) => {
														const key: SettingsSection = `repo:${repo.id}`;
														const isActive = activeSection === key;
														return (
															<SidebarMenuItem key={key}>
																<SidebarMenuButton
																	isActive={isActive}
																	onClick={() => setActiveSection(key)}
																	className="relative h-8 gap-2.5 pr-2 pl-3 text-[13px] font-normal data-[active=true]:bg-sidebar-accent/70 data-[active=true]:font-medium"
																>
																	{repo.repoIconSrc ? (
																		<img
																			src={repo.repoIconSrc}
																			alt=""
																			className="size-4 shrink-0 rounded-[3px] ring-1 ring-border/40"
																		/>
																	) : (
																		<span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-muted/80 font-mono text-[8px] font-semibold uppercase text-muted-foreground ring-1 ring-border/40">
																			{repo.repoInitials?.slice(0, 2)}
																		</span>
																	)}
																	<span className="truncate">{repo.name}</span>
																</SidebarMenuButton>
															</SidebarMenuItem>
														);
													})}
												</SidebarMenu>
											</SidebarGroupContent>
										</SidebarGroup>
									</>
								)}

								<div className="mt-auto px-5 pt-4 pb-5">
									<div className="font-mono text-[9.5px] leading-snug tracking-[0.18em] text-muted-foreground/40 uppercase">
										Pathos · Local-first
									</div>
								</div>
							</nav>

							{/* Main content */}
							<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
								<DialogTitle className="sr-only">
									{activeRepo ? activeRepo.name : activeMeta.label}
								</DialogTitle>

								{/* Content area */}
								<div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-9 pt-7 pb-8">
									{activeSection === "general" && (
										<SettingsGroup>
											<SettingsRow
												title="Desktop Notifications"
												description="Show system notifications when sessions complete or need input"
											>
												<Switch
													checked={settings.notifications}
													onCheckedChange={(checked) =>
														updateSettings({ notifications: checked })
													}
												/>
											</SettingsRow>
											<SettingsRow
												title="Notification Sound"
												description="Choose the sound used for desktop notifications."
											>
												<div className="flex items-center gap-2">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="outline"
																size="sm"
																className="h-7 min-w-28 justify-between gap-2 px-2.5 text-[12px]"
																disabled={!settings.notifications}
															>
																{notificationSoundLabel}
																<ChevronDown className="size-3.5 opacity-60" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															{NOTIFICATION_SOUND_OPTIONS.map((option) => (
																<DropdownMenuItem
																	key={option.value}
																	onClick={() =>
																		updateSettings({
																			notificationSound: option.value,
																		})
																	}
																>
																	{option.label}
																</DropdownMenuItem>
															))}
														</DropdownMenuContent>
													</DropdownMenu>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																type="button"
																variant="outline"
																size="icon"
																className="size-7"
																disabled={!canTestNotificationSound}
																onClick={() => {
																	void playNotificationSound(
																		settings.notificationSound,
																	).catch((error) => {
																		console.warn(
																			"[settings] notification sound preview failed:",
																			error,
																		);
																	});
																}}
															>
																<Volume2 className="size-3.5" />
																<span className="sr-only">
																	Test notification sound
																</span>
															</Button>
														</TooltipTrigger>
														<TooltipContent>Test sound</TooltipContent>
													</Tooltip>
												</div>
											</SettingsRow>
											<SettingsRow
												title="Always show context usage"
												description="By default, context usage is only shown when more than 70% is used."
											>
												<Switch
													checked={settings.alwaysShowContextUsage}
													onCheckedChange={(checked) =>
														updateSettings({ alwaysShowContextUsage: checked })
													}
												/>
											</SettingsRow>
											<SettingsRow
												title="Usage Stats"
												description="Show account rate limits beside the composer."
											>
												<Switch
													checked={settings.showUsageStats}
													onCheckedChange={(checked) =>
														updateSettings({ showUsageStats: checked })
													}
												/>
											</SettingsRow>
											<SettingsRow
												title="Confirm sidebar removals"
												description="Ask before removing a project, all project chats, or an individual chat from the sidebar."
											>
												<Switch
													checked={settings.confirmDestructiveSidebarActions}
													onCheckedChange={(checked) =>
														updateSettings({
															confirmDestructiveSidebarActions: checked,
														})
													}
												/>
											</SettingsRow>
											<SettingsRow
												title="Follow-up behavior"
												description={
													<>
														Queue follow-ups while the agent runs or steer the
														current run.
														{(() => {
															const toggleHotkey = getShortcut(
																settings.shortcuts,
																"composer.toggleFollowUpBehavior",
															);
															if (!toggleHotkey) return null;
															return (
																<>
																	{" "}
																	Press{" "}
																	<InlineShortcutDisplay
																		hotkey={toggleHotkey}
																		className="align-baseline text-muted-foreground"
																	/>{" "}
																	to do the opposite for one message.
																</>
															);
														})()}
													</>
												}
											>
												<ToggleGroup
													type="single"
													value={settings.followUpBehavior}
													onValueChange={(value) => {
														if (value === "queue" || value === "steer") {
															updateSettings({ followUpBehavior: value });
														}
													}}
													className="gap-1 bg-muted/40"
												>
													<ToggleGroupItem
														value="queue"
														aria-label="Queue"
														className="h-7 rounded-md px-2.5 text-[12px] font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
													>
														Queue
													</ToggleGroupItem>
													<ToggleGroupItem
														value="steer"
														aria-label="Steer"
														className="h-7 rounded-md px-2.5 text-[12px] font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
													>
														Steer
													</ToggleGroupItem>
												</ToggleGroup>
											</SettingsRow>
										</SettingsGroup>
									)}

									{activeSection === "shortcuts" && (
										<ShortcutsSettingsPanel
											overrides={settings.shortcuts}
											onChange={(shortcuts) => updateSettings({ shortcuts })}
										/>
									)}

									{activeSection === "appearance" && (
										<SettingsGroup>
											<SettingsRow
												title="Theme"
												description="Switch between light and dark appearance"
											>
												<ToggleGroup
													type="single"
													value={settings.theme}
													className="gap-1.5"
													onValueChange={(value: string) => {
														if (value) {
															updateSettings({ theme: value as ThemeMode });
														}
													}}
												>
													{(
														[
															{
																value: "system",
																icon: Monitor,
																label: "System",
															},
															{ value: "light", icon: Sun, label: "Light" },
															{ value: "dark", icon: Moon, label: "Dark" },
														] as const
													).map(({ value, icon: Icon, label }) => (
														<ToggleGroupItem
															key={value}
															value={value}
															className="gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
														>
															<Icon className="size-3.5" strokeWidth={1.8} />
															{label}
														</ToggleGroupItem>
													))}
												</ToggleGroup>
											</SettingsRow>
											<SettingsRow
												title="Font Size"
												description="Adjust the text size for chat messages"
											>
												<div className="flex items-center gap-3">
													<Button
														variant="outline"
														size="icon-sm"
														onClick={() =>
															updateSettings({
																fontSize: Math.max(
																	MIN_FONT_SIZE,
																	settings.fontSize - 1,
																),
															})
														}
														disabled={settings.fontSize <= MIN_FONT_SIZE}
													>
														<Minus className="size-3.5" strokeWidth={2} />
													</Button>
													<span className="w-12 text-center text-[14px] font-semibold tabular-nums text-foreground">
														{settings.fontSize}px
													</span>
													<Button
														variant="outline"
														size="icon-sm"
														onClick={() =>
															updateSettings({
																fontSize: Math.min(
																	MAX_FONT_SIZE,
																	settings.fontSize + 1,
																),
															})
														}
														disabled={settings.fontSize >= MAX_FONT_SIZE}
													>
														<Plus className="size-3.5" strokeWidth={2} />
													</Button>
												</div>
											</SettingsRow>
										</SettingsGroup>
									)}

									{activeSection === "model" && (
										<SettingsGroup>
											<SettingsRow
												title="Default model"
												description="Model for new chats"
											>
												<div className="flex items-center justify-end gap-1.5">
													<DropdownMenu>
														<DropdownMenuTrigger
															className={cn(
																MODEL_SETTINGS_PICKER_CLASS,
																"w-[10.5rem] min-w-0 justify-between gap-1.5",
															)}
														>
															<span className="flex min-w-0 items-center gap-1.5 leading-none">
																<ModelIcon
																	model={selectedDefaultModel}
																	className="size-3.5 shrink-0"
																/>
																<span className="min-w-0 truncate whitespace-nowrap leading-none">
																	{defaultModelLabel}
																</span>
															</span>
															<ChevronDown className="size-3 shrink-0 opacity-40" />
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="end"
															sideOffset={4}
															className="min-w-[10rem]"
														>
															{allModels.map((m) => (
																<DropdownMenuItem
																	key={m.id}
																	onClick={() =>
																		updateSettings({ defaultModelId: m.id })
																	}
																	className="gap-2"
																>
																	<ModelIcon model={m} className="size-4" />
																	{m.label}
																</DropdownMenuItem>
															))}
														</DropdownMenuContent>
													</DropdownMenu>
													<DropdownMenu>
														<DropdownMenuTrigger
															className={cn(
																MODEL_SETTINGS_PICKER_CLASS,
																"w-[6.75rem] shrink-0 justify-between gap-1.5",
															)}
														>
															<span className="truncate leading-none">
																{effortLabel(selectedDefaultEffort)}
															</span>
															<ChevronDown className="size-3 opacity-40" />
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="end"
															sideOffset={4}
															className="min-w-[8rem]"
														>
															{defaultEffortLevels.map((l) => (
																<DropdownMenuItem
																	key={l}
																	onClick={() =>
																		updateSettings({
																			defaultEffort: l,
																			defaultEffortsByProvider: {
																				...settings.defaultEffortsByProvider,
																				[defaultModelProvider]: l,
																			},
																		})
																	}
																>
																	{effortLabel(l)}
																</DropdownMenuItem>
															))}
														</DropdownMenuContent>
													</DropdownMenu>
													{defaultModelSupportsFastMode ? (
														<div
															className={cn(
																MODEL_SETTINGS_PICKER_CLASS,
																"w-[8.25rem] shrink-0 justify-between gap-2",
															)}
														>
															<span className="truncate leading-none">
																Fast mode
															</span>
															<Switch
																checked={settings.defaultFastMode}
																onCheckedChange={(checked) =>
																	updateSettings({ defaultFastMode: checked })
																}
																size="sm"
																aria-label="Default fast mode"
															/>
														</div>
													) : null}
												</div>
											</SettingsRow>
											<SettingsRow
												title="Commit action model"
												description="Model for commit messages and PR actions"
											>
												<div className="flex items-center justify-end">
													<DropdownMenu>
														<DropdownMenuTrigger
															className={cn(
																MODEL_SETTINGS_PICKER_CLASS,
																"w-[10.5rem] min-w-0 justify-between gap-1.5",
															)}
														>
															<span className="flex min-w-0 items-center gap-1.5 leading-none">
																<ModelIcon
																	model={selectedCommitActionModel}
																	className="size-3.5 shrink-0"
																/>
																<span className="min-w-0 truncate whitespace-nowrap leading-none">
																	{commitActionModelLabel}
																</span>
															</span>
															<ChevronDown className="size-3 shrink-0 opacity-40" />
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="end"
															sideOffset={4}
															className="min-w-[10rem]"
														>
															{allModels.map((m) => (
																<DropdownMenuItem
																	key={m.id}
																	onClick={() =>
																		updateSettings({
																			commitActionModelId: m.id,
																		})
																	}
																	className="gap-2"
																>
																	<ModelIcon model={m} className="size-4" />
																	{m.label}
																</DropdownMenuItem>
															))}
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</SettingsRow>
											<ClaudeCustomProvidersPanel />
										</SettingsGroup>
									)}

									{activeSection === "git" && (
										<SettingsGroup>
											<div className="py-5">
												<div className="text-[13px] font-medium leading-snug text-foreground">
													Branch Prefix
												</div>
												<div className="mt-1 text-[12px] leading-snug text-muted-foreground">
													Prefix added to branch names when creating new
													workspaces
												</div>
												<RadioGroup
													value={settings.branchPrefixType}
													onValueChange={(value: string) =>
														updateSettings({
															branchPrefixType: value as
																| "github"
																| "custom"
																| "none",
														})
													}
													className="mt-4 gap-1"
												>
													<RadioOption
														value="github"
														label={`GitHub username${githubLogin ? ` (${githubLogin})` : ""}`}
													/>
													<RadioOption value="custom" label="Custom" />
													{settings.branchPrefixType === "custom" && (
														<div className="ml-7">
															<Input
																type="text"
																value={settings.branchPrefixCustom}
																onChange={(e) =>
																	updateSettings({
																		branchPrefixCustom: e.target.value,
																	})
																}
																placeholder="e.g. feat/"
																className="w-full bg-muted/30 text-[13px] text-foreground placeholder:text-muted-foreground/50"
															/>
															{settings.branchPrefixCustom && (
																<div className="mt-1.5 text-[12px] text-muted-foreground">
																	Preview: {settings.branchPrefixCustom}tokyo
																</div>
															)}
														</div>
													)}
													<RadioOption value="none" label="None" />
												</RadioGroup>
											</div>
										</SettingsGroup>
									)}

									{activeSection === "experimental" && (
										<div className="flex flex-col gap-3">
											<CliInstallPanel />
										</div>
									)}

									{activeSection === "import" && <ConductorImportPanel />}

									{activeSection === "developer" && <DevToolsPanel />}

									{activeSection === "account" && (
										<AccountPanel
											repositories={repositories}
											onSignedOut={onClose}
										/>
									)}

									{activeRepoId && !activeRepo && (
										<SettingsGroup>
											<SettingsRow
												title={
													reposQuery.isFetching
														? "Loading repository"
														: "Repository unavailable"
												}
												description={
													reposQuery.isFetching
														? "Repository settings will appear once the repository list finishes loading."
														: "This repository is no longer available in Pathos."
												}
											>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => setActiveSection("general")}
												>
													General
												</Button>
											</SettingsRow>
										</SettingsGroup>
									)}

									{activeRepo && (
										<RepositorySettingsPanel
											repo={activeRepo}
											githubLogin={githubLogin}
											workspaceId={
												activeRepo.id === workspaceRepoId ? workspaceId : null
											}
											onRepoSettingsChanged={() => {
												void queryClient.invalidateQueries({
													queryKey: pathosQueryKeys.repositories,
												});
												void queryClient.invalidateQueries({
													queryKey: pathosQueryKeys.workspaceGroups,
												});
												// Invalidate all workspace detail caches so
												// open panels pick up the new remote/branch.
												void queryClient.invalidateQueries({
													predicate: (q) => q.queryKey[0] === "workspaceDetail",
												});
											}}
											onRepoDeleted={() => {
												setActiveSection("general");
												void queryClient.invalidateQueries({
													queryKey: pathosQueryKeys.repositories,
												});
												void queryClient.invalidateQueries({
													queryKey: pathosQueryKeys.workspaceGroups,
												});
											}}
										/>
									)}
								</div>
							</div>
						</SidebarProvider>
					</div>
				</DialogContent>
			</Dialog>
		</TooltipProvider>
	);
});

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function RadioOption({
	value,
	label,
}: {
	value: "github" | "custom" | "none";
	label: string;
}) {
	const id = `settings-branch-prefix-${value}`;

	return (
		<Field
			orientation="horizontal"
			className="items-center gap-3 rounded-lg px-1 py-1.5"
		>
			<RadioGroupItem value={value} id={id} />
			<FieldContent>
				<FieldLabel htmlFor={id} className="text-foreground">
					{label}
				</FieldLabel>
			</FieldContent>
		</Field>
	);
}

function effortLabel(level: string): string {
	if (level === "xhigh") return "Extra High";
	return level.charAt(0).toUpperCase() + level.slice(1);
}

export function SettingsButton({
	onClick,
	shortcut,
}: {
	onClick: () => void;
	shortcut?: string | null;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onClick()}
					className="text-muted-foreground hover:text-foreground"
				>
					<Settings className="size-[15px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={4}
				className="flex h-[24px] items-center gap-2 rounded-md px-2 text-[12px] leading-none"
			>
				<span className="leading-none">Settings</span>
				{shortcut ? (
					<InlineShortcutDisplay
						hotkey={shortcut}
						className="text-tooltip-foreground/55"
					/>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
