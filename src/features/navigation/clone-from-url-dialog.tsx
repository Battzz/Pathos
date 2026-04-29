import { open } from "@tauri-apps/plugin-dialog";
import {
	CornerDownRight,
	Download,
	Folder,
	Link2,
	LoaderCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { describeUnknownError } from "@/lib/workspace-helpers";

type SubmitArgs = {
	gitUrl: string;
	cloneDirectory: string;
};

type CloneFromUrlDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultCloneDirectory: string | null;
	onSubmit: (args: SubmitArgs) => Promise<void>;
};

// Pulls the repository name out of a URL so we can preview the resulting path.
// Handles trailing slashes, `.git`, and SSH-style `git@host:owner/repo.git`.
function deriveRepoName(url: string): string | null {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (!trimmed) return null;
	const tail = trimmed.split(/[/:]/).pop();
	if (!tail) return null;
	const name = tail.replace(/\.git$/i, "");
	return name.length > 0 ? name : null;
}

function joinPath(directory: string, name: string): string {
	const trimmed = directory.replace(/\/+$/, "");
	return `${trimmed}/${name}`;
}

export function CloneFromUrlDialog({
	open: isOpen,
	onOpenChange,
	defaultCloneDirectory,
	onSubmit,
}: CloneFromUrlDialogProps) {
	const [gitUrl, setGitUrl] = useState("");
	const [cloneDirectory, setCloneDirectory] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const urlInputRef = useRef<HTMLInputElement>(null);
	// Track whether the user has explicitly edited the location so the default
	// only seeds the field once per open session — reopening after a manual
	// change shouldn't wipe their choice.
	const cloneDirectoryTouchedRef = useRef(false);

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		setIsSubmitting(false);
		setErrorMessage(null);
		if (!cloneDirectoryTouchedRef.current) {
			setCloneDirectory(defaultCloneDirectory ?? "");
		}
		// Match CreateBranchForm: focus the primary input after open.
		requestAnimationFrame(() => urlInputRef.current?.focus());
	}, [isOpen, defaultCloneDirectory]);

	const handleBrowse = useCallback(async () => {
		try {
			const selection = await open({
				directory: true,
				multiple: false,
				defaultPath: cloneDirectory || defaultCloneDirectory || undefined,
			});
			const selected = Array.isArray(selection) ? selection[0] : selection;
			if (selected) {
				cloneDirectoryTouchedRef.current = true;
				setCloneDirectory(selected);
			}
		} catch (error) {
			setErrorMessage(
				describeUnknownError(error, "Unable to open the folder picker."),
			);
		}
	}, [cloneDirectory, defaultCloneDirectory]);

	const trimmedUrl = gitUrl.trim();
	const trimmedDirectory = cloneDirectory.trim();
	const canSubmit =
		trimmedUrl.length > 0 && trimmedDirectory.length > 0 && !isSubmitting;

	const repoName = useMemo(() => deriveRepoName(trimmedUrl), [trimmedUrl]);
	const previewPath = useMemo(() => {
		if (!repoName || trimmedDirectory.length === 0) return null;
		return joinPath(trimmedDirectory, repoName);
	}, [repoName, trimmedDirectory]);

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) {
			return;
		}
		setIsSubmitting(true);
		setErrorMessage(null);
		try {
			await onSubmit({
				gitUrl: trimmedUrl,
				cloneDirectory: trimmedDirectory,
			});
			setGitUrl("");
			setCloneDirectory("");
			cloneDirectoryTouchedRef.current = false;
			onOpenChange(false);
		} catch (error) {
			setErrorMessage(
				describeUnknownError(error, "Unable to clone repository."),
			);
		} finally {
			setIsSubmitting(false);
		}
	}, [canSubmit, onOpenChange, onSubmit, trimmedDirectory, trimmedUrl]);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(nextOpen) => {
				if (isSubmitting && !nextOpen) {
					return;
				}
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="gap-0 p-2 sm:max-w-[22rem]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void handleSubmit();
					}}
					className="flex flex-col gap-2 p-1"
				>
					<div className="flex min-w-0 items-baseline gap-1.5 pr-6 text-[12.5px] font-medium text-foreground">
						<DialogTitle className="text-[12.5px] font-medium tracking-[-0.01em]">
							Clone repository
						</DialogTitle>
						{repoName ? (
							<span className="flex min-w-0 items-baseline gap-1 text-[11px] font-normal text-muted-foreground">
								<span>into</span>
								<span className="truncate text-foreground/80">{repoName}</span>
							</span>
						) : (
							<span className="text-[11px] font-normal text-muted-foreground">
								from URL
							</span>
						)}
					</div>
					<div className="flex h-8 items-center gap-1.5 rounded-md border border-input/30 bg-input/30 px-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
						<Link2
							className="size-3.5 shrink-0 text-muted-foreground"
							strokeWidth={2}
						/>
						<input
							ref={urlInputRef}
							value={gitUrl}
							onChange={(event) => setGitUrl(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									event.stopPropagation();
									onOpenChange(false);
								}
							}}
							placeholder="https://github.com/user/repo.git"
							disabled={isSubmitting}
							spellCheck={false}
							autoCapitalize="off"
							autoCorrect="off"
							autoComplete="off"
							className="min-w-0 flex-1 select-text bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
						/>
					</div>
					<div className="flex h-8 items-center gap-1.5 rounded-md border border-input/30 bg-input/30 pl-2 pr-1 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
						<Folder
							className="size-3.5 shrink-0 text-muted-foreground"
							strokeWidth={2}
						/>
						<input
							value={cloneDirectory}
							onChange={(event) => {
								cloneDirectoryTouchedRef.current = true;
								setCloneDirectory(event.target.value);
							}}
							placeholder="/path/to/parent"
							disabled={isSubmitting}
							spellCheck={false}
							autoCapitalize="off"
							autoCorrect="off"
							autoComplete="off"
							className="min-w-0 flex-1 select-text bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
						/>
						<button
							type="button"
							onClick={() => {
								void handleBrowse();
							}}
							disabled={isSubmitting}
							className="flex h-6 shrink-0 cursor-pointer items-center rounded-sm px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
						>
							Browse…
						</button>
					</div>
					{previewPath ? (
						<div className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
							<CornerDownRight
								className="size-3 shrink-0 text-muted-foreground/60"
								strokeWidth={1.9}
							/>
							<span className="truncate font-mono tracking-[-0.01em]">
								{previewPath}
							</span>
						</div>
					) : null}
					{errorMessage ? (
						<p
							role="alert"
							className="px-1 text-[11px] leading-snug text-destructive"
						>
							{errorMessage}
						</p>
					) : null}
					<Button
						type="submit"
						size="xs"
						disabled={!canSubmit}
						className="w-full justify-center"
					>
						{isSubmitting ? (
							<LoaderCircle
								className="size-3 animate-spin"
								strokeWidth={2}
								data-icon="inline-start"
							/>
						) : (
							<Download strokeWidth={2} data-icon="inline-start" />
						)}
						Clone repository
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
