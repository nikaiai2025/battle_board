import Link from "next/link";
import {
	calculateMomentum,
	calculateSurvivalHours,
	formatRelativeTime,
	formatThreadMetaTitle,
} from "./thread-list-helpers";

interface ThreadTitleRowProps {
	title: string;
	postCount: number;
	createdAt: string;
	lastPostAt: string;
	boardId: string;
	threadKey: string;
}

export default function ThreadTitleRow({
	title,
	postCount,
	createdAt,
	lastPostAt,
	boardId,
	threadKey,
}: ThreadTitleRowProps) {
	const momentum = calculateMomentum(postCount, createdAt);
	const survivalHours = calculateSurvivalHours(createdAt);
	const relativeTime = formatRelativeTime(lastPostAt);

	return (
		<li className="px-1 py-1 hover:bg-accent/25">
			<div className="flex gap-2">
				<div className="shrink-0 text-[10px] leading-none text-muted-foreground">
					<div
						className="rounded-sm border border-border/60 bg-muted/20 px-1.5 py-0.5"
						title={formatThreadMetaTitle(createdAt)}
					>
						<div className="flex items-baseline gap-1 whitespace-nowrap">
							<span className="font-semibold text-foreground">{momentum}</span>
							<span className="text-[9px]">res/d</span>
							<span className="text-border">/</span>
							<span>{survivalHours}h生存</span>
						</div>
					</div>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
						<Link
							href={`/${boardId}/${threadKey}/`}
							className="text-[13px] text-blue-700 hover:text-blue-900 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
							data-testid="thread-title"
						>
							{title}
						</Link>
						<span
							className="whitespace-nowrap text-[11px] text-muted-foreground"
							data-testid="thread-post-count"
						>
							({postCount})
						</span>
						<span
							className="whitespace-nowrap text-[11px] text-muted-foreground"
							data-testid="thread-last-post-at"
							title={lastPostAt}
						>
							{relativeTime}
						</span>
					</div>
				</div>
			</div>
		</li>
	);
}
