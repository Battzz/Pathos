import {
	ChevronLeft,
	Cloud,
	GitBranch,
	GitBranchPlus,
	LoaderCircle,
	Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { CommandPopoverContent } from "@/components/ui/command-popover";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import type { WorkspaceBranches } from "@/lib/api";
import { cn } from "@/lib/utils";

const scrollbarStyle = `
.branch-switcher [data-slot="command-list"]::-webkit-scrollbar { width: 3px; background: transparent; }
.branch-switcher [data-slot="command-list"]::-webkit-scrollbar-track { background: transparent; }
.branch-switcher [data-slot="command-list"]::-webkit-scrollbar-thumb { border-radius: 999px; background: color-mix(in oklch, var(--foreground) 18%, transparent); }
.branch-switcher [data-slot="command-list"] { scrollbar-width: thin; }
`;

export function BranchSwitcherPopover({
	branches,
	loading,
	onOpen,
	onSelect,
	onCreate,
	onDeleteLocal,
	onDeleteRemote,
	align = "start",
	children,
}: {
	branches: WorkspaceBranches | null;
	loading: boolean;
	onOpen: () => void;
	onSelect: (branch: string) => void;
	onCreate: (branch: string) => Promise<void> | void;
	onDeleteLocal?: (branch: string) => Promise<void> | void;
	onDeleteRemote?: (branch: string) => Promise<void> | void;
	align?: "start" | "center" | "end";
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		if (!open) {
			setCreating(false);
		}
	}, [open]);

	const local = branches?.local ?? [];
	const remote = branches?.remote ?? [];
	const current = branches?.current ?? null;

	return (
		<Popover
			open={open}
			onOpenChange={(next: boolean) => {
				setOpen(next);
				if (next) onOpen();
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<CommandPopoverContent align={align} className="w-[280px]">
				<style>{scrollbarStyle}</style>
				<div className="branch-switcher select-none">
					{creating ? (
						<CreateBranchForm
							currentBranch={current}
							onCancel={() => setCreating(false)}
							onCreate={async (name) => {
								await onCreate(name);
								setOpen(false);
							}}
						/>
					) : (
						<>
							<CommandInput
								placeholder="Search branches..."
								className="select-text"
							/>
							<CommandList
								className="max-h-60 px-1"
								style={{ marginRight: -3 }}
							>
								{loading && local.length === 0 && remote.length === 0 ? (
									<div className="flex items-center justify-center gap-2 py-5 text-[12px] text-muted-foreground">
										<LoaderCircle
											className="size-3.5 animate-spin"
											strokeWidth={2}
										/>
										Loading branches...
									</div>
								) : null}
								<CommandEmpty>No branches found</CommandEmpty>
								{local.length > 0 ? (
									<CommandGroup heading="Local">
										{local.map((branch) => (
											<BranchItem
												key={`local-${branch}`}
												value={`local ${branch}`}
												branch={branch}
												isCurrent={branch === current}
												canDelete={Boolean(onDeleteLocal) && branch !== current}
												onSelect={() => {
													onSelect(branch);
													setOpen(false);
												}}
												onDelete={
													onDeleteLocal
														? () => onDeleteLocal(branch)
														: undefined
												}
											/>
										))}
									</CommandGroup>
								) : null}
								{remote.length > 0 ? (
									<>
										{local.length > 0 ? <CommandSeparator /> : null}
										<CommandGroup heading="Remote">
											{remote.map((branch) => (
												<BranchItem
													key={`remote-${branch}`}
													value={`remote ${branch}`}
													branch={branch}
													isRemote
													canDelete={Boolean(onDeleteRemote)}
													onSelect={() => {
														onSelect(branch);
														setOpen(false);
													}}
													onDelete={
														onDeleteRemote
															? () => onDeleteRemote(branch)
															: undefined
													}
												/>
											))}
										</CommandGroup>
									</>
								) : null}
							</CommandList>
							<div className="-mx-1 mt-1 border-t border-border/60 pt-1">
								<button
									type="button"
									onClick={() => setCreating(true)}
									className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground hover:bg-muted"
								>
									<GitBranchPlus
										className="size-3.5 text-muted-foreground"
										strokeWidth={2}
									/>
									<span>Create and checkout new branch</span>
								</button>
							</div>
						</>
					)}
				</div>
			</CommandPopoverContent>
		</Popover>
	);
}

function BranchItem({
	value,
	branch,
	isCurrent = false,
	isRemote = false,
	canDelete,
	onSelect,
	onDelete,
}: {
	value: string;
	branch: string;
	isCurrent?: boolean;
	isRemote?: boolean;
	canDelete: boolean;
	onSelect: () => void;
	onDelete?: () => Promise<void> | void;
}) {
	const [deleting, setDeleting] = useState(false);

	const handleDelete = async (
		event: React.MouseEvent | React.KeyboardEvent,
	) => {
		event.preventDefault();
		event.stopPropagation();
		if (!onDelete || deleting) return;
		setDeleting(true);
		try {
			await onDelete();
		} finally {
			setDeleting(false);
		}
	};

	const LocationIcon = isRemote ? Cloud : GitBranch;

	return (
		<CommandItem
			value={value}
			aria-current={isCurrent ? "true" : undefined}
			onSelect={() => {
				if (deleting) return;
				onSelect();
			}}
			className={cn(
				"group/branch-item rounded-md text-[12px] data-selected:bg-muted/25",
				isCurrent && "bg-foreground/[0.04]",
			)}
		>
			<LocationIcon
				className={cn(
					"size-3.5 shrink-0",
					isRemote ? "text-muted-foreground/70" : "text-muted-foreground",
				)}
				strokeWidth={2}
				aria-hidden="true"
			/>
			<span
				className={cn(
					"min-w-0 flex-1 truncate",
					isCurrent && "font-semibold",
					isRemote && "text-muted-foreground",
				)}
			>
				{branch}
			</span>
			{canDelete ? (
				<button
					type="button"
					data-slot="command-shortcut"
					aria-label={isRemote ? "Delete remote branch" : "Delete local branch"}
					onClick={handleDelete}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							void handleDelete(event);
						}
					}}
					disabled={deleting}
					className="ml-auto flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/branch-item:opacity-100 group-data-selected/command-item:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{deleting ? (
						<LoaderCircle className="size-3 animate-spin" strokeWidth={2} />
					) : (
						<Trash2 className="size-3" strokeWidth={2} />
					)}
				</button>
			) : null}
		</CommandItem>
	);
}

