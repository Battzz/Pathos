import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_INTERVAL_MS = 80;

export function AsciiLoader({ className }: { className?: string }) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const id = window.setInterval(() => {
			setFrame((current) => (current + 1) % FRAMES.length);
		}, FRAME_INTERVAL_MS);
		return () => window.clearInterval(id);
	}, []);

	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex items-center justify-center font-mono leading-none tabular-nums",
				className,
			)}
		>
			{FRAMES[frame]}
		</span>
	);
}
