import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Lock } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { loadRepoScripts, updateRepoScripts } from "@/lib/api";
import { cn } from "@/lib/utils";

type ScriptKind = "setup" | "run";

type ScriptEditDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kind: ScriptKind;
	repoId: string | null;
	workspaceId: string | null;
};

const COPY: Record<
	ScriptKind,
	{
		eyebrow: string;
		phase: string;
		srTitle: string;
		description: string;
		placeholder: string;
		prompt: string;
	}
> = {
	setup: {
		eyebrow: "01",
		phase: "Script",
		srTitle: "Setup script",
		description: "Runs once when a workspace is created.",
		placeholder: "bun install",
		prompt: "$",
	},
	run: {
		eyebrow: "02",
		phase: "Run",
		srTitle: "Run script",
		description: "Runs from the Run tab — usually a dev server.",
		placeholder: "bun run dev",
		prompt: "▸",
	},
};

export function ScriptEditDialog({
	open,
	onOpenChange,
	kind,
	repoId,
	workspaceId,
}: ScriptEditDialogProps) {
	const queryClient = useQueryClient();
	const copy = COPY[kind];

	const scriptsQuery = useQuery({
		queryKey: ["repoScripts", repoId, workspaceId],
		queryFn: () => loadRepoScripts(repoId!, workspaceId),
		enabled: !!repoId && open,
		staleTime: 0,
	});

	const data = scriptsQuery.data;
	const lockedFromProject =
		kind === "setup"
			? (data?.setupFromProject ?? false)
			: (data?.runFromProject ?? false);
	const initialValue =
		(kind === "setup" ? data?.setupScript : data?.runScript) ?? "";

	const [value, setValue] = useState(initialValue);
	const [saving, setSaving] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (!open) return;
		setValue(initialValue);
	}, [open, initialValue]);

	useEffect(() => {
		if (!open || lockedFromProject) return;
		const t = window.setTimeout(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(
				textareaRef.current.value.length,
				textareaRef.current.value.length,
			);
		}, 60);
		return () => window.clearTimeout(t);
	}, [open, lockedFromProject]);

	const isDirty = value !== initialValue;
	const canSave =
		!saving &&
		!lockedFromProject &&
		!!repoId &&
		isDirty &&
		!scriptsQuery.isLoading;

	const handleSave = async () => {
		if (!repoId) return;
		setSaving(true);
		try {
			const trimmed = value.trim() || null;
			const nextSetup =
				kind === "setup" ? trimmed : data?.setupScript?.trim() || null;
			const nextRun =
				kind === "run" ? trimmed : data?.runScript?.trim() || null;
			await updateRepoScripts(repoId, nextSetup, nextRun);
			await queryClient.invalidateQueries({
				queryKey: ["repoScripts", repoId],
			});
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save script.";
			toast.error(message);
		} finally {
			setSaving(false);
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSave) {
			event.preventDefault();
			void handleSave();
		}
	};

	const isSetup = kind === "setup";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className={cn(
					"gap-0 overflow-hidden p-0 sm:max-w-[480px]",
					"rounded-2xl border-foreground/[0.04] bg-popover/95",
					"shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55),0_0_0_1px_rgb(255_255_255/0.02)_inset]",
					"backdrop-blur-xl",
				)}
			>
				{/* Top hairline accent */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
				/>

				{/* Eyebrow row */}
				<div className="flex items-center justify-between px-6 pt-5 pb-0">
					<div className="flex items-baseline gap-2 font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground/70 uppercase">
						<span className="text-foreground/55 tabular-nums">
							{copy.eyebrow}
						</span>
						<span>{copy.phase}</span>
					</div>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						aria-label="Close"
						className={cn(
							"-mr-1.5 flex size-7 cursor-pointer items-center justify-center rounded-md",
							"text-muted-foreground/70 transition-colors",
							"hover:bg-muted hover:text-foreground",
							"focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
						)}
					>
						<svg
							viewBox="0 0 24 24"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
					</button>
				</div>

				<DialogHeader className="gap-2 px-6 pt-3">
					<DialogTitle className="sr-only">{copy.srTitle}</DialogTitle>
					<DialogDescription
						className={cn(
							"text-foreground/85",
							isSetup
								? "text-[14px] leading-[1.5]"
								: "font-mono text-[12px] leading-[1.55] tracking-tight",
						)}
					>
						{copy.description}
					</DialogDescription>
				</DialogHeader>

				{/* Command surface */}
				<div className="px-6 pt-5">
					{lockedFromProject ? (
						<div
							className={cn(
								"group relative overflow-hidden rounded-xl border border-foreground/[0.08]",
								"bg-foreground/[0.02]",
							)}
						>
							<div className="flex items-start gap-3 px-3.5 py-3">
								<div className="mt-0.5 flex size-6 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground/80">
									<Lock className="size-3" strokeWidth={1.8} />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-[12.5px] leading-[1.4] text-foreground/85">
										Managed by project config
									</p>
									<p className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">
										{value || copy.placeholder}
									</p>
								</div>
							</div>
							<div className="flex items-center justify-between border-t border-foreground/[0.05] bg-foreground/[0.015] px-3.5 py-1.5">
								<span className="font-mono text-[10px] tracking-wide text-muted-foreground/60 uppercase">
									Source
								</span>
								<code className="font-mono text-[10.5px] text-foreground/70">
									pathos.json
								</code>
							</div>
						</div>
					) : (
						<div
							className={cn(
								"group relative overflow-hidden rounded-xl border bg-input/15",
								"border-foreground/[0.07] transition-all duration-150",
								"focus-within:border-foreground/15 focus-within:bg-input/25",
								"focus-within:shadow-[0_0_0_3px_rgb(255_255_255/0.025)]",
							)}
						>
							{/* Left gutter prompt */}
							<div className="flex">
								<div
									aria-hidden
									className={cn(
										"flex w-10 shrink-0 select-none flex-col items-center pt-[11px]",
										"font-mono text-[13px] leading-none",
										isSetup ? "text-foreground/35" : "text-foreground/45",
									)}
								>
									<span>{copy.prompt}</span>
								</div>
								<div aria-hidden className="my-2 w-px bg-foreground/[0.06]" />
								<textarea
									ref={textareaRef}
									value={value}
									onChange={(event) => setValue(event.target.value)}
									onKeyDown={handleKeyDown}
									placeholder={copy.placeholder}
									disabled={saving || !repoId}
									rows={3}
									spellCheck={false}
									autoComplete="off"
									autoCapitalize="off"
									autoCorrect="off"
									className={cn(
										"min-h-[64px] flex-1 resize-none bg-transparent py-2.5 pr-3 pl-3",
										"font-mono text-[12.5px] leading-[1.55] text-foreground",
										"outline-none placeholder:text-muted-foreground/40",
										"disabled:cursor-not-allowed disabled:opacity-60",
									)}
									aria-label={`${copy.srTitle} command`}
								/>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="mt-5 flex items-center justify-between gap-2 border-t border-foreground/[0.05] bg-foreground/[0.012] px-6 py-3.5">
					<div className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/65">
						<Kbd>⌘</Kbd>
						<Kbd>
							<CornerDownLeft className="size-2.5" strokeWidth={2.2} />
						</Kbd>
						<span className="ml-1 tracking-wide">to save</span>
					</div>

					<div className="flex items-center gap-1.5">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOpenChange(false)}
							disabled={saving}
							className="text-muted-foreground hover:text-foreground"
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={() => void handleSave()}
							disabled={!canSave}
							className="min-w-[72px]"
						>
							{saving ? "Saving…" : "Save"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd
			className={cn(
				"inline-flex h-[18px] min-w-[18px] items-center justify-center px-1",
				"rounded-[4px] border border-foreground/[0.08] bg-foreground/[0.04]",
				"font-mono text-[10px] leading-none text-foreground/75",
				"shadow-[0_1px_0_rgb(0_0_0/0.15)]",
			)}
		>
			{children}
		</kbd>
	);
}
