import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Smooth braille-dot spinner — the same 10-frame "thinking" cycle that
 * ora / npm / oclif use. Looks fluid at small sizes (where rotating
 * `| / - \` reads as choppy) and keeps a fixed-width footprint so the
 * surrounding label doesn't shift. ~12 fps.
 */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

type AsciiSpinnerProps = {
	className?: string;
};

export function AsciiSpinner({ className }: AsciiSpinnerProps) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const id = window.setInterval(() => {
			setFrame((v) => (v + 1) % FRAMES.length);
		}, FRAME_MS);
		return () => window.clearInterval(id);
	}, []);

	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center font-mono leading-none tabular-nums",
				className,
			)}
		>
			{FRAMES[frame]}
		</span>
	);
}
