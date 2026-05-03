import { useEffect, useState } from "react";
import { AsciiLoader } from "@/components/ascii-loader";
import { cn } from "@/lib/utils";

export function StreamingFooter({
	className,
	startTime,
}: {
	className?: string;
	startTime: number;
}) {
	const [elapsed, setElapsed] = useState(() =>
		Math.floor((Date.now() - startTime) / 1000),
	);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setElapsed(Math.floor((Date.now() - startTime) / 1000));
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [startTime]);

	const display =
		elapsed < 60
			? `${elapsed}s`
			: `${Math.floor(elapsed / 60)}m ${(elapsed % 60)
					.toString()
					.padStart(2, "0")}s`;

	return (
		<div
			data-testid="streaming-footer"
			className={cn(
				"flex items-center gap-1.5 py-3 text-[12px] tabular-nums text-muted-foreground",
				className,
			)}
		>
			<AsciiLoader className="size-3.5 text-[14px]" />
			{display}
		</div>
	);
}
