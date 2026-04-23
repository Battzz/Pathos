import type { WorkspaceCommitButtonMode } from "@/features/commit/button";
import type { RepoPreferences } from "@/lib/api";
import {
	type RepoPreferenceKey,
	resolveRepoPreferencePrompt,
} from "@/lib/repo-preferences-prompts";

type ActionSessionMode = Exclude<
	WorkspaceCommitButtonMode,
	"push" | "merge" | "closed" | "merged"
>;

const ACTION_MODE_TO_PREFERENCE_KEY: Record<
	ActionSessionMode,
	RepoPreferenceKey
> = {
	"create-pr": "createPr",
	"commit-and-push": "createPr",
	fix: "fixErrors",
	"resolve-conflicts": "resolveConflicts",
	"open-pr": "createPr",
};

export function buildCommitButtonPrompt(
	mode: ActionSessionMode,
	repoPreferences?: RepoPreferences | null,
): string {
	switch (mode) {
		case "commit-and-push":
			return `Commit and push all uncommitted work in this workspace.

Do the following, in order:
1. Run \`git status\` and \`git diff\` to survey what's changed.
2. Stage everything that should ship with \`git add\`.
3. Commit with a concise, Conventional-Commits-style message (\`feat:\`, \`fix:\`, \`refactor:\`, etc.) summarizing the change.
4. Push the current branch to its remote. If needed, create the remote tracking branch with \`git push -u <remote> HEAD\`.
5. Report the resulting commit SHA and pushed ref.

Don't stop to ask for confirmation — execute each step automatically. If a pre-commit / pre-push hook fails, report the failure and stop without force-pushing.`;
		case "open-pr":
			return `Reopen the closed pull request for this branch and leave a short comment explaining why it's being reopened.

Use \`gh pr reopen\` + \`gh pr comment\`. Report the PR URL when done.`;
		default:
			return resolveRepoPreferencePrompt({
				key: ACTION_MODE_TO_PREFERENCE_KEY[mode],
				repoPreferences,
			});
	}
}

export function isActionSessionMode(
	mode: WorkspaceCommitButtonMode,
): mode is ActionSessionMode {
	return (
		mode in ACTION_MODE_TO_PREFERENCE_KEY ||
		mode === "commit-and-push" ||
		mode === "open-pr"
	);
}

export function describeActionKind(actionKind: string): string {
	switch (actionKind) {
		case "create-pr":
			return "Create PR";
		case "commit-and-push":
			return "Commit and Push";
		case "fix":
			return "Fix CI";
		case "push":
			return "Push";
		case "resolve-conflicts":
			return "Resolve Conflicts";
		case "merge":
			return "Merge";
		case "open-pr":
			return "Open PR";
		case "merged":
			return "Merged";
		case "closed":
			return "Closed";
		default:
			return actionKind;
	}
}
