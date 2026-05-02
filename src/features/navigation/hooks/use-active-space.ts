import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SPACE_ID, type Space } from "@/lib/api";

const STORAGE_KEY = "pathos:sidebar:active-space-v1";

function readStored(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStored(spaceId: string) {
	try {
		window.localStorage.setItem(STORAGE_KEY, spaceId);
	} catch {
		// Quota errors are non-fatal — the active space falls back to
		// default on the next load. Mirrors the persister's strategy in
		// `lib/query-client.ts`.
	}
}

/**
 * Active sidebar Space, persisted in localStorage so it survives reloads.
 *
 * Reconciles against `spaces` so that a stale id (e.g. the active space
 * was deleted in another window or removed via the dev DB reset) falls
 * back to the seeded Default space rather than silently rendering an
 * empty pager.
 */
export function useActiveSpace(spaces: Space[]): {
	activeSpaceId: string;
	setActiveSpaceId: (spaceId: string) => void;
} {
	const [activeSpaceId, setActiveSpaceIdRaw] = useState<string>(
		() => readStored() ?? DEFAULT_SPACE_ID,
	);

	useEffect(() => {
		if (spaces.length === 0) return;
		const exists = spaces.some((space) => space.id === activeSpaceId);
		if (!exists) {
			setActiveSpaceIdRaw(DEFAULT_SPACE_ID);
			writeStored(DEFAULT_SPACE_ID);
		}
	}, [activeSpaceId, spaces]);

	const setActiveSpaceId = useCallback((spaceId: string) => {
		setActiveSpaceIdRaw(spaceId);
		writeStored(spaceId);
	}, []);

	return { activeSpaceId, setActiveSpaceId };
}
