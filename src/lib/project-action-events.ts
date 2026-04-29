export const HELMOR_OPEN_PROJECT_EVENT = "helmor:open-project";
export const HELMOR_CLONE_PROJECT_EVENT = "helmor:clone-project";

export function requestOpenProject() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new Event(HELMOR_OPEN_PROJECT_EVENT));
}

export function requestCloneProject() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new Event(HELMOR_CLONE_PROJECT_EVENT));
}
