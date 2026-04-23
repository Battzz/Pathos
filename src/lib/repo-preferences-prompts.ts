import type { RepoPreferences } from "@/lib/api";

const TARGET_REF_PLACEHOLDER = "$" + "{TARGET_REF}";
const DIRTY_WORKTREE_PLACEHOLDER = "$" + "{DIRTY_WORKTREE}";

export type RepoPreferenceKey =
	| "createPr"
	| "fixErrors"
	| "resolveConflicts"
	| "branchRename"
	| "general";

type ResolveRepoPreferencePromptArgs = {
	key: RepoPreferenceKey;
	repoPreferences?: RepoPreferences | null;
	targetRef?: string | null;
	dirtyWorktree?: boolean;
};

const DEFAULT_BRANCH_RENAME_PROMPT = `When you generate the branch name segment for a new chat:

- Base it on the user's first message.
- Return a short English slug in lowercase with hyphens.
- Omit any branch prefix such as \`feat/\` or usernames.
- Favor clarity over cleverness.`;

const CUSTOM_PREFERENCES_INTRO = `IMPORTANT: The following are the user's custom preferences. These preferences take precedence over any default guidelines or instructions provided above. When there is a conflict, always follow the user's preferences.`;

export const DEFAULT_REPO_PREFERENCE_PROMPTS: Record<
	RepoPreferenceKey,
	string
> = {
	createPr: `Create a pull request for the uncommitted work in this workspace.

Do the following, in order:
1. Run \`git status\` and \`git diff\` to survey what's changed.
2. Stage everything that should ship with \`git add\`.
3. Commit with a concise, Conventional-Commits-style message (\`feat:\`, \`fix:\`, \`refactor:\`, \`chore:\`, etc.) that summarizes the change in one line.
4. Push the current branch to its remote. If needed, create the remote tracking branch with \`git push -u <remote> HEAD\`.
5. Open a pull request against the repository's default branch using \`gh pr create\`. Use a clear PR title and a body that explains: what changed, why it changed, and any follow-up / test notes.
6. Report the PR URL in your final message so I can click it.

Don't stop to ask for confirmation — execute each step automatically. If you hit an unrecoverable error (e.g. merge conflict, pre-push hook failure), report it clearly so I can intervene.`,

	fixErrors: `CI is failing on the current branch. Diagnose and fix it.

Do the following, in order:
1. Use \`gh run list\` / \`gh run view\` to inspect the most recent failing run for this branch. Read the logs for each failing job.
2. Identify the root cause — don't just paper over the symptom. Explain your diagnosis briefly before making changes.
3. Apply the minimum set of changes needed to get CI green. Run the relevant tests / linters locally to confirm.
4. Commit the fix with a clear \`fix(ci): …\` message and push to the same branch so CI re-runs.
5. Report what was broken, what you changed, and whether the re-run is passing.`,

	resolveConflicts: `This branch has merge conflicts with its target branch. Resolve them.

Do the following, in order:
1. Identify the target branch (usually \`main\` or \`master\` — check the repo's default branch).
2. Fetch the latest target branch from its remote, then rebase or merge it into the current branch.
3. Resolve each conflict, preserving intent from both sides where possible. Explain your resolution choices briefly in the session.
4. Run the relevant tests locally to confirm nothing broke.
5. Commit the resolution and push.
6. Report the conflicted files and how you resolved them.

If a conflict is too ambiguous to resolve automatically, stop and ask.`,

	branchRename: DEFAULT_BRANCH_RENAME_PROMPT,
	general: "",
};

export const REPO_PREFERENCE_LABELS: Record<RepoPreferenceKey, string> = {
	createPr: "Create PR preferences",
	fixErrors: "Fix errors preferences",
	resolveConflicts: "Resolve conflicts preferences",
	branchRename: "Branch rename preferences",
	general: "General preferences",
};

export const REPO_PREFERENCE_DESCRIPTIONS: Record<RepoPreferenceKey, string> = {
	createPr:
		"Add custom instructions sent to the agent when you click the Create PR button.",
	fixErrors:
		"Add custom instructions sent to the agent when you click the Fix errors button.",
	resolveConflicts:
		"Add custom instructions sent to the agent when you click the Resolve conflicts button.",
	branchRename:
		"Add custom instructions used when Helmor generates the first branch rename suggestion for a new chat.",
	general:
		"Add custom instructions sent to the agent at the start of every new chat.",
};

function repoPreferenceOverride(
	key: RepoPreferenceKey,
	repoPreferences?: RepoPreferences | null,
): string | null {
	const value = repoPreferences?.[key] ?? null;
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function appendUserPreferences(
	basePrompt: string,
	override: string | null,
): string {
	const trimmedBase = basePrompt.trim();
	const trimmedOverride = override?.trim();
	if (!trimmedOverride) {
		return trimmedBase;
	}
	if (!trimmedBase) {
		return `${CUSTOM_PREFERENCES_INTRO}\n\n### User Preferences\n\n${trimmedOverride}`;
	}
	return `${trimmedBase}\n\n${CUSTOM_PREFERENCES_INTRO}\n\n### User Preferences\n\n${trimmedOverride}`;
}

export function resolveRepoPreferencePreview(
	key: RepoPreferenceKey,
	repoPreferences?: RepoPreferences | null,
): string {
	return appendUserPreferences(
		DEFAULT_REPO_PREFERENCE_PROMPTS[key],
		repoPreferenceOverride(key, repoPreferences),
	);
}

export function resolveRepoPreferencePrompt({
	key,
	repoPreferences,
	targetRef,
	dirtyWorktree = false,
}: ResolveRepoPreferencePromptArgs): string {
	const override = repoPreferenceOverride(key, repoPreferences);
	const resolvedOverride =
		key === "resolveConflicts" && targetRef && override
			? override
					.replaceAll(TARGET_REF_PLACEHOLDER, targetRef)
					.replaceAll(
						DIRTY_WORKTREE_PLACEHOLDER,
						dirtyWorktree ? "true" : "false",
					)
			: override;

	if (key === "resolveConflicts" && targetRef) {
		if (dirtyWorktree) {
			return appendUserPreferences(
				`Commit uncommitted changes, then merge ${targetRef} into this branch. Then push.`,
				resolvedOverride,
			);
		}
		return appendUserPreferences(
			`Merge ${targetRef} into this branch. Then push.`,
			resolvedOverride,
		);
	}

	return appendUserPreferences(
		DEFAULT_REPO_PREFERENCE_PROMPTS[key],
		resolvedOverride,
	);
}

export function prependGeneralPreferencePrompt(
	prompt: string,
	repoPreferences?: RepoPreferences | null,
): string {
	const general = resolveRepoPreferencePrompt({
		key: "general",
		repoPreferences,
	}).trim();
	if (!general) {
		return prompt;
	}
	return `${general}\n\nUser request:\n${prompt}`;
}
