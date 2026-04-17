/**
 * Stage Claude Code + Codex CLI binaries into `sidecar/dist/vendor/` so
 * Tauri can bundle them as `bundle.resources` and ship them inside the
 * `.app` payload — no reliance on system-wide `claude` / `codex` installs.
 *
 * Layout produced (macOS host only):
 *
 *   dist/vendor/
 *     claude-code/
 *       cli.js
 *       vendor/ripgrep/<arch>-darwin/rg
 *       vendor/audio-capture/<arch>-darwin/audio-capture.node
 *     codex/
 *       codex
 *     bun/
 *       bun
 *
 * Invariants:
 *   - `cli.js` needs `vendor/` adjacent (Claude Code resolves its own
 *     ripgrep via `path.join(dirname(cli.js), "vendor", "ripgrep", ...)`).
 *   - Only the host-arch subdirs are copied.
 *   - Re-runnable — wipes `dist/vendor/` before copying.
 *
 * Why bundle bun: the Claude Agent SDK spawns `cli.js` through a JS
 * interpreter (bun/node) resolved off PATH. A Finder-launched `.app`
 * inherits a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) that contains
 * neither, so we ship the host's bun and point the SDK's `executable`
 * option at an absolute path inside `Contents/Resources/vendor/bun/`.
 */

