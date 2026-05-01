const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	c: "c",
	cjs: "js",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	go: "go",
	h: "c",
	hpp: "cpp",
	html: "html",
	java: "java",
	js: "js",
	json: "json",
	jsonc: "jsonc",
	jsx: "jsx",
	kt: "kotlin",
	lua: "lua",
	md: "md",
	mdx: "mdx",
	mjs: "js",
	py: "py",
	rb: "ruby",
	rs: "rust",
	sh: "bash",
	sql: "sql",
	svelte: "svelte",
	swift: "swift",
	toml: "toml",
	ts: "ts",
	tsx: "tsx",
	vue: "vue",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
	dockerfile: "dockerfile",
	makefile: "make",
};

export function inferLanguageFromPath(path: string | null | undefined) {
	if (!path) {
		return null;
	}
	const fileName = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
	if (!fileName) {
		return null;
	}
	const byName = LANGUAGE_BY_FILENAME[fileName];
	if (byName) {
		return byName;
	}
	const extension = fileName.includes(".")
		? fileName.slice(fileName.lastIndexOf(".") + 1)
		: "";
	return LANGUAGE_BY_EXTENSION[extension] ?? null;
}
