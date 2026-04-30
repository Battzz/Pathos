import pathosLogoSrc from "@/assets/pathos-logo-light.png";
import { cn } from "@/lib/utils";

interface PathosLogoAnimatedProps {
	/** CSS width/height */
	size?: string | number;
	loop?: boolean;
	autoplay?: boolean;
	className?: string;
}

export function PathosLogoAnimated({
	size,
	loop = true,
	autoplay = true,
	className,
}: PathosLogoAnimatedProps) {
	const animationStyle = autoplay
		? {
				animationName: "pathos-logo-spin",
				animationDuration: "1.8s",
				animationTimingFunction: "cubic-bezier(.45,0,.2,1)",
				animationIterationCount: loop ? "infinite" : 1,
			}
		: {};

	return (
		<img
			src={pathosLogoSrc}
			alt=""
			draggable={false}
			className={cn("block rounded-[22%] object-contain", className)}
			style={{ width: size, height: size, ...animationStyle }}
		/>
	);
}
