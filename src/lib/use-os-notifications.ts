import { useCallback, useRef } from "react";
import type { AppSettings } from "@/lib/settings";

type NotifyFn = (opts: { title: string; body: string }) => void;

type NativeNotificationOptions = {
	title: string;
	body?: string;
	sound?: string;
};

function notificationOptions(
	settings: AppSettings,
	opts: { title: string; body: string },
): NativeNotificationOptions {
	const sound =
		settings.notificationSound === "none"
			? undefined
			: settings.notificationSound;
	return sound ? { ...opts, sound } : opts;
}

export async function sendOsNotification(
	settings: AppSettings,
	opts: { title: string; body: string },
	permissionRequestedRef?: { current: boolean },
): Promise<void> {
	if (!settings.notifications) return;

	const { isPermissionGranted, requestPermission, sendNotification } =
		await import("@tauri-apps/plugin-notification");

	let granted = await isPermissionGranted();
	if (!granted) {
		if (permissionRequestedRef?.current) return;
		if (permissionRequestedRef) {
			permissionRequestedRef.current = true;
		}
		granted = (await requestPermission()) === "granted";
	}

	if (!granted) return;
	sendNotification(notificationOptions(settings, opts));
}

/** Sends native OS notifications, gated by the `notifications` setting. */
export function useOsNotifications(settings: AppSettings): NotifyFn {
	const permissionRequestedRef = useRef(false);

	return useCallback(
		({ title, body }: { title: string; body: string }) => {
			void (async () => {
				try {
					await sendOsNotification(
						settings,
						{ title, body },
						permissionRequestedRef,
					);
				} catch (err) {
					console.warn("[os-notification] failed to send:", err);
				}
			})();
		},
		[settings],
	);
}
