type WritableOutput = {
	write(chunk: string): unknown;
	on?(event: "error", listener: (err: unknown) => void): unknown;
};

export type ProtocolWriteErrorHandler = (err: unknown) => void;

export function isBrokenPipeError(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const record = err as Record<string, unknown>;
	return record.code === "EPIPE" || record.message === "Broken pipe";
}

export function createProtocolWriter(
	output: WritableOutput,
	onBrokenPipe: ProtocolWriteErrorHandler,
): (event: object) => void {
	let closed = false;

	const markBrokenPipe = (err: unknown) => {
		if (closed) return;
		closed = true;
		onBrokenPipe(err);
	};

	output.on?.("error", (err) => {
		if (isBrokenPipeError(err)) {
			markBrokenPipe(err);
		}
	});

	return (event) => {
		if (closed) return;
		try {
			output.write(`${JSON.stringify(event)}\n`);
		} catch (err) {
			if (isBrokenPipeError(err)) {
				markBrokenPipe(err);
				return;
			}
			throw err;
		}
	};
}
