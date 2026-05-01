import { lazy, useMemo } from "react";
import type { MathPlugin, StreamdownProps } from "streamdown";

const LazyStreamdown = lazy(async () => {
	const [
		{ Streamdown },
		{ default: remarkMath },
		{ default: rehypeKatex },
		{ streamdownComponents },
	] = await Promise.all([
		import("streamdown"),
		import("remark-math"),
		import("rehype-katex"),
		import("@/components/streamdown-components"),
	]);
	const mathPlugin = {
		name: "katex",
		rehypePlugin: rehypeKatex,
		remarkPlugin: remarkMath,
		type: "math",
	} satisfies MathPlugin;

	function StreamdownWithOverrides(
		props: React.ComponentProps<typeof Streamdown>,
	) {
		const plugins = useMemo<StreamdownProps["plugins"]>(
			() => ({
				...props.plugins,
				math: props.plugins?.math ?? mathPlugin,
			}),
			[props.plugins],
		);
		return (
			<Streamdown
				{...props}
				components={{ ...streamdownComponents, ...props.components }}
				plugins={plugins}
			/>
		);
	}

	return { default: StreamdownWithOverrides };
});

let hasPreloadedStreamdown = false;

export function preloadStreamdown() {
	if (hasPreloadedStreamdown) {
		return;
	}
	hasPreloadedStreamdown = true;
	void import("streamdown");
	void import("remark-math");
	void import("rehype-katex");
	void import("@/components/streamdown-components");
}

export { LazyStreamdown };