import { execFileSync, execSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIDECAR_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODE_MODULES = join(SIDECAR_ROOT, "node_modules");
const DIST_VENDOR = join(SIDECAR_ROOT, "dist", "vendor");

// ---------------------------------------------------------------------------
// Platform detection — macOS only, arch varies (arm64 / x64)
// ---------------------------------------------------------------------------

type NodeArch = "arm64" | "x64";

interface TargetInfo {
	/** `@anthropic-ai/claude-code` uses `<arch>-darwin` naming. */
	ccVendorArch: string;
	/** `@openai/codex-darwin-<arch>` is the npm optional-dep package. */
	codexPkg: string;
	/** Target triple used as the subdir inside the codex platform package. */
	codexTriple: string;
}

function detectTarget(): TargetInfo {
	if (process.platform !== "darwin") {
		throw new Error(
			`[stage-vendor] Helmor only builds on macOS; host platform is ${process.platform}`,
		);
	}
	const arch = process.arch as NodeArch;

	switch (arch) {
		case "arm64":
			return {
				ccVendorArch: "arm64-darwin",
				codexPkg: "@openai/codex-darwin-arm64",
				codexTriple: "aarch64-apple-darwin",
			};
		case "x64":
			return {
				ccVendorArch: "x64-darwin",
				codexPkg: "@openai/codex-darwin-x64",
				codexTriple: "x86_64-apple-darwin",
			};
		default:
			throw new Error(`[stage-vendor] Unsupported macOS arch: ${arch}`);
	}
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function ensureExists(path: string, label: string): void {
	if (!existsSync(path)) {
		throw new Error(
			`[stage-vendor] expected ${label} at ${path} — run \`bun install\` in sidecar/ first`,
		);
	}
}

function copyFile(src: string, dest: string): void {
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(src, dest);
}

function copyDir(src: string, dest: string): void {
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(src, dest, { recursive: true });
}

function humanSize(path: string): string {
	if (!existsSync(path)) return "(missing)";
	let bytes = 0;
	const walk = (p: string): void => {
		const s = statSync(p);
		if (s.isDirectory()) {
			for (const entry of readdirSync(p)) {
				walk(join(p, entry));
			}
		} else if (s.isFile()) {
			bytes += s.size;
		}
	};
	walk(path);
	if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
}

// Shared entitlements plist — Bun's JSC JIT needs allow-jit +
// allow-unsigned-executable-memory under hardened runtime, otherwise
// spawn fails with "Ran out of executable memory while allocating N bytes".
const ENTITLEMENTS_PLIST = join(
	SIDECAR_ROOT,
	"..",
	"src-tauri",
	"Entitlements.plist",
);

function maybeSignMacBinary(path: string, withEntitlements: boolean): void {
	const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
	if (!identity) return;

	const args = [
		"--force",
		"--sign",
		identity,
		"--timestamp",
		"--options",
		"runtime",
	];
	if (withEntitlements) {
		if (!existsSync(ENTITLEMENTS_PLIST)) {
			throw new Error(
				`[stage-vendor] Entitlements.plist missing at ${ENTITLEMENTS_PLIST}`,
			);
		}
		args.push("--entitlements", ENTITLEMENTS_PLIST);
	}
	args.push(path);

	console.log(
		`[stage-vendor] signing ${path}${withEntitlements ? " (+entitlements)" : ""}`,
	);
	execFileSync("codesign", args, { stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const target = detectTarget();

console.log(
	`[stage-vendor] host=darwin/${process.arch} ccArch=${target.ccVendorArch} codexPkg=${target.codexPkg}`,
);

// Clean
rmSync(DIST_VENDOR, { recursive: true, force: true });
mkdirSync(DIST_VENDOR, { recursive: true });

// ----- Claude Code -----
const ccSrc = join(NODE_MODULES, "@anthropic-ai/claude-code");
const ccDest = join(DIST_VENDOR, "claude-code");
ensureExists(join(ccSrc, "cli.js"), "@anthropic-ai/claude-code/cli.js");

copyFile(join(ccSrc, "cli.js"), join(ccDest, "cli.js"));

// Host-arch subset of claude-code's vendor dirs. cli.js resolves these
// relative to itself at runtime; any missing subdir just disables that
// particular feature (ripgrep → /search, audio-capture → voice I/O).
const ccVendorSubdirs = ["ripgrep", "audio-capture"] as const;
for (const sub of ccVendorSubdirs) {
	const from = join(ccSrc, "vendor", sub, target.ccVendorArch);
	if (existsSync(from)) {
		copyDir(from, join(ccDest, "vendor", sub, target.ccVendorArch));
	}
}

// ----- Codex -----
const codexSrc = join(
	NODE_MODULES,
	target.codexPkg,
	"vendor",
	target.codexTriple,
	"codex",
	"codex",
);
ensureExists(codexSrc, `${target.codexPkg} codex binary`);

const codexDest = join(DIST_VENDOR, "codex", "codex");
copyFile(codexSrc, codexDest);
chmodSync(codexDest, 0o755);
maybeSignMacBinary(codexDest, false);

// ----- Bun (JS runtime for cli.js) -----
function locateHostBun(): string {
	try {
		const raw =
			execSync("which bun", { encoding: "utf8" }).trim().split("\n")[0] ?? "";
		if (!raw) throw new Error("empty output");
		// Homebrew ships bun as a symlink; resolve to the real Mach-O.
		return realpathSync(raw);
	} catch {
		throw new Error(
			"[stage-vendor] bun not found on PATH — install Bun (https://bun.sh) on the build host. " +
				"The Claude Agent SDK needs a JS runtime to execute cli.js, and `.app` bundles cannot rely " +
				"on the user's PATH. We ship the host's bun binary inside Helmor.app/Contents/Resources/vendor/bun/.",
		);
	}
}

const bunSrc = locateHostBun();
const bunDest = join(DIST_VENDOR, "bun", "bun");
copyFile(bunSrc, bunDest);
chmodSync(bunDest, 0o755);
maybeSignMacBinary(bunDest, true);

for (const rel of [
	join(ccDest, "vendor", "ripgrep", target.ccVendorArch, "rg"),
	join(
		ccDest,
		"vendor",
		"audio-capture",
		target.ccVendorArch,
		"audio-capture.node",
	),
]) {
	if (existsSync(rel)) {
		maybeSignMacBinary(rel, false);
	}
}

// ----- Summary -----
console.log(`[stage-vendor] ✓ staged → ${DIST_VENDOR}`);
console.log(`  claude-code ${humanSize(ccDest)}`);
console.log(`  codex       ${humanSize(join(DIST_VENDOR, "codex"))}`);
console.log(`  bun         ${humanSize(join(DIST_VENDOR, "bun"))}`);
