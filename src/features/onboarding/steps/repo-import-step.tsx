import { Cloud, FolderOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	StepBackButton,
	StepNextButton,
	StepShell,
} from "../components/editorial-chrome";
import type { ImportedRepository, OnboardingStep } from "../types";

export function RepoImportStep({
	step,
	importedRepositories,
	githubImportProgress,
	isAddingLocalRepository,
	removingRepositoryIds,
	repoImportError,
	onAddLocalRepository,
	onOpenCloneDialog,
	onRemoveRepository,
	onBack,
	onComplete,
}: {
	step: OnboardingStep;
	importedRepositories: ImportedRepository[];
	githubImportProgress: number | null;
	isAddingLocalRepository: boolean;
	removingRepositoryIds: Set<string>;
	repoImportError: string | null;
	onAddLocalRepository: () => void;
	onOpenCloneDialog: () => void;
	onRemoveRepository: (repoId: string) => void;
	onBack: () => void;
	onComplete: () => void;
}) {
	return (
		<StepShell
			active={step === "repoImport"}
			ariaLabel="Bring in your first repositories"
			metaLabel="Pathos · Workshop"
			step={5}
			title="Bring in your first repositories"
			subtitle="Start with a local project, or pull a remote repository from GitHub. You can add more than one before entering Pathos."
			footer={
				<>
					<StepBackButton onClick={onBack} />
					<StepNextButton label="Let's ship it" onClick={onComplete} />
				</>
			}
		>
			<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
				<RepoSourceCard
					icon={<FolderOpen className="size-4" strokeWidth={1.7} />}
					title="Choose local project"
					description="Add a folder already on this machine."
					onClick={onAddLocalRepository}
					disabled={isAddingLocalRepository}
				/>
				<RepoSourceCard
					icon={<Cloud className="size-4" strokeWidth={1.7} />}
					title="Import from GitHub"
					description="Clone a remote project into Pathos."
					onClick={onOpenCloneDialog}
					disabled={githubImportProgress !== null}
					progress={githubImportProgress}
				/>
			</div>

			{repoImportError ? (
				<p
					role="alert"
					className="mt-4 text-[12.5px] leading-[1.5] text-destructive/85"
				>
					{repoImportError}
				</p>
			) : null}

			<div className="mt-7 flex flex-col">
				<div className="mb-2.5 flex items-center justify-between gap-3 px-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
					<span>Imported</span>
					{importedRepositories.length > 0 ? (
						<span className="tabular-nums text-foreground/55">
							{importedRepositories.length.toString().padStart(2, "0")}
						</span>
					) : null}
				</div>
				<div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm">
					{importedRepositories.length > 0 ? (
						<ul className="flex flex-col">
							{importedRepositories.map((repo) => (
								<li
									key={repo.id}
									className="flex items-center gap-3 border-t border-border/50 px-3.5 py-3 first:border-t-0"
								>
									<div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.02] text-muted-foreground">
										{repo.source === "local" ? (
											<FolderOpen className="size-3.5" strokeWidth={1.7} />
										) : (
											<Cloud className="size-3.5" strokeWidth={1.7} />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[13px] font-medium leading-tight text-foreground">
											{repo.name}
										</div>
										<div className="mt-0.5 truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground/75">
											{repo.detail}
										</div>
									</div>
									<button
										type="button"
										aria-label={`Remove ${repo.name}`}
										disabled={removingRepositoryIds.has(repo.id)}
										onClick={() => {
											onRemoveRepository(repo.id);
										}}
										className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-default disabled:opacity-50"
									>
										<X className="size-3.5" strokeWidth={1.7} />
									</button>
								</li>
							))}
						</ul>
					) : (
						<div className="flex min-h-[120px] items-center justify-center px-4 py-7 text-center text-[12.5px] leading-[1.55] text-muted-foreground">
							Choose a local folder or import from GitHub to build your first
							queue.
						</div>
					)}
				</div>
			</div>
		</StepShell>
	);
}

function RepoSourceCard({
	icon,
	title,
	description,
	onClick,
	disabled,
	progress,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
	progress?: number | null;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"group/source relative flex cursor-pointer flex-col items-start overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 text-left transition-colors duration-300 ease-out",
				"hover:border-border hover:bg-card/60",
				"disabled:cursor-default disabled:opacity-70",
			)}
		>
			<div className="flex size-9 items-center justify-center rounded-md border border-border/60 bg-foreground/[0.02] text-foreground/85 transition-colors group-hover/source:border-border">
				{icon}
			</div>
			<div className="mt-4 text-[14px] font-medium leading-tight text-foreground">
				{title}
			</div>
			<p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
				{description}
			</p>
			{progress !== undefined && progress !== null ? (
				<div className="mt-4 h-px w-full overflow-hidden bg-foreground/10">
					<div
						className="h-full bg-foreground/40 transition-[width] duration-200"
						style={{ width: `${progress}%` }}
					/>
				</div>
			) : null}
		</button>
	);
}
