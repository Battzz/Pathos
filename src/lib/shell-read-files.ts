const FILE_READING_COMMANDS = new Set([
	"cat",
	"head",
	"tail",
	"nl",
	"less",
	"more",
	"bat",
	"tac",
	"sed",
]);

const OPTION_VALUE_FLAGS = new Set([
	"--lines",
	"-c",
	"--bytes",
	"-s",
	"--style",
	"--theme",
	"--language",
]);

export function extractShellReadFilePaths(command: string): string[] {
	const inner = unwrapShell(command);
	if (!inner || hasOutputRedirect(inner)) return [];

	const paths: string[] = [];
	for (const segment of splitShellSegments(inner)) {
		const firstPipelineSegment = splitUnquoted(segment, "|")[0]?.trim() ?? "";
		if (!firstPipelineSegment) continue;

		const tokens = tokenizeShell(firstPipelineSegment);
		const commandIndex = tokens.findIndex(
			(token) => token && (!token.includes("=") || token.startsWith("-")),
		);
		if (commandIndex < 0) continue;

		const commandName = basenameToken(tokens[commandIndex]!);
		if (!FILE_READING_COMMANDS.has(commandName)) continue;

		for (const path of extractPathTokens(
			commandName,
			tokens.slice(commandIndex + 1),
		)) {
			if (!paths.includes(path)) {
				paths.push(path);
			}
		}
	}
	return paths;
}

function extractPathTokens(commandName: string, args: string[]): string[] {
	const positional: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const token = args[index]!;
		if (!token || token === "--") continue;
		if (
			OPTION_VALUE_FLAGS.has(token) ||
			(commandName !== "sed" && token === "-n")
		) {
			index += 1;
			continue;
		}
		if (token.startsWith("-")) continue;
		positional.push(token);
	}

	if (commandName === "sed") {
		return positional.slice(1).filter(looksLikePath);
	}
	return positional.filter(looksLikePath);
}

function looksLikePath(token: string): boolean {
	if (!token || token === "-") return false;
	if (/^\d+(,\d+)?p$/.test(token)) return false;
	return (
		token.includes("/") ||
		token.includes(".") ||
		token.startsWith("~") ||
		token.startsWith("$")
	);
}

function unwrapShell(command: string): string {
	const trimmed = command.trim();
	const base = trimmed.split(/\s+/, 1)[0]?.split("/").pop() ?? "";
	if (!["sh", "bash", "zsh", "fish", "dash"].includes(base)) {
		return trimmed;
	}

	let rest = trimmed.slice(trimmed.indexOf(base) + base.length).trimStart();
	while (rest.startsWith("-")) {
		const match = rest.match(/^\S+/);
		if (!match) break;
		rest = rest.slice(match[0].length).trimStart();
	}

	if (
		(rest.startsWith('"') && rest.endsWith('"')) ||
		(rest.startsWith("'") && rest.endsWith("'"))
	) {
		return rest.slice(1, -1);
	}
	return rest;
}

function hasOutputRedirect(command: string): boolean {
	let quote: string | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index]!;
		if (quote) {
			if (char === "\\" && quote === '"') {
				index += 1;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
		} else if (char === ">") {
			return true;
		}
	}
	return false;
}

function splitShellSegments(command: string): string[] {
	const segments: string[] = [];
	let start = 0;
	let quote: string | null = null;

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index]!;
		if (quote) {
			if (char === "\\" && quote === '"') {
				index += 1;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === ";" || (char === "&" && command[index + 1] === "&")) {
			segments.push(command.slice(start, index));
			if (char === "&") index += 1;
			start = index + 1;
		}
	}
	segments.push(command.slice(start));
	return segments;
}

function splitUnquoted(command: string, separator: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let quote: string | null = null;

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index]!;
		if (quote) {
			if (char === "\\" && quote === '"') {
				index += 1;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (char === separator) {
			parts.push(command.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(command.slice(start));
	return parts;
}

function tokenizeShell(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: string | null = null;

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index]!;
		if (quote) {
			if (char === "\\" && quote === '"' && index + 1 < command.length) {
				index += 1;
				current += command[index]!;
			} else if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		if (char === "\\" && index + 1 < command.length) {
			index += 1;
			current += command[index]!;
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}

function basenameToken(token: string): string {
	return token.split("/").pop() ?? token;
}
