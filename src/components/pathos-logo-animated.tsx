import pathosLogoDark from "@/assets/pathos-logo.png";
import pathosLogoLight from "@/assets/pathos-logo-light.png";
import { resolveTheme, useSettings } from "@/lib/settings";
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
	const { settings } = useSettings();
	const effectiveTheme = resolveTheme(settings.theme);
	const logoSrc = effectiveTheme === "light" ? pathosLogoLight : pathosLogoDark;
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
			src={logoSrc}
			alt=""
			draggable={false}
			className={cn("block rounded-[22%] object-contain", className)}
			style={{ width: size, height: size, ...animationStyle }}
		/>
	);
}
