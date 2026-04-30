import {
	Bot,
	ClipboardCheck,
	ClipboardList,
	FilePlus,
	FileText,
	FolderSearch,
	Globe,
	MessageSquareMore,
	MessageSquareText,
	Pencil,
	Plug,
	Search,
	Sparkles,
	Terminal,
} from "lucide-react";
import { GithubBrandIcon } from "@/components/brand-icon";
import { extractShellReadFilePaths } from "@/lib/shell-read-files";
import type { FileChangeInfo, ToolInfo } from "./shared";
import { basename, isObj, str, truncate } from "./shared";

const fallbackIcon = (
	<span className="size-3.5 rounded-full bg-foreground/15" />
);
const neutralToolIconClassName = "size-3.5 text-muted-foreground";

export function getToolInfo(
	name: string,
	input: Record<string, unknown> | null,
): ToolInfo {
	if (name.startsWith("mcp__")) {
		const mcpInfo = parseMcpToolName(name);
		if (mcpInfo?.provider === "github") {
			return githubToolInfo(mcpInfo.tool, input ?? {});
		}
		return {
			action: mcpInfo?.tool ?? name,
			icon: <Plug className="size-3.5 text-chart-2" strokeWidth={1.8} />,
			detail: `via ${mcpInfo?.server ?? "mcp"}`,
		};
	}

	if (!input) {
		return { action: name, icon: fallbackIcon };
	}

	if (name === "Edit") {
		const filePath = str(input.file_path);
		const oldStr = typeof input.old_string === "string" ? input.old_string : "";
		const newStr = typeof input.new_string === "string" ? input.new_string : "";
		const diffDelete = oldStr ? oldStr.split("\n").length : 0;
		const diffAdd = newStr ? newStr.split("\n").length : 0;
		return {
			action: "Edit",
			file: filePath ? basename(filePath) : undefined,
			icon: <Pencil className={neutralToolIconClassName} strokeWidth={1.8} />,
			diffAdd,
			diffDel: diffDelete,
		};
	}

	if (name === "apply_patch") {
		const changes = Array.isArray(input.changes) ? input.changes : [];
		const parsed = changes.filter(isObj).map((c) => {
			const path = str(c.path);
			const diff = typeof c.diff === "string" ? c.diff : "";
			let add = 0;
			let del = 0;
			for (const line of diff.split("\n")) {
				if (line.startsWith("+") && !line.startsWith("+++")) add++;
				else if (line.startsWith("-") && !line.startsWith("---")) del++;
			}
			return {
				name: path ? basename(path) : "unknown",
				diffAdd: add || undefined,
				diffDel: del || undefined,
				rawDiff: diff || undefined,
			} satisfies FileChangeInfo;
		});
		const totalAdd = parsed.reduce((s, f) => s + (f.diffAdd ?? 0), 0);
		const totalDel = parsed.reduce((s, f) => s + (f.diffDel ?? 0), 0);
		const icon = (
			<Pencil className={neutralToolIconClassName} strokeWidth={1.8} />
		);

		if (parsed.length <= 1) {
			return {
				action: "Edit",
				file: parsed[0]?.name,
				icon,
				diffAdd: totalAdd || undefined,
				diffDel: totalDel || undefined,
				rawDiff: parsed[0]?.rawDiff,
			};
		}
		return {
			action: `Edit ${parsed.length} files`,
			icon,
			diffAdd: totalAdd || undefined,
			diffDel: totalDel || undefined,
			files: parsed,
		};
	}

	if (name === "Read") {
		const filePath = str(input.file_path);
		const limit = typeof input.limit === "number" ? input.limit : null;
		return {
			action: limit ? `Read ${limit} lines` : "Read",
			file: filePath ? basename(filePath) : undefined,
			icon: <FileText className={neutralToolIconClassName} strokeWidth={1.8} />,
		};
	}

	if (name === "Write") {
		const filePath = str(input.file_path);
		return {
			action: "Write",
			file: filePath ? basename(filePath) : undefined,
			icon: <FilePlus className={neutralToolIconClassName} strokeWidth={1.8} />,
		};
	}

	if (name === "Bash") {
		const command = str(input.command);
		const description = str(input.description);
		const readPaths = command ? extractShellReadFilePaths(command) : [];
		if (!description && readPaths.length === 1) {
			return {
				action: "Read",
				file: basename(readPaths[0]!),
				fileDisplay: "pill",
				icon: (
					<FileText className={neutralToolIconClassName} strokeWidth={1.8} />
				),
				fullCommand: command ?? undefined,
			};
		}
		if (!description && readPaths.length > 1) {
			return {
				action: `Read ${readPaths.length} files`,
				icon: (
					<FileText className={neutralToolIconClassName} strokeWidth={1.8} />
				),
				command: command ? truncate(command, 80) : undefined,
				fullCommand: command ?? undefined,
			};
		}
		return {
			action: description ?? "Run",
			icon: <Terminal className={neutralToolIconClassName} strokeWidth={1.8} />,
			command: command ? truncate(command, 80) : undefined,
			fullCommand: command ?? undefined,
		};
	}

	if (name === "Grep") {
		const pattern = str(input.pattern);
		return {
			action: "Grep",
			icon: <Search className={neutralToolIconClassName} strokeWidth={1.8} />,
			detail: pattern ?? undefined,
		};
	}

	if (name === "Glob") {
		const pattern = str(input.pattern);
		return {
			action: "Glob",
			icon: (
				<FolderSearch className={neutralToolIconClassName} strokeWidth={1.8} />
			),
			detail: pattern ?? undefined,
		};
	}

	if (name === "WebFetch") {
		const url = str(input.url);
		return {
			action: "WebFetch",
			icon: <Globe className={neutralToolIconClassName} strokeWidth={1.8} />,
			detail: url ? truncate(url, 60) : undefined,
		};
	}

	if (name === "WebSearch") {
		const icon = (
			<Globe className={neutralToolIconClassName} strokeWidth={1.8} />
		);
		const action = isObj(input.action) ? input.action : null;
		const actionType = action ? str(action.type) : null;
		if (actionType === "openPage") {
			const url = str(action!.url);
			return {
				action: "Open page",
				icon,
				detail: url ? truncate(url, 60) : undefined,
			};
		}
		if (actionType === "findInPage") {
			const pattern = str(action!.pattern) ?? str(action!.url);
			return {
				action: "Find in page",
				icon,
				detail: pattern ? truncate(pattern, 60) : undefined,
			};
		}
		const query = str(input.query);
		return {
			action: "WebSearch",
			icon,
			detail: query ? truncate(query, 50) : undefined,
		};
	}

	if (name === "ToolSearch") {
		const query = str(input.query);
		return {
			action: "ToolSearch",
			icon: <Search className={neutralToolIconClassName} strokeWidth={1.8} />,
			detail: query ? truncate(query, 50) : undefined,
		};
	}

	if (name === "Agent" || name === "Task") {
		const subagentType = str(input.subagent_type);
		const detail = str(input.description) ?? str(input.prompt);
		return {
			action: subagentType ?? name,
			icon: <Bot className={neutralToolIconClassName} strokeWidth={1.8} />,
			detail: detail ? truncate(detail, 60) : undefined,
		};
	}

	if (name === "Prompt") {
		const text = str(input.text);
		return {
			action: "Prompt",
			icon: (
				<MessageSquareText
					className={neutralToolIconClassName}
					strokeWidth={1.8}
				/>
			),
			body: text ?? undefined,
		};
	}

	if (name === "Skill") {
		const skillName =
			str(input.name) ??
			str(input.skill) ??
			str(input.command) ??
			str(input.id);
		return {
			action: "Skill",
			icon: <Sparkles className={neutralToolIconClassName} strokeWidth={1.8} />,
			detail: skillName ? truncate(skillName, 50) : undefined,
		};
	}

	if (
		name === "AskUserQuestion" ||
		name === "askUserQuestions" ||
		name === "vscode_askQuestions"
	) {
		const questions = Array.isArray(input.questions) ? input.questions : [];
		const firstQuestion = questions[0];
		const detail =
			str(input.question) ??
			str(input.prompt) ??
			(isObj(firstQuestion)
				? (str(firstQuestion.question) ?? str(firstQuestion.header))
				: null);
		return {
			action: "Ask user",
			icon: (
				<MessageSquareMore
					className={neutralToolIconClassName}
					strokeWidth={1.8}
				/>
			),
			detail: detail ? truncate(detail, 60) : undefined,
		};
	}

	if (name === "EnterPlanMode") {
		return {
			action: "Enter Plan mode",
			icon: (
				<ClipboardList className={neutralToolIconClassName} strokeWidth={1.8} />
			),
		};
	}

	if (name === "ExitPlanMode") {
		return {
			action: "Exit plan mode",
			icon: (
				<ClipboardCheck
					className={neutralToolIconClassName}
					strokeWidth={1.8}
				/>
			),
		};
	}

	return { action: name, icon: fallbackIcon };
}

