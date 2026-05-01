import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageOff } from "lucide-react";
import { getBaseName } from "@/lib/editor-session";

type ImagePreviewProps = {
	path: string;
	unavailable?: boolean;
};

export function ImagePreview({ path, unavailable = false }: ImagePreviewProps) {
	const title = getBaseName(path);

	if (unavailable) {
		return (
			<div className="flex h-full min-h-0 w-full items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<ImageOff className="size-5" strokeWidth={1.6} />
					<span className="text-[13px] leading-5">Image unavailable</span>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-[linear-gradient(180deg,color-mix(in_oklch,var(--background)_88%,black_12%)_0%,var(--background)_100%)] p-5">
			<img
				src={resolveLocalImageSrc(path)}
				alt={title}
				className="max-h-full max-w-full object-contain shadow-sm"
				draggable={false}
			/>
		</div>
	);
}

function resolveLocalImageSrc(path: string) {
	try {
		return convertFileSrc(path);
	} catch {
		return `asset://localhost${path}`;
	}
}
