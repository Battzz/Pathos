import type { DisplayResolution } from "./parse";
import {
	AutoCompactNote,
	CategoryList,
	TokensOnlyHeader,
	UsageBar,
	UsageHeader,
} from "./popover-parts";

type Props = {
	display: DisplayResolution;
};

export function ContextUsagePopoverContent({ display }: Props) {
	const showCategories =
		display.kind === "full" &&
		display.rich !== null &&
		display.rich.categories.length > 0;

	return (
		<div className="flex flex-col gap-3 px-1 py-1">
			{display.kind === "tokensOnly" ? (
				<TokensOnlyHeader usedTokens={display.usedTokens} />
			) : display.kind === "full" ? (
				<>
					<UsageHeader
						used={display.usedTokens}
						max={display.maxTokens}
						percentage={display.percentage}
					/>
					<UsageBar percentage={display.percentage} tier={display.tier} />
					{showCategories && display.rich ? (
						<>
							<CategoryList
								categories={display.rich.categories}
								maxTokens={display.rich.maxTokens}
							/>
							{display.rich.isAutoCompactEnabled ? <AutoCompactNote /> : null}
						</>
					) : null}
				</>
			) : (
				<>
					<UsageHeader used={null} max={null} percentage={0} />
					<UsageBar percentage={0} tier="default" />
				</>
			)}
		</div>
	);
}