function parseMcpToolName(
	name: string,
): { server: string; tool: string; provider?: "github" } | null {
	const segments = name.split("__").filter(Boolean);
	if (segments[0] !== "mcp" || segments.length < 3) {
		return null;
	}
	const providerIndex = segments.findIndex(
		(segment) => segment.toLowerCase() === "github",
	);
	if (providerIndex >= 0) {
		const tool =
			segments.slice(providerIndex + 1).join("__") || segments.at(-1);
		return {
			server: segments.slice(1, providerIndex).join("__") || "github",
			tool: tool ?? name,
			provider: "github",
		};
	}
	return {
		server: segments[1] ?? "mcp",
		tool: segments.slice(2).join("__") || name,
	};
}

function githubToolInfo(
	rawToolName: string,
	input: Record<string, unknown>,
): ToolInfo {
	const toolName = rawToolName.replace(/^_+/, "");
	const action = githubActionLabel(toolName);
	const detail = githubDetail(input);
	return {
		action,
		icon: <GithubBrandIcon className={neutralToolIconClassName} />,
		detail,
	};
}

function githubActionLabel(toolName: string): string {
	const parts = toolName.split("_").filter(Boolean);
	if (parts[0] === "github") {
		parts.shift();
	}
	if (parts.length === 0) {
		return "GitHub";
	}
	const [verb = "", ...rest] = parts;
	const object = rest
		.join(" ")
		.replace(/\bpr\b/g, "PR")
		.replace(/\brepo\b/g, "repo")
		.replace(/\burl\b/g, "URL")
		.replace(/\bid\b/g, "ID");
	const verbLabel =
		{
			add: "Add",
			check: "Check",
			close: "Close",
			compare: "Compare",
			convert: "Convert",
			create: "Create",
			delete: "Delete",
			dismiss: "Dismiss",
			download: "Download",
			enable: "Enable",
			fetch: "Fetch",
			get: "Get",
			label: "Label",
			list: "List",
			lock: "Lock",
			mark: "Mark",
			merge: "Merge",
			remove: "Remove",
			reply: "Reply",
			request: "Request",
			resolve: "Resolve",
			search: "Search",
			unlock: "Unlock",
			unresolve: "Unresolve",
			update: "Update",
		}[verb] ?? titleCase(verb);
	return object ? `${verbLabel} ${object}` : verbLabel;
}

function githubDetail(input: Record<string, unknown>): string | undefined {
	const repo = str(input.repo_full_name) ?? str(input.repository_full_name);
	const prNumber =
		typeof input.pr_number === "number" ? `#${input.pr_number}` : null;
	const issueNumber =
		typeof input.issue_number === "number"
			? `issue #${input.issue_number}`
			: null;
	const query = str(input.query);
	const path = str(input.path);
	const title = str(input.title);
	const parts = [repo, prNumber ?? issueNumber, title, path, query].filter(
		Boolean,
	);
	return parts.length > 0 ? truncate(parts.join(" "), 60) : undefined;
}

function titleCase(value: string): string {
	return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}
