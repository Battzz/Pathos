const TIME_UNITS: Array<[number, string]> = [
	[60 * 60 * 24 * 365, "y"],
	[60 * 60 * 24 * 7, "w"],
	[60 * 60 * 24, "d"],
	[60 * 60, "h"],
	[60, "m"],
];

export function formatCompactElapsedTime(iso?: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;

	const elapsedSeconds = Math.max(
		0,
		Math.floor((Date.now() - date.getTime()) / 1000),
	);
	if (elapsedSeconds < 60) return "now";

	for (const [unitSeconds, unitLabel] of TIME_UNITS) {
		if (elapsedSeconds >= unitSeconds) {
			return `${Math.floor(elapsedSeconds / unitSeconds)}${unitLabel}`;
		}
	}

	return "now";
}
