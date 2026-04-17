#!/usr/bin/env node
/**
 * Sidecar staging script. Tauri invokes this via `beforeBuildCommand`.
 *
 * Steps:
 * 1. `cd sidecar && bun install --frozen-lockfile` (so CI runners have deps).
 * 2. `bun run build` — produces `sidecar/dist/helmor-sidecar` plus the
 *    `sidecar/dist/vendor/` tree that Tauri bundles as resources.
 * 3. Copy `sidecar/dist/helmor-sidecar` to
 *    `sidecar/dist/helmor-sidecar-<target-triple>` so Tauri's
 *    `externalBin: ["../sidecar/dist/helmor-sidecar"]` can find the
 *    target-suffixed artifact it expects.
 *
 * Usage (from repo root):
 *   node scripts/prepare-sidecar.mjs
 *   bun scripts/prepare-sidecar.mjs      # equivalent, Tauri uses this form
 */
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidecarDir = resolve(repoRoot, "sidecar");
const entitlementsPlist = resolve(repoRoot, "src-tauri", "Entitlements.plist");

function run(cmd, cwd) {
	console.log(`[prepare-sidecar] $ ${cmd} (cwd: ${cwd})`);
	execSync(cmd, { cwd, stdio: "inherit" });
}

// Pre-sign the compiled sidecar with JIT entitlements so Bun's JSC runtime
// can allocate executable memory under hardened runtime. Tauri may re-sign
// this binary during bundling, but codesign preserves the entitlements blob
// unless --entitlements is passed again with a different plist.
function signSidecarWithEntitlements(path) {
	const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
	if (!identity) {
		console.log(
			"[prepare-sidecar] APPLE_SIGNING_IDENTITY unset — skipping sidecar pre-sign (dev / unsigned build)",
		);
		return;
	}
	if (!existsSync(entitlementsPlist)) {
		throw new Error(
			`[prepare-sidecar] Entitlements.plist missing at ${entitlementsPlist}`,
		);
	}
	console.log(`[prepare-sidecar] codesign (+entitlements) ${path}`);
	execFileSync(
		"codesign",
		[
			"--force",
			"--sign",
			identity,
			"--timestamp",
			"--options",
			"runtime",
			"--entitlements",
			entitlementsPlist,
			path,
		],
		{ stdio: "inherit" },
	);
}

function detectTargetTriple() {
	const override = process.env.TAURI_TARGET_TRIPLE?.trim();
	if (override) {
		return override;
	}
	const output = execSync("rustc --print host-tuple", {
		encoding: "utf8",
	}).trim();
	if (!output) {
		throw new Error("`rustc --print host-tuple` returned empty output");
	}
	return output;
}

function main() {
	// 1. Install sidecar deps (idempotent; fast when lockfile matches).
	run("bun install --frozen-lockfile", sidecarDir);

	// 2. Build the compiled sidecar + staged vendor tree.
	run("bun run build", sidecarDir);

	const triple = detectTargetTriple();
	const source = resolve(sidecarDir, "dist", "helmor-sidecar");
	const destination = resolve(sidecarDir, "dist", `helmor-sidecar-${triple}`);

	if (!existsSync(source)) {
		throw new Error(
			`[prepare-sidecar] expected compiled sidecar at ${source} but it does not exist`,
		);
	}
	copyFileSync(source, destination);

	// Sign the target-suffixed copy (the one Tauri ingests as externalBin).
	// No-op when APPLE_SIGNING_IDENTITY is unset.
	signSidecarWithEntitlements(destination);

	console.log(`[prepare-sidecar] staged → ${destination}`);
}

main();
