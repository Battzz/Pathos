import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { type ILinkProvider, type ITheme, Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

type TerminalOutputProps = {
	terminalRef?: React.RefObject<TerminalHandle | null>;
	className?: string;
	detectLinks?: boolean;
	fontSize?: number;
	lineHeight?: number;
	padding?: string;
	/**
	 * Called when the user types (or pastes). The string is the raw bytes
	 * xterm would send over a real PTY — e.g. a literal `\x03` for Ctrl+C,
	 * `\x1b[A` for Up arrow. Forward this to the backend to write into the
	 * PTY master.
	 *
	 * When omitted, xterm still captures keys but they go nowhere.
	 */
	onData?: (data: string) => void;
	/**
	 * Called when the terminal's cell grid changes size (FitAddon resize,
	 * font change, etc). Forward to the backend's `TIOCSWINSZ` so
	 * interactive tools (vim, htop, less) re-layout.
	 */
	onResize?: (cols: number, rows: number) => void;
};

export type TerminalHandle = {
	write: (data: string) => void;
	clear: () => void;
	dispose: () => void;
	refit: () => void;
};

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/;

function sanitizeHttpUrl(value: string): string | null {
	const trimmed = value.replace(TRAILING_URL_PUNCTUATION, "");
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.toString();
	} catch {
		return null;
	}
}

function openHttpUrl(value: string) {
	const url = sanitizeHttpUrl(value);
	if (!url) return;
	void openUrl(url);
}

function findLineForOffset(
	lineOffsets: readonly number[],
	lineTexts: readonly string[],
	offset: number,
): number | null {
	for (let i = lineOffsets.length - 1; i >= 0; i--) {
		if (offset >= lineOffsets[i]) {
			const lineEnd = lineOffsets[i] + lineTexts[i].length;
			return offset <= lineEnd ? i : null;
		}
	}
	return null;
}

function createHttpLinkProvider(terminal: Terminal): ILinkProvider {
	return {
		provideLinks(bufferLineNumber, callback) {
			const buffer = terminal.buffer.active;
			let startLine = bufferLineNumber - 1;
			while (startLine > 0 && buffer.getLine(startLine)?.isWrapped) {
				startLine--;
			}

			let endLine = bufferLineNumber - 1;
			while (
				endLine + 1 < buffer.length &&
				buffer.getLine(endLine + 1)?.isWrapped
			) {
				endLine++;
			}

			const lineTexts: string[] = [];
			for (let y = startLine; y <= endLine; y++) {
				lineTexts.push(buffer.getLine(y)?.translateToString(false) ?? "");
			}

			const lineOffsets: number[] = [];
			let offset = 0;
			for (const lineText of lineTexts) {
				lineOffsets.push(offset);
				offset += lineText.length;
			}

			const text = lineTexts.join("");
			const links = [...text.matchAll(URL_PATTERN)]
				.map((match) => {
					const rawText = match[0];
					const url = sanitizeHttpUrl(rawText);
					if (!url || match.index === undefined) return null;

					const startOffset = match.index;
					const endOffset =
						startOffset + rawText.replace(TRAILING_URL_PUNCTUATION, "").length;
					const startRelativeLine = findLineForOffset(
						lineOffsets,
						lineTexts,
						startOffset,
					);
					const endRelativeLine = findLineForOffset(
						lineOffsets,
						lineTexts,
						Math.max(startOffset, endOffset - 1),
					);
					if (startRelativeLine === null || endRelativeLine === null) {
						return null;
					}

					return {
						range: {
							start: {
								x: startOffset - lineOffsets[startRelativeLine] + 1,
								y: startLine + startRelativeLine + 1,
							},
							end: {
								x: endOffset - lineOffsets[endRelativeLine] + 1,
								y: startLine + endRelativeLine + 1,
							},
						},
						text: url,
						decorations: {
							pointerCursor: true,
							underline: true,
						},
						activate: (_event: MouseEvent, linkText: string) => {
							openHttpUrl(linkText);
						},
					};
				})
				.filter((link) => link !== null);

			callback(links.length > 0 ? links : undefined);
		},
	};
}

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
	detectLinks = false,
	fontSize = 12,
	lineHeight = 1.3,
	padding = "12px 2px 12px 12px",
	onData,
	onResize,
}: TerminalOutputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	// Latest callbacks in a ref so the xterm effect doesn't need to
	// tear down and recreate the terminal every time the parent rerenders.
	const onDataRef = useRef<typeof onData>(onData);
	const onResizeRef = useRef<typeof onResize>(onResize);
	onDataRef.current = onData;
	onResizeRef.current = onResize;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const fit = new FitAddon();
		const terminal = new Terminal({
			convertEol: true,
			// stdin enabled — forward keystrokes via onData below.
			disableStdin: false,
			scrollback: 5000,
			fontSize,
			fontFamily: "'GeistMono', 'SF Mono', Monaco, Menlo, monospace",
			lineHeight,
			theme: resolveTerminalTheme(),
			cursorBlink: false,
			cursorStyle: "bar",
			cursorInactiveStyle: "none",
			linkHandler: detectLinks
				? {
						activate: (_event, text) => {
							openHttpUrl(text);
						},
					}
				: null,
		});

		terminal.loadAddon(fit);
		terminal.open(container);
		const linkProviderDisposable = detectLinks
			? terminal.registerLinkProvider(createHttpLinkProvider(terminal))
			: null;

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

		// Every keystroke / paste flows through here. xterm has already done
		// the key → byte translation (e.g. Ctrl+C → `\x03`), we just
		// forward whatever it produced.
		const dataSub = terminal.onData((data) => {
			onDataRef.current?.(data);
		});

		// xterm fires onResize after FitAddon changes the grid, font size
		// changes, etc. Forward to the backend PTY for TIOCSWINSZ.
		const resizeSub = terminal.onResize(({ cols, rows }) => {
			onResizeRef.current?.(cols, rows);
		});

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
				refit: () => runFit(),
			};
		}

		return () => {
			dataSub.dispose();
			resizeSub.dispose();
			linkProviderDisposable?.dispose();
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
	}, [detectLinks, fontSize, lineHeight, terminalRef]);

	return (
		<div
			className={className}
			style={{
				width: "100%",
				height: "100%",
				boxSizing: "border-box",
				padding,
				backgroundColor: "var(--terminal-background)",
			}}
		>
			<div ref={containerRef} style={{ width: "100%", height: "100%" }} />
		</div>
	);
}
