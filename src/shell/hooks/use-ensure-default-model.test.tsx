import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createPathosQueryClient, pathosQueryKeys } from "@/lib/query-client";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings";
import { useEnsureDefaultModel } from "./use-ensure-default-model";

function renderUseEnsureDefaultModel(args: {
	defaultModelId: string | null;
	commitActionModelId?: string | null;
	sections: Array<{
		id: "claude" | "codex";
		label: string;
		status?: "ready" | "unavailable" | "error";
		options: Array<{
			id: string;
			provider: "claude" | "codex";
			label: string;
			cliModel: string;
		}>;
	}>;
}) {
	const queryClient = createPathosQueryClient();
	queryClient.setQueryData(pathosQueryKeys.agentModelSections, args.sections);
	const updateSettings = vi.fn();

	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<SettingsContext.Provider
				value={{
					settings: {
						...DEFAULT_SETTINGS,
						defaultModelId: args.defaultModelId,
						commitActionModelId:
							args.commitActionModelId ?? DEFAULT_SETTINGS.commitActionModelId,
					},
					isLoaded: true,
					updateSettings,
				}}
			>
				{children}
			</SettingsContext.Provider>
		</QueryClientProvider>
	);

	renderHook(() => useEnsureDefaultModel(), { wrapper });
	return { updateSettings };
}

describe("useEnsureDefaultModel", () => {
	it("repairs an invalid saved model once the catalog is settled", () => {
		const { updateSettings } = renderUseEnsureDefaultModel({
			defaultModelId: "gpt-legacy",
			sections: [
				{
					id: "claude",
					label: "Claude Code",
					status: "ready",
					options: [
						{
							id: "opus-1m",
							provider: "claude",
							label: "Opus",
							cliModel: "opus-1m",
						},
					],
				},
				{
					id: "codex",
					label: "Codex",
					status: "unavailable",
					options: [],
				},
			],
		});

		expect(updateSettings).toHaveBeenCalledWith({
			defaultModelId: "opus-1m",
			commitActionModelId: "opus-1m",
		});
	});

	it("defaults commit actions to GPT-5.4-Mini when available", () => {
		const { updateSettings } = renderUseEnsureDefaultModel({
			defaultModelId: "opus-1m",
			commitActionModelId: "gpt-legacy",
			sections: [
				{
					id: "claude",
					label: "Claude Code",
					status: "ready",
					options: [
						{
							id: "opus-1m",
							provider: "claude",
							label: "Opus",
							cliModel: "opus-1m",
						},
					],
				},
				{
					id: "codex",
					label: "Codex",
					status: "ready",
					options: [
						{
							id: "gpt-5.4-mini",
							provider: "codex",
							label: "GPT-5.4-Mini",
							cliModel: "gpt-5.4-mini",
						},
					],
				},
			],
		});

		expect(updateSettings).toHaveBeenCalledWith({
			commitActionModelId: "gpt-5.4-mini",
		});
	});

	it("preserves an invalid saved model while any provider is still in error", () => {
		const { updateSettings } = renderUseEnsureDefaultModel({
			defaultModelId: "gpt-legacy",
			sections: [
				{
					id: "claude",
					label: "Claude Code",
					status: "ready",
					options: [
						{
							id: "opus-1m",
							provider: "claude",
							label: "Opus",
							cliModel: "opus-1m",
						},
					],
				},
				{
					id: "codex",
					label: "Codex",
					status: "error",
					options: [],
				},
			],
		});

		expect(updateSettings).not.toHaveBeenCalled();
	});
});
