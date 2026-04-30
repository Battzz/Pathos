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
			chapter={{ number: "V", name: "Workshop" }}
			folio="Folio 5 of 5"
			title={
				<>
					Bring in your first <em className="not-italic">repositories</em>.
				</>
			}
			subtitle={
				<>
					Start with a local project, or pull a remote repository from GitHub.
					You can add more than one before entering Pathos.
				</>
			}
			footer={
				<>
					<StepBackButton onClick={onBack} />
					<StepNextButton label="Let's ship it" onClick={onComplete} />
				</>
			}
		>
			<div className="flex flex-col gap-8">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<RepoSourceCard
						icon={<FolderOpen className="size-5" strokeWidth={1.6} />}
						title="Choose local project"
						description="Add a folder already on this machine."
						onClick={onAddLocalRepository}
						disabled={isAddingLocalRepository}
					/>
					<RepoSourceCard
						icon={<Cloud className="size-5" strokeWidth={1.6} />}
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
						className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-destructive/85"
					>
						{repoImportError}
					</p>
				) : null}

				<div className="flex flex-col">
					<div className="mb-3 flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.32em] text-muted-foreground/65">
						<div className="flex items-center gap-3">
							<span aria-hidden className="block h-px w-7 bg-foreground/25" />
							<span>Imported repositories</span>
						</div>
						{importedRepositories.length > 0 ? (
							<span className="text-foreground/55">
								{importedRepositories.length.toString().padStart(2, "0")}
							</span>
						) : null}
					</div>
					<div className="rounded-xl border border-border/30 bg-foreground/[0.015] p-2">
						{importedRepositories.length > 0 ? (
							<ul className="flex flex-col">
								{importedRepositories.map((repo) => (
									<li
										key={repo.id}
										className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border/25 px-3 py-3 first:border-t-0"
									>
										<div className="flex size-7 items-center justify-center rounded-md border border-border/40 text-muted-foreground/85">
											{repo.source === "local" ? (
												<FolderOpen className="size-3.5" strokeWidth={1.6} />
											) : (
												<Cloud className="size-3.5" strokeWidth={1.6} />
											)}
										</div>
										<div className="min-w-0">
											<div className="truncate text-[14px] font-medium leading-tight text-foreground/95">
												{repo.name}
											</div>
											<div className="truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground/55">
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
											<X className="size-3.5" strokeWidth={1.6} />
										</button>
									</li>
								))}
							</ul>
						) : (
							<div className="flex min-h-[160px] items-center justify-center px-4 py-8 text-center text-[13px] leading-[1.55] text-muted-foreground/65">
								Choose a local folder or import from GitHub to build your first
								queue.
							</div>
						)}
					</div>
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
				"group/source relative flex flex-col items-start overflow-hidden rounded-xl border border-border/40 bg-foreground/[0.015] p-6 text-left transition-[background-color,border-color,transform] duration-300 ease-out",
				"hover:-translate-y-px hover:border-border/65 hover:bg-foreground/[0.03]",
				"disabled:cursor-default disabled:opacity-70",
			)}
		>
			<div className="flex size-11 items-center justify-center rounded-full border border-border/45 text-foreground/85 transition-colors group-hover/source:border-foreground/30">
				{icon}
			</div>
			<div className="mt-5 font-display text-[24px] leading-none text-foreground/95">
				{title}
			</div>
			<p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground/85">
				{description}
			</p>
			{progress !== undefined && progress !== null ? (
				<div className="mt-5 h-px w-full overflow-hidden bg-foreground/10">
					<div
						className="h-full bg-[color:var(--editorial-accent)] transition-[width] duration-200"
						style={{ width: `${progress}%` }}
					/>
				</div>
			) : null}
		</button>
	);
}
