import type { ShortcutDefinition, ShortcutId, ShortcutMap } from "./types";

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
	{
		id: "workspace.previous",
		title: "Previous workspace",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowUp",
		scope: "conversation",
		editable: true,
	},
	{
		id: "workspace.next",
		title: "Next workspace",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowDown",
		scope: "conversation",
		editable: true,
	},
	{
		id: "session.previous",
		title: "Previous session",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowLeft",
		scope: "conversation",
		editable: true,
	},
	{
		id: "session.next",
		title: "Next session",
		group: "Navigation",
		defaultHotkey: "Mod+Alt+ArrowRight",
		scope: "conversation",
		editable: true,
	},
	{
		id: "session.new",
		title: "New session",
		group: "Session",
		defaultHotkey: "Mod+T",
		scope: "conversation",
		editable: true,
	},
	{
		id: "session.close",
		title: "Close current session",
		group: "Session",
		defaultHotkey: "Mod+W",
		scope: "conversation",
		editable: true,
	},
	{
		id: "workspace.copyPath",
		title: "Copy workspace path",
		group: "Workspace",
		defaultHotkey: "Mod+Shift+C",
		scope: "global",
		editable: true,
	},
	{
		id: "workspace.openInEditor",
		title: "Open repository in default app",
		group: "Workspace",
		defaultHotkey: "Mod+O",
		scope: "conversation",
		editable: true,
	},
	{
		id: "workspace.new",
		title: "Create new workspace",
		group: "Workspace",
		defaultHotkey: "Mod+N",
		scope: "conversation",
		editable: true,
	},
	{
		id: "workspace.addRepository",
		title: "Add repository",
		group: "Workspace",
		defaultHotkey: "Mod+Shift+N",
		scope: "conversation",
		editable: true,
	},
	{
		id: "script.run",
		title: "Run / stop script",
		group: "Actions",
		defaultHotkey: "Mod+R",
		scope: "global",
		editable: true,
	},
	{
		id: "action.createPr",
		title: "Create PR",
		group: "Actions",
		defaultHotkey: "Mod+Shift+P",
		scope: "conversation",
		editable: true,
	},
	{
		id: "action.commitAndPush",
		title: "Commit and push",
		group: "Actions",
		defaultHotkey: "Mod+Shift+Y",
		scope: "conversation",
		editable: true,
	},
	{
		id: "action.pullLatest",
		title: "Pull latest from main",
		group: "Actions",
		defaultHotkey: "Mod+Shift+L",
		scope: "conversation",
		editable: true,
	},
	{
		id: "action.mergePr",
		title: "Merge PR",
		group: "Actions",
		defaultHotkey: "Mod+Shift+M",
		scope: "conversation",
		editable: true,
	},
	{
		id: "action.fixErrors",
		title: "Fix errors",
		group: "Actions",
		defaultHotkey: "Mod+Shift+X",
		scope: "conversation",
		editable: true,
	},
	{
		id: "settings.open",
		title: "Open settings",
		group: "System",
		defaultHotkey: "Mod+,",
		scope: "global",
		editable: true,
	},
	{
		id: "theme.toggle",
		title: "Toggle theme (dark/light)",
		group: "System",
		defaultHotkey: "Mod+Alt+T",
		scope: "global",
		editable: true,
	},
	{
		id: "sidebar.left.toggle",
		title: "Toggle left sidebar",
		group: "System",
		defaultHotkey: "Mod+B",
		scope: "conversation",
		editable: true,
	},
	{
		id: "sidebar.right.toggle",
		title: "Toggle right sidebar",
		group: "System",
		defaultHotkey: "Mod+Alt+B",
		scope: "conversation",
		editable: true,
	},
	{
		id: "zen.toggle",
		title: "Toggle zen mode",
		group: "System",
		defaultHotkey: "Mod+.",
		scope: "conversation",
		editable: true,
	},
	{
		id: "zoom.in",
		title: "Zoom in",
		group: "System",
		defaultHotkey: "Mod+=",
		scope: "global",
		editable: true,
	},
	{
		id: "zoom.out",
		title: "Zoom out",
		group: "System",
		defaultHotkey: "Mod+-",
		scope: "global",
		editable: true,
	},
	{
		id: "zoom.reset",
		title: "Reset zoom",
		group: "System",
		defaultHotkey: "Mod+0",
		scope: "global",
		editable: true,
	},
	{
		id: "composer.focus",
		title: "Focus chat input",
		group: "Composer",
		defaultHotkey: "Mod+L",
		scope: "conversation",
		editable: true,
	},
	{
		id: "composer.togglePlanMode",
		title: "Toggle plan mode",
		group: "Composer",
		defaultHotkey: "Shift+Tab",
		scope: "conversation",
		editable: true,
	},
];

export const SHORTCUT_DEFINITION_BY_ID = new Map(
	SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getShortcut(
	overrides: ShortcutMap,
	id: ShortcutId,
): string | null {
	if (Object.hasOwn(overrides, id)) {
		return overrides[id] ?? null;
	}
	return SHORTCUT_DEFINITION_BY_ID.get(id)?.defaultHotkey ?? null;
}

export function updateShortcutOverride(
	overrides: ShortcutMap,
	id: ShortcutId,
	hotkey: string | null,
): ShortcutMap {
	const next = { ...overrides };
	const fallback = SHORTCUT_DEFINITION_BY_ID.get(id)?.defaultHotkey ?? null;
	if (hotkey === fallback) {
		delete next[id];
	} else {
		next[id] = hotkey;
	}
	return next;
}

export function findShortcutConflict(
	overrides: ShortcutMap,
	id: ShortcutId,
	hotkey: string | null,
): ShortcutDefinition | null {
	if (!hotkey) return null;
	return (
		SHORTCUT_DEFINITIONS.find(
			(definition) =>
				definition.id !== id &&
				getShortcut(overrides, definition.id) === hotkey,
		) ?? null
	);
}

export function getShortcutConflicts(overrides: ShortcutMap): {
	conflictById: Partial<Record<ShortcutId, ShortcutDefinition[]>>;
	disabledHotkeys: Set<string>;
} {
	const definitionsByHotkey = new Map<string, ShortcutDefinition[]>();
	for (const definition of SHORTCUT_DEFINITIONS) {
		const hotkey = getShortcut(overrides, definition.id);
		if (!hotkey) continue;
		const definitions = definitionsByHotkey.get(hotkey) ?? [];
		definitions.push(definition);
		definitionsByHotkey.set(hotkey, definitions);
	}

	const conflictById: Partial<Record<ShortcutId, ShortcutDefinition[]>> = {};
	const disabledHotkeys = new Set<string>();
	for (const [hotkey, definitions] of definitionsByHotkey) {
		if (definitions.length < 2) continue;
		disabledHotkeys.add(hotkey);
		for (const definition of definitions) {
			conflictById[definition.id] = definitions.filter(
				(candidate) => candidate.id !== definition.id,
			);
		}
	}
	return { conflictById, disabledHotkeys };
}
