import { Asterisk } from "lucide-react";
import { HelmorLogoAnimated } from "@/components/helmor-logo-animated";

const TAGLINES = [
	"Cooking up something tasty",
	"Time to tinker",
	"Plotting world domination",
	"Ready to break things",
	"Polishing the rough edges",
	"Shipping bold ideas",
	"Today we ship something cool",
	"Brewing fresh chaos",
];

function pickTagline(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i += 1) {
		hash = (hash * 31 + label.charCodeAt(i)) | 0;
	}
	return TAGLINES[Math.abs(hash) % TAGLINES.length] ?? TAGLINES[0]!;
}

export function EmptyState({
	hasSession,
	workspaceState = null,
	workspaceLabel = null,
}: {
	hasSession: boolean;
	workspaceState?: string | null;
	workspaceLabel?: string | null;
}) {
	if (workspaceState === "initializing") {
		return (
			<div className="flex flex-col items-center gap-3 text-center">
				<HelmorLogoAnimated size={28} className="opacity-85" />
				<p className="text-[13px] text-muted-foreground">
					Helmor is preparing this workspace…
				</p>
			</div>
		);
	}

	if (!hasSession) {
		return (
			<p className="text-[13px] text-muted-foreground">
				Choose a session from the header to inspect its timeline.
			</p>
		);
	}

	const tagline = workspaceLabel
		? pickTagline(workspaceLabel)
		: "Let's get to it";

	return (
		<div className="flex flex-col items-center gap-5 text-center">
			<Asterisk
				aria-hidden
				className="size-9 text-muted-foreground/55"
				strokeWidth={1.5}
			/>
			<h2 className="text-balance text-[26px] font-medium leading-[1.15] tracking-[-0.02em] text-muted-foreground">
				Chat with{" "}
				<span className="text-foreground/85">
					{workspaceLabel ?? "this workspace"}
				</span>
			</h2>
			<div aria-hidden className="h-px w-56 bg-border/60" />
			<p className="text-[13.5px] leading-[1.55] text-muted-foreground/80">
				{tagline}
			</p>
		</div>
	);
}
