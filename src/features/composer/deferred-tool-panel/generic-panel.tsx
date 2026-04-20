import { Check, MessageSquareMore, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CodeBlock } from "@/components/ai/code-block";
import { Button } from "@/components/ui/button";
import {
	InteractionFooter,
	InteractionHeader,
	InteractionOptionalInput,
} from "../interaction";
import { DeferredToolCard, type DeferredToolPanelProps } from "./shared";

/**
 * If the tool looks shell-shaped (Bash tool with a `command` string),
 * render the command with bash highlighting. Everything else falls back
 * to a JSON view of `toolInput` with JSON highlighting.
 */
function getCodePreview(deferred: DeferredToolPanelProps["deferred"]): {
	code: string;
	language: string;
} {
	const lowerName = deferred.toolName.toLowerCase();
	const command = deferred.toolInput?.command;
	if (
		typeof command === "string" &&
		command.length > 0 &&
		(lowerName === "bash" || lowerName === "shell" || lowerName === "exec")
	) {
		return { code: command, language: "bash" };
	}
	return {
		code: JSON.stringify(deferred.toolInput, null, 2),
		language: "json",
	};
}

export function GenericDeferredToolPanel({
	deferred,
	disabled,
	onResponse,
}: DeferredToolPanelProps) {
	const [reason, setReason] = useState("");

	useEffect(() => {
		setReason("");
	}, [deferred.toolUseId]);

	const preview = useMemo(() => getCodePreview(deferred), [deferred]);

	return (
		<DeferredToolCard>
			<InteractionHeader
				icon={Settings2}
				title={deferred.toolName}
				description="This tool needs your approval before it can run."
				truncateTitle
			/>

			{/* Tool input — syntax-highlighted via shiki */}
			<div className="mx-1 max-h-56 overflow-y-auto rounded-xl bg-muted/20">
				<CodeBlock
					code={preview.code}
					language={preview.language}
					variant="plain"
					wrapLines
				/>
			</div>

			<InteractionOptionalInput
				icon={MessageSquareMore}
				placeholder="Optional reason"
				value={reason}
				onChange={setReason}
				disabled={disabled}
			/>

			<InteractionFooter>
				<Button
					variant="outline"
					size="sm"
					disabled={disabled}
					onClick={() =>
						onResponse(deferred, "deny", {
							...(reason.trim() ? { reason: reason.trim() } : {}),
						})
					}
				>
					<X className="size-3.5" strokeWidth={2} />
					<span>Deny</span>
				</Button>
				<Button
					variant="default"
					size="sm"
					disabled={disabled}
					onClick={() =>
						onResponse(deferred, "allow", {
							updatedInput: deferred.toolInput,
							...(reason.trim() ? { reason: reason.trim() } : {}),
						})
					}
				>
					<Check className="size-3.5" strokeWidth={2} />
					<span>Allow</span>
				</Button>
			</InteractionFooter>
		</DeferredToolCard>
	);
}
