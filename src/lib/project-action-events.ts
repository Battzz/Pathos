export const PATHOS_OPEN_PROJECT_EVENT = "pathos:open-project";
export const PATHOS_CLONE_PROJECT_EVENT = "pathos:clone-project";

export function requestOpenProject() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new Event(PATHOS_OPEN_PROJECT_EVENT));
}

export function requestCloneProject() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new Event(PATHOS_CLONE_PROJECT_EVENT));
}
