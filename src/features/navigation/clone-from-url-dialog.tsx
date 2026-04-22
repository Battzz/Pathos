import { open } from "@tauri-apps/plugin-dialog";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Clone from URL</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void handleSubmit();
					}}
					className="flex flex-col gap-4"
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="clone-git-url">Git URL</Label>
						<Input
							id="clone-git-url"
							type="text"
							value={gitUrl}
							onChange={(event) => setGitUrl(event.target.value)}
							placeholder="https://github.com/user/repo.git"
							autoFocus
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							disabled={isSubmitting}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="clone-location">Clone location</Label>
						<div className="flex items-center gap-2">
							<Input
								id="clone-location"
								type="text"
								value={cloneDirectory}
								onChange={(event) => {
									cloneDirectoryTouchedRef.current = true;
									setCloneDirectory(event.target.value);
								}}
								autoComplete="off"
								autoCorrect="off"
								spellCheck={false}
								disabled={isSubmitting}
							/>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									void handleBrowse();
								}}
								disabled={isSubmitting}
							>
								Browse…
							</Button>
						</div>
					</div>
					{errorMessage ? (
						<p role="alert" className="text-destructive text-xs leading-snug">
							{errorMessage}
						</p>
					) : null}
					<div className="flex justify-end">
						<Button type="submit" disabled={!canSubmit}>
							{isSubmitting ? (
								<>
									<LoaderCircle className="animate-spin" strokeWidth={2.1} />
									Cloning…
								</>
							) : (
								"Clone repository"
							)}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
