import {
	Check,
	ChevronLeft,
	ChevronRight,
	Circle,
	CircleDot,
	MessageSquareMore,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
	AskUserQuestionViewModel,
	DeferredQuestion,
} from "../deferred-tool";
import {
	InteractionFooter,
	InteractionHeader,
	InteractionOptionRow,
} from "../interaction";
import { DeferredToolCard, type DeferredToolPanelProps } from "./shared";

type AskQuestionResponseState = {
	selectedOptionLabels: string[];
	useOther: boolean;
	otherText: string;
	notes: string;
};

const EMPTY_RESPONSE_STATE: AskQuestionResponseState = {
	selectedOptionLabels: [],
	useOther: false,
	otherText: "",
	notes: "",
};

function buildInitialAskResponses(
	viewModel: AskUserQuestionViewModel,
): Record<string, AskQuestionResponseState> {
	const next: Record<string, AskQuestionResponseState> = {};

	for (const question of viewModel.questions) {
		const existingAnswer = viewModel.answers[question.question] ?? "";
		const parts = existingAnswer
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		const optionLabels = new Set(
			question.options.map((option) => option.label),
		);
		const selectedOptionLabels = parts.filter((part) => optionLabels.has(part));
		const otherParts = parts.filter((part) => !optionLabels.has(part));
		const annotation = viewModel.annotations[question.question];

		next[question.key] = {
			selectedOptionLabels,
			useOther: otherParts.length > 0,
			otherText: otherParts.join(", "),
			notes: annotation?.notes ?? "",
		};
	}

	return next;
}

function buildAnswerString(
	question: DeferredQuestion,
	response: AskQuestionResponseState,
): string {
	const selectedLabels = question.multiSelect
		? response.selectedOptionLabels
		: response.selectedOptionLabels.slice(0, 1);
	const parts = [...selectedLabels];
	if (response.useOther && response.otherText.trim()) {
		if (question.multiSelect) {
			parts.push(response.otherText.trim());
		} else {
			return response.otherText.trim();
		}
	}

	return parts.join(", ");
}

function isQuestionAnswered(
	question: DeferredQuestion,
	response: AskQuestionResponseState,
): boolean {
	return buildAnswerString(question, response).trim().length > 0;
}

function buildAskUserQuestionInput(
	viewModel: AskUserQuestionViewModel,
	responses: Record<string, AskQuestionResponseState>,
): Record<string, unknown> {
	const answers: Record<string, string> = {};
	const annotations: Record<string, { preview?: string; notes?: string }> = {};

	for (const question of viewModel.questions) {
		const response = responses[question.key] ?? EMPTY_RESPONSE_STATE;
		const answer = buildAnswerString(question, response).trim();
		if (!answer) {
			continue;
		}

		answers[question.question] = answer;
		const selectedPreview = question.options.find(
			(option) =>
				response.selectedOptionLabels.includes(option.label) &&
				option.preview !== null,
		)?.preview;
		const notes = response.notes.trim();
		if (selectedPreview || notes) {
			annotations[question.question] = {
				...(selectedPreview ? { preview: selectedPreview } : {}),
				...(notes ? { notes } : {}),
			};
		}
	}

	return {
		...viewModel.toolInput,
		answers,
		...(Object.keys(annotations).length > 0 ? { annotations } : {}),
	};
}

