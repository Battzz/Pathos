import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

type TerminalOutputProps = {
	terminalRef?: React.RefObject<TerminalHandle | null>;
	className?: string;
};

export type TerminalHandle = {
	write: (data: string) => void;
	clear: () => void;
	dispose: () => void;
};

// Global suspend counter shared across every mounted TerminalOutput.
//
// The xterm FitAddon re-computes cols/rows and reflows its scrollback buffer
// on every ResizeObserver callback. Animating an ancestor's width/height (for
// example the Setup/Run hover-zoom) makes the observer fire once per frame,
// which pegs the main thread with dozens of buffer reflows over the duration
// of the animation. A caller can wrap the animation window in
// `suspendTerminalFit()` to skip the per-frame fits; when the last outstanding
// release runs, every mounted terminal performs one final fit with the
// settled dimensions.
let terminalFitSuspendCount = 0;
const terminalRefitListeners = new Set<() => void>();

/**
 * Pause `FitAddon.fit()` on every mounted `TerminalOutput` until the
 * returned release function is called. When the suspend count drops back to
 * zero each terminal is asked to re-fit once so its cols/rows match the
 * final container size. The release is idempotent — calling it twice is a
 * no-op — which makes it safe to keep a ref to in React without worrying
 * about strict-mode or cleanup order.
 */
export function suspendTerminalFit(): () => void {
	terminalFitSuspendCount++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		terminalFitSuspendCount--;
		if (terminalFitSuspendCount === 0) {
			for (const listener of terminalRefitListeners) listener();
		}
	};
}

/** Read --terminal-* and --foreground CSS variables and build an xterm ITheme. */
function resolveTerminalTheme(): ITheme {
	const s = getComputedStyle(document.documentElement);
	const v = (suffix: string) =>
		s.getPropertyValue(`--terminal-${suffix}`).trim();

	// Match the app's global scrollbar colors (foreground @ 18%/30%/40%).
	const fg = s.getPropertyValue("--foreground").trim();
	const mix = (pct: number) =>
		`color-mix(in oklch, ${fg} ${pct}%, transparent)`;

	return {
		background: v("background"),
		foreground: v("foreground"),
		cursor: v("cursor"),
		selectionBackground: v("selection"),
		scrollbarSliderBackground: mix(18),
		scrollbarSliderHoverBackground: mix(30),
		scrollbarSliderActiveBackground: mix(40),
		black: v("black"),
		red: v("red"),
		green: v("green"),
		yellow: v("yellow"),
		blue: v("blue"),
		magenta: v("magenta"),
		cyan: v("cyan"),
		white: v("white"),
		brightBlack: v("bright-black"),
		brightRed: v("bright-red"),
		brightGreen: v("bright-green"),
		brightYellow: v("bright-yellow"),
		brightBlue: v("bright-blue"),
		brightMagenta: v("bright-magenta"),
		brightCyan: v("bright-cyan"),
		brightWhite: v("bright-white"),
	};
}

export function TerminalOutput({
	terminalRef,
	className,
}: TerminalOutputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const fit = new FitAddon();
		const terminal = new Terminal({
			convertEol: true,
			disableStdin: true,
			scrollback: 5000,
			fontSize: 12,
			fontFamily: "'GeistMono', 'SF Mono', Monaco, Menlo, monospace",
			lineHeight: 1.3,
			theme: resolveTerminalTheme(),
			cursorBlink: false,
			cursorStyle: "bar",
			cursorInactiveStyle: "none",
		});

		terminal.loadAddon(fit);
		terminal.open(container);

		const runFit = () => {
			requestAnimationFrame(() => {
				try {
					fit.fit();
				} catch {
					// Container might be detached.
				}
			});
		};

		runFit();

		const resizeObserver = new ResizeObserver(() => {
			// A caller is animating an ancestor — skip the per-frame reflow and
			// rely on `refitListener` below to fit once when the animation ends.
			if (terminalFitSuspendCount > 0) return;
			runFit();
		});
		resizeObserver.observe(container);

		// Fired when the last outstanding `suspendTerminalFit()` release runs.
		const refitListener = () => runFit();
		terminalRefitListeners.add(refitListener);

		// Re-resolve CSS variables when app light/dark mode changes.
		const themeObserver = new MutationObserver(() => {
			terminal.options.theme = resolveTerminalTheme();
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		xtermRef.current = terminal;
		fitRef.current = fit;

		if (terminalRef) {
			(terminalRef as React.MutableRefObject<TerminalHandle | null>).current = {
				write: (data: string) => terminal.write(data),
				clear: () => {
					terminal.clear();
					terminal.reset();
				},
				dispose: () => terminal.dispose(),
			};
		}

		return () => {
			themeObserver.disconnect();
			resizeObserver.disconnect();
			terminalRefitListeners.delete(refitListener);
			terminal.dispose();
			xtermRef.current = null;
			fitRef.current = null;
			if (terminalRef) {
				(terminalRef as React.MutableRefObject<TerminalHandle | null>).current =
					null;
			}
		};
	}, [terminalRef]);

	return (
		<div
			className={className}
			style={{
				width: "100%",
				height: "100%",
				padding: "12px 2px 12px 12px",
				backgroundColor: "var(--terminal-background)",
			}}
		>
			<div ref={containerRef} style={{ width: "100%", height: "100%" }} />
		</div>
	);
}
