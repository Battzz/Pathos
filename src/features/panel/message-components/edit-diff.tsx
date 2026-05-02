import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { CodeBlock } from "@/components/ai/code-block";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { inferLanguageFromPath } from "./code-language";

export function EditDiffTrigger({
	file,
	diffAdd,
	diffDel,
	oldStr,
	newStr,
	unifiedDiff,
	icon,
	variant = "pill",
}: {
	file: string;
	diffAdd?: number;
	diffDel?: number;
	oldStr: string | null;
	newStr: string | null;
	unifiedDiff?: string | null;
	icon?: ReactNode;
	variant?: "pill" | "row";
}) {
	const triggerRef = useRef<HTMLSpanElement>(null);
	const previewRef = useRef<HTMLDivElement>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
	const [placement, setPlacement] = useState<{
		x: number;
		y: number;
		maxHeight: number;
	} | null>(null);
	const language = inferLanguageFromPath(file);

	const show = useCallback(() => {
		if (hideTimer.current) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setAnchorRect(rect);
		}
	}, []);
	const hideDelayed = useCallback(() => {
		hideTimer.current = setTimeout(() => {
			setAnchorRect(null);
			setPlacement(null);
		}, 120);
	}, []);

	useLayoutEffect(() => {
		if (!anchorRect || !previewRef.current) return;

		const margin = 12;
		const offset = 6;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const previewRect = previewRef.current.getBoundingClientRect();
		const width = Math.min(previewRect.width, viewportWidth - margin * 2);
		const height = previewRect.height;
		const belowY = anchorRect.bottom + offset;
		const aboveY = anchorRect.top - offset;
		const spaceBelow = viewportHeight - belowY - margin;
		const spaceAbove = aboveY - margin;
		const opensBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
		const maxHeight = Math.max(
			160,
			Math.min(height, opensBelow ? spaceBelow : spaceAbove),
		);
		const x = Math.min(
			Math.max(anchorRect.left, margin),
			viewportWidth - width - margin,
		);
		const y = opensBelow
			? belowY
			: Math.max(margin, aboveY - Math.min(height, maxHeight));

		setPlacement((current) =>
			current?.x === x && current.y === y && current.maxHeight === maxHeight
				? current
				: { x, y, maxHeight },
		);
	}, [anchorRect]);

	return (
		<>
			<span
				data-variant={variant}
				ref={triggerRef}
				onMouseEnter={show}
				onMouseLeave={hideDelayed}
				className={cn(
					"items-center gap-1.5 text-[12px] leading-4 text-muted-foreground transition-colors",
					variant === "row"
						? "flex w-full cursor-pointer rounded-md px-2 py-1 hover:bg-accent/60"
						: "inline-flex self-start rounded-md border border-border/60 px-1.5 py-0.5 hover:border-muted-foreground/40 hover:bg-accent/40",
				)}
			>
				{icon}
				<span className="min-w-0 truncate">{file}</span>
				{diffAdd != null || diffDel != null ? (
					<span
						className={cn(
							"flex shrink-0 items-center gap-1 text-[11px]",
							variant === "row" ? "" : "ml-auto",
						)}
					>
						{diffAdd != null ? (
							<span className="text-chart-2">+{diffAdd}</span>
						) : null}
						{diffDel != null ? (
							<span className="text-destructive">-{diffDel}</span>
						) : null}
					</span>
				) : null}
			</span>
			{anchorRect
				? createPortal(
						<div
							ref={previewRef}
							onMouseEnter={show}
							onMouseLeave={hideDelayed}
							className="fixed z-[100] w-[min(40rem,90vw)] rounded-lg border border-border bg-popover shadow-xl"
							style={{
								left: placement?.x ?? anchorRect.left,
								top: placement?.y ?? anchorRect.bottom + 6,
								maxHeight: placement?.maxHeight,
								visibility: placement ? "visible" : "hidden",
							}}
						>
							<div className="border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
								{file}
							</div>
							<div
								className="max-h-[24rem] overflow-auto"
								style={
									placement
										? { maxHeight: Math.max(120, placement.maxHeight - 32) }
										: undefined
								}
							>
								{oldStr ? (
									<DiffPreviewBlock
										code={oldStr}
										language={language}
										tone="delete"
									/>
								) : null}
								{oldStr && newStr ? (
									<Separator className="my-0.5 bg-border/30" />
								) : null}
								{newStr ? (
									<DiffPreviewBlock
										code={newStr}
										language={language}
										tone="add"
									/>
								) : null}
								{!oldStr && !newStr && unifiedDiff ? (
									<CodeBlock
										code={unifiedDiff}
										language="diff"
										variant="plain"
										wrapLines
										className="[&>div>div>pre]:text-[11px] [&>div>div>pre]:leading-5"
									/>
								) : null}
							</div>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}

function DiffPreviewBlock({
	code,
	language,
	tone,
}: {
	code: string;
	language: string | null;
	tone: "add" | "delete";
}) {
	return (
		<div className={cn(tone === "add" ? "bg-chart-2/10" : "bg-destructive/10")}>
			<CodeBlock
				code={code}
				language={language ?? undefined}
				variant="plain"
				wrapLines
				className="[&>div>div>pre]:text-[11px] [&>div>div>pre]:leading-5"
			/>
		</div>
	);
}