export function AskUserQuestionPanel({
	deferred,
	disabled,
	onResponse,
	viewModel,
}: DeferredToolPanelProps & { viewModel: AskUserQuestionViewModel }) {
	const initialResponses = useMemo(
		() => buildInitialAskResponses(viewModel),
		[viewModel],
	);
	const [questionIndex, setQuestionIndex] = useState(0);
	const [responses, setResponses] = useState(initialResponses);
	const otherInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		setQuestionIndex(0);
		setResponses(initialResponses);
	}, [initialResponses, viewModel.toolUseId]);

	const questions = viewModel.questions;
	const currentQuestion = questions[questionIndex] ?? questions[0];
	const currentResponse =
		responses[currentQuestion.key] ?? EMPTY_RESPONSE_STATE;

	const answeredCount = questions.filter((question) =>
		isQuestionAnswered(
			question,
			responses[question.key] ?? EMPTY_RESPONSE_STATE,
		),
	).length;
	const canSubmit = answeredCount === questions.length && !disabled;

	const updateResponse = useCallback(
		(
			questionKey: string,
			updater: (current: AskQuestionResponseState) => AskQuestionResponseState,
		) => {
			setResponses((current) => ({
				...current,
				[questionKey]: updater(current[questionKey] ?? EMPTY_RESPONSE_STATE),
			}));
		},
		[],
	);

	const handleOptionToggle = useCallback(
		(optionLabel: string) => {
			updateResponse(currentQuestion.key, (current) => {
				const selected = new Set(current.selectedOptionLabels);
				if (currentQuestion.multiSelect) {
					if (selected.has(optionLabel)) {
						selected.delete(optionLabel);
					} else {
						selected.add(optionLabel);
					}

					return {
						...current,
						selectedOptionLabels: Array.from(selected),
					};
				}

				return {
					...current,
					selectedOptionLabels: [optionLabel],
					useOther: false,
					otherText: "",
				};
			});

			if (
				!currentQuestion.multiSelect &&
				questionIndex < questions.length - 1
			) {
				setQuestionIndex(questionIndex + 1);
			}
		},
		[currentQuestion, questionIndex, questions.length, updateResponse],
	);

	const handleOtherActivate = useCallback(() => {
		updateResponse(currentQuestion.key, (current) => ({
			...current,
			selectedOptionLabels: currentQuestion.multiSelect
				? current.selectedOptionLabels
				: [],
			useOther: true,
		}));

		window.requestAnimationFrame(() => {
			otherInputRef.current?.focus();
		});
	}, [currentQuestion, updateResponse]);

	const handleSubmitAnswers = useCallback(() => {
		if (!canSubmit) {
			return;
		}

		onResponse(deferred, "allow", {
			updatedInput: buildAskUserQuestionInput(viewModel, responses),
		});
	}, [canSubmit, deferred, onResponse, responses, viewModel]);

	return (
		<DeferredToolCard>
			<InteractionHeader
				icon={MessageSquareMore}
				title={currentQuestion.question}
				description={
					currentQuestion.multiSelect
						? "Choose one or more options."
						: "Choose one option."
				}
				trailing={
					<>
						{viewModel.source ? (
							<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
								{viewModel.source}
							</span>
						) : null}
						{questions.length > 1 ? (
							<div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-background/40 p-0.5">
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Previous question"
									disabled={disabled || questionIndex === 0}
									onClick={() =>
										setQuestionIndex((current) => Math.max(0, current - 1))
									}
									className="size-5"
								>
									<ChevronLeft className="size-3" strokeWidth={2} />
								</Button>
								<span className="flex max-w-[14rem] items-center gap-1.5 px-1.5 text-[11px] font-medium leading-none text-muted-foreground">
									<span className="truncate">{currentQuestion.header}</span>
									<span className="shrink-0 tabular-nums text-muted-foreground/70">
										{questionIndex + 1}/{questions.length}
									</span>
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Next question"
									disabled={disabled || questionIndex === questions.length - 1}
									onClick={() =>
										setQuestionIndex((current) =>
											Math.min(questions.length - 1, current + 1),
										)
									}
									className="size-5"
								>
									<ChevronRight className="size-3" strokeWidth={2} />
								</Button>
							</div>
						) : null}
					</>
				}
			/>

			<div className="grid gap-1 px-1">
				{currentQuestion.options.map((option) => {
					const selected = currentResponse.selectedOptionLabels.includes(
						option.label,
					);
					const indicator = currentQuestion.multiSelect ? "checkbox" : "radio";

					return (
						<InteractionOptionRow
							key={option.label}
							data-ask-option-row={option.label}
							selected={selected}
							indicator={indicator}
							label={option.label}
							description={option.description || undefined}
							disabled={disabled}
							onClick={() => handleOptionToggle(option.label)}
						>
							{selected && option.preview ? (
								<pre className="mt-2 ml-[1.6rem] max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
									{option.preview}
								</pre>
							) : null}
						</InteractionOptionRow>
					);
				})}

				<div
					data-ask-option-row="other"
					className={cn(
						"group/option cursor-pointer rounded-md px-2 py-1.5 transition-colors",
						currentResponse.useOther
							? "bg-accent/60 ring-1 ring-inset ring-border/50"
							: "hover:bg-accent/30",
						disabled && "cursor-not-allowed opacity-60",
					)}
					onClick={() => {
						if (disabled) {
							return;
						}
						handleOtherActivate();
					}}
				>
					<div className="flex items-center gap-2">
						<span className="shrink-0 text-muted-foreground">
							{currentQuestion.multiSelect ? (
								currentResponse.useOther ? (
									<span className="flex size-3.5 items-center justify-center rounded-[5px] bg-foreground/85 text-background">
										<Check className="size-2.5" strokeWidth={3} />
									</span>
								) : (
									<span className="block size-3.5 rounded-[5px] bg-background/80 ring-1 ring-inset ring-border/55 transition-colors group-hover/option:ring-border" />
								)
							) : currentResponse.useOther ? (
								<CircleDot
									className="size-3.5 text-foreground"
									strokeWidth={1.9}
								/>
							) : (
								<Circle
									className="size-3.5 text-muted-foreground/55 transition-colors group-hover/option:text-muted-foreground/80"
									strokeWidth={1.9}
								/>
							)}
						</span>
						<Input
							ref={otherInputRef}
							aria-label={`Other answer for ${currentQuestion.header}`}
							disabled={disabled}
							placeholder="Other"
							value={currentResponse.otherText}
							onFocus={() => {
								if (!currentResponse.useOther) {
									handleOtherActivate();
								}
							}}
							onBlur={() => {
								if (currentResponse.otherText.trim().length > 0) {
									return;
								}
								updateResponse(currentQuestion.key, (current) => ({
									...current,
									useOther: false,
									otherText: "",
								}));
							}}
							onClick={(event) => {
								event.stopPropagation();
							}}
							onChange={(event) => {
								const value = event.target.value;
								updateResponse(currentQuestion.key, (current) => ({
									...current,
									selectedOptionLabels: currentQuestion.multiSelect
										? current.selectedOptionLabels
										: [],
									useOther: true,
									otherText: value,
								}));
							}}
							className="h-auto rounded-none border-0 !bg-transparent px-0 py-0.5 text-[13px] font-medium leading-5 shadow-none placeholder:font-medium placeholder:text-muted-foreground/55 focus-visible:ring-0 disabled:!bg-transparent dark:!bg-transparent dark:disabled:!bg-transparent"
						/>
					</div>
				</div>
			</div>

			<InteractionFooter>
				{questionIndex === 0 ? (
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() => onResponse(deferred, "deny")}
					>
						<span>Decline</span>
					</Button>
				) : (
					<Button
						variant="outline"
						size="sm"
						disabled={disabled}
						onClick={() =>
							setQuestionIndex((current) => Math.max(0, current - 1))
						}
					>
						<span>Back</span>
					</Button>
				)}
				{questionIndex === questions.length - 1 ? (
					<Button
						variant="default"
						size="sm"
						disabled={!canSubmit}
						onClick={handleSubmitAnswers}
					>
						<span>Submit</span>
					</Button>
				) : (
					<Button
						variant="default"
						size="sm"
						disabled={disabled}
						onClick={() =>
							setQuestionIndex((current) =>
								Math.min(questions.length - 1, current + 1),
							)
						}
					>
						<span>Next</span>
					</Button>
				)}
			</InteractionFooter>
		</DeferredToolCard>
	);
}
