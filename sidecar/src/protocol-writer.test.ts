import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createProtocolWriter, isBrokenPipeError } from "./protocol-writer.js";

class FakeOutput extends EventEmitter {
	readonly chunks: string[] = [];
	throwOnWrite: unknown = null;

	write(chunk: string): boolean {
		if (this.throwOnWrite) throw this.throwOnWrite;
		this.chunks.push(chunk);
		return true;
	}
}

describe("protocol writer", () => {
	test("serializes protocol events as JSON lines", () => {
		const output = new FakeOutput();
		const write = createProtocolWriter(output, () => {});

		write({ type: "ready", version: 1 });

		expect(output.chunks).toEqual(['{"type":"ready","version":1}\n']);
	});

	test("swallows EPIPE and suppresses later writes", () => {
		const output = new FakeOutput();
		const brokenPipe = Object.assign(new Error("EPIPE: broken pipe, write"), {
			code: "EPIPE",
		});
		const errors: unknown[] = [];
		const write = createProtocolWriter(output, (err) => errors.push(err));

		output.throwOnWrite = brokenPipe;
		write({ type: "ready", version: 1 });
		output.throwOnWrite = null;
		write({ type: "pong", id: "after-close" });

		expect(errors).toEqual([brokenPipe]);
		expect(output.chunks).toEqual([]);
	});

	test("marks the protocol closed on async EPIPE stream errors", () => {
		const output = new FakeOutput();
		const errors: unknown[] = [];
		const write = createProtocolWriter(output, (err) => errors.push(err));
		const brokenPipe = Object.assign(new Error("write EPIPE"), {
			code: "EPIPE",
		});

		output.emit("error", brokenPipe);
		write({ type: "pong", id: "after-close" });

		expect(errors).toEqual([brokenPipe]);
		expect(output.chunks).toEqual([]);
	});

	test("rethrows non-pipe write failures", () => {
		const output = new FakeOutput();
		const write = createProtocolWriter(output, () => {});
		const err = new Error("disk full");
		output.throwOnWrite = err;

		expect(() => write({ type: "ready", version: 1 })).toThrow(err);
	});
});

describe("isBrokenPipeError", () => {
	test("matches EPIPE-shaped errors", () => {
		expect(isBrokenPipeError({ code: "EPIPE" })).toBe(true);
		expect(isBrokenPipeError(new Error("Broken pipe"))).toBe(true);
		expect(isBrokenPipeError(new Error("other"))).toBe(false);
	});
});