function CreateBranchForm({
	currentBranch,
	onCancel,
	onCreate,
}: {
	currentBranch: string | null;
	onCancel: () => void;
	onCreate: (branch: string) => Promise<void> | void;
}) {
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && !submitting;

	const submit = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		try {
			await onCreate(trimmed);
		} finally {
			setSubmitting(false);
		}
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void submit();
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-2 p-1">
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onCancel}
					disabled={submitting}
					aria-label="Back"
					className="-ml-0.5 flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				>
					<ChevronLeft className="size-3.5" strokeWidth={2} />
				</button>
				<div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[12.5px] font-medium text-foreground">
					<span>New branch</span>
					{currentBranch ? (
						<span className="flex min-w-0 items-baseline gap-1 text-[11px] font-normal text-muted-foreground">
							<span>from</span>
							<span className="truncate text-foreground/80">
								{currentBranch}
							</span>
						</span>
					) : null}
				</div>
			</div>
			<div className="flex h-8 items-center gap-1.5 rounded-md border border-input/30 bg-input/30 px-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
				<GitBranch
					className="size-3.5 shrink-0 text-muted-foreground"
					strokeWidth={2}
				/>
				<input
					ref={inputRef}
					value={name}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.stopPropagation();
							void submit();
						} else if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							onCancel();
						} else {
							// cmdk listens for Command/Ctrl shortcuts; let typing
							// stay local so the input doesn't fight the Command
							// primitive surrounding this form.
							event.stopPropagation();
						}
					}}
					placeholder="my-new-branch"
					disabled={submitting}
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					className="min-w-0 flex-1 select-text bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
				/>
			</div>
			<Button
				type="submit"
				size="xs"
				disabled={!canSubmit}
				className="w-full justify-center"
			>
				{submitting ? (
					<LoaderCircle
						className="size-3 animate-spin"
						strokeWidth={2}
						data-icon="inline-start"
					/>
				) : (
					<GitBranchPlus strokeWidth={2} data-icon="inline-start" />
				)}
				Create branch
			</Button>
		</form>
	);
}
