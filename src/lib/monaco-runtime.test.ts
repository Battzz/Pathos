import { describe, expect, it } from "vitest";
import { resolveLanguageId } from "./monaco-runtime";

const monaco = {
	languages: {
		getLanguages: () => [
			{
				id: "c",
				extensions: [".c", ".h"],
				filenames: [],
			},
			{
				id: "objective-c",
				extensions: [".m"],
				filenames: [],
			},
		],
	},
} as unknown as Parameters<typeof resolveLanguageId>[0];

describe("resolveLanguageId", () => {
	it("uses Objective-C highlighting for Objective-C and Logos file extensions", () => {
		for (const path of [
			"/repo/Headers/Foo.h",
			"/repo/Sources/Foo.m",
			"/repo/Sources/Foo.mm",
			"/repo/Tweak.x",
			"/repo/Tweak.xi",
			"/repo/Tweak.xm",
			"/repo/Tweak.xmi",
		]) {
			expect(resolveLanguageId(monaco, path)).toBe("objective-c");
		}
	});

	it("uses Makefile highlighting for make filenames and fragments", () => {
		for (const path of [
			"/repo/Makefile",
			"/repo/GNUmakefile",
			"/repo/BSDmakefile",
			"/repo/Makefile.debug",
			"/repo/rules.mk",
			"/repo/rules.mak",
		]) {
			expect(resolveLanguageId(monaco, path)).toBe("makefile");
		}
	});

	it("uses XML highlighting for property lists", () => {
		expect(resolveLanguageId(monaco, "/repo/Info.plist")).toBe("xml");
	});

	it("keeps falling back to Monaco language metadata for unmapped extensions", () => {
		expect(resolveLanguageId(monaco, "/repo/native.c")).toBe("c");
	});
});
