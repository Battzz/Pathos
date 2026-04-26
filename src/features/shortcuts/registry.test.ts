import { describe, expect, it } from "vitest";
import {
	findShortcutConflict,
	getShortcut,
	getShortcutConflicts,
	SHORTCUT_DEFINITIONS,
	updateShortcutOverride,
} from "./registry";
import type { ShortcutId } from "./types";

describe("shortcut registry", () => {
	it("ships with no internal shortcut conflicts", () => {
		expect(getShortcutConflicts({}).disabledHotkeys.size).toBe(0);
	});

	it("resolves defaults, overrides, and disabled shortcuts", () => {
		expect(getShortcut({}, "workspace.previous")).toBe("Mod+Alt+ArrowUp");
		expect(
			getShortcut({ "workspace.previous": "Mod+A" }, "workspace.previous"),
		).toBe("Mod+A");
		expect(
			getShortcut({ "workspace.previous": null }, "workspace.previous"),
		).toBeNull();
	});

	it("drops redundant overrides that match the default", () => {
		expect(
			updateShortcutOverride(
				{ "workspace.previous": "Mod+A" },
				"workspace.previous",
				"Mod+Alt+ArrowUp",
			),
		).not.toHaveProperty("workspace.previous");
	});

	it("ignores null shortcuts and self matches when finding conflicts", () => {
		expect(
			findShortcutConflict(
				{ "workspace.previous": "Mod+A" },
				"workspace.previous",
				"Mod+A",
			),
		).toBeNull();
		expect(
			findShortcutConflict(
				{ "workspace.previous": null },
				"session.previous",
				"Mod+Alt+ArrowLeft",
			),
		).toBeNull();
	});

	it("marks duplicated shortcuts as conflicts and disables the shared hotkey", () => {
		const conflicts = getShortcutConflicts({
			"workspace.previous": "Mod+A",
			"session.previous": "Mod+A",
		});

		expect(conflicts.disabledHotkeys.has("Mod+A")).toBe(true);
		expect(conflicts.conflictById["workspace.previous"]?.[0]?.id).toBe(
			"session.previous",
		);
		expect(conflicts.conflictById["session.previous"]?.[0]?.id).toBe(
			"workspace.previous",
		);
	});

	it("keeps every shortcut id unique", () => {
		const ids = SHORTCUT_DEFINITIONS.map((definition) => definition.id);
		expect(new Set<ShortcutId>(ids).size).toBe(ids.length);
	});
});
