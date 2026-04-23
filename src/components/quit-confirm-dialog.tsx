import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { requestQuit } from "@/lib/api";

export function QuitConfirmDialog({
	sendingSessionIds,
}: {
	sendingSessionIds: Set<string>;
}) {
	const [open, setOpen] = useState(false);
	const sendingRef = useRef(sendingSessionIds);
	const quitRequestActiveRef = useRef(false);
	sendingRef.current = sendingSessionIds;

	const handleQuit = useCallback(async (force: boolean) => {
		setOpen(false);
		try {
			await requestQuit(force);
		} finally {
			quitRequestActiveRef.current = false;
		}
	}, []);

	const handleQuitRequested = useCallback(() => {
		if (quitRequestActiveRef.current) {
			return;
		}
		quitRequestActiveRef.current = true;

		if (sendingRef.current.size === 0) {
			void Promise.resolve(requestQuit(false)).finally(() => {
				quitRequestActiveRef.current = false;
			});
			return;
		}

		setOpen(true);
	}, []);

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			quitRequestActiveRef.current = false;
		}
	}, []);

	useEffect(() => {
		let disposed = false;
		let unlistenCloseRequested: (() => void) | undefined;
		let unlistenQuitRequested: (() => void) | undefined;

		void getCurrentWindow()
			.onCloseRequested((event) => {
				event.preventDefault();
				handleQuitRequested();
			})
			.then((fn) => {
				if (disposed) {
					fn();
					return;
				}
				unlistenCloseRequested = fn;
			});

		// Rust intercepts every user-initiated exit path (close button,
		// Cmd+W, Cmd+Q, app-menu Quit) and emits this event. We're the
		// only gate that knows about in-flight tasks.
		void listen("helmor://quit-requested", handleQuitRequested).then((fn) => {
			if (disposed) {
				fn();
				return;
			}
			unlistenQuitRequested = fn;
		});

		return () => {
			disposed = true;
			unlistenCloseRequested?.();
			unlistenQuitRequested?.();
		};
	}, [handleQuitRequested]);

	const count = sendingSessionIds.size;

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Quit Helmor?"
			description={
				count === 1
					? "There is 1 task in progress. Quitting now will cancel it."
					: `There are ${count} tasks in progress. Quitting now will cancel them.`
			}
			confirmLabel="Quit anyway"
			onConfirm={() => void handleQuit(true)}
		/>
	);
}
