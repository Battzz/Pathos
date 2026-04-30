import { PathosLogoAnimated } from "@/components/pathos-logo-animated";
import { cn } from "@/lib/utils";

type PathosThinkingIndicatorProps = {
	size?: number | string;
	className?: string;
};

export function PathosThinkingIndicator({
	size = 14,
	className,
}: PathosThinkingIndicatorProps) {
	return (
		<span
			aria-hidden="true"
			data-slot="pathos-thinking-indicator"
			className={cn(
				"inline-flex shrink-0 items-center justify-center",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<PathosLogoAnimated size={size} className="shrink-0 opacity-80" />
		</span>
	);
}
