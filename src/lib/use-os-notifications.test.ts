import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { sendOsNotification } from "./use-os-notifications";

describe("sendOsNotification", () => {
	beforeEach(() => {
		vi.mocked(isPermissionGranted).mockReset();
		vi.mocked(requestPermission).mockReset();
		vi.mocked(sendNotification).mockReset();
		vi.mocked(isPermissionGranted).mockResolvedValue(true);
		vi.mocked(requestPermission).mockResolvedValue("granted");
	});

	it("passes the selected notification sound to Tauri", async () => {
		await sendOsNotification(
			{ ...DEFAULT_SETTINGS, notificationSound: "Submarine" },
			{ title: "Session completed", body: "Workspace" },
		);

		expect(sendNotification).toHaveBeenCalledWith({
			title: "Session completed",
			body: "Workspace",
			sound: "Submarine",
		});
	});

	it("omits sound when the user selects None", async () => {
		await sendOsNotification(
			{ ...DEFAULT_SETTINGS, notificationSound: "none" },
			{ title: "Session completed", body: "Workspace" },
		);

		expect(sendNotification).toHaveBeenCalledWith({
			title: "Session completed",
			body: "Workspace",
		});
	});

	it("does not request permission repeatedly in one session", async () => {
		const permissionRequestedRef = { current: false };
		vi.mocked(isPermissionGranted).mockResolvedValue(false);
		vi.mocked(requestPermission).mockResolvedValue("denied");

		await sendOsNotification(
			DEFAULT_SETTINGS,
			{ title: "Input needed", body: "Workspace" },
			permissionRequestedRef,
		);
		await sendOsNotification(
			DEFAULT_SETTINGS,
			{ title: "Input needed", body: "Workspace" },
			permissionRequestedRef,
		);

		expect(requestPermission).toHaveBeenCalledTimes(1);
		expect(sendNotification).not.toHaveBeenCalled();
	});
});
