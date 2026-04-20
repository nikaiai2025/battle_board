/**
 * ThreadCard — スレッド一覧の1件分のカードコンポーネント（Server Component）
 *
 * 表示内容:
 * - スレッドタイトル（スレッドへのリンク）
 * - レス数
 * - 最終書き込み日時（相対時間: 「3分前」「1時間前」等）
 *
 * See: features/thread.feature @スレッド一覧にスレッドの基本情報が表示される
 * See: features/thread.feature @url_structure
 * See: docs/specs/screens/thread-list.yaml > elements > thread-list > itemTemplate
 */

import Link from "next/link";
import PostForm from "./PostForm";
import type { ThreadPreviewPostSummary } from "./thread-types";
import {
	calculateMomentum,
	calculateSurvivalHours,
	formatPreviewBody,
	formatRelativeTime,
	formatThreadMetaTitle,
} from "./thread-list-helpers";

interface ThreadCardProps {
	threadId: string;
	title: string;
	postCount: number;
	createdAt: string; // ISO 8601形式
	lastPostAt: string; // ISO 8601形式
	/** 板ID。リンク先 /{boardId}/{threadKey}/ の生成に使用 */
	boardId: string;
	/** 専ブラ互換キー（10桁 UNIX タイムスタンプ）。リンク先生成に使用 */
	threadKey: string;
	/** トップページ用の最新レスプレビュー */
	previewPosts?: ThreadPreviewPostSummary[];
}

/**
 * スレッドカードコンポーネント（Server Component）
 *
 * リンク先は /{boardId}/{threadKey}/ 形式（専ブラ互換URL）。
 * id は React key として親の ThreadList で使用するが、リンク生成には使用しない。
 *
 * See: features/thread.feature @url_structure
 * See: docs/specs/screens/thread-list.yaml @SCR-001 > thread-list > itemTemplate
 */
export default function ThreadCard({
	threadId,
	title,
	postCount,
	createdAt,
	lastPostAt,
	boardId,
	threadKey,
	previewPosts = [],
}: ThreadCardProps) {
	const relativeTime = formatRelativeTime(lastPostAt);
	const momentum = calculateMomentum(postCount, createdAt);
	const survivalHours = calculateSurvivalHours(createdAt);

	return (
		<li className="rounded border border-border/60 bg-background/72 px-2 py-2 hover:bg-background/90">
			<div className="flex gap-3">
				<div className="shrink-0 text-[10px] leading-none text-muted-foreground">
					<div
						className="rounded-sm border border-border/80 bg-muted/35 px-1.5 py-1"
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
					<div className="flex items-baseline gap-2 flex-wrap">
						{/* thread-title: スレッドタイトルリンク（/{boardId}/{threadKey}/ 形式） */}
						<Link
							href={`/${boardId}/${threadKey}/`}
							className="text-[17px] font-bold text-[#ff0000] hover:text-[#ff0000] hover:underline dark:text-[#ff0000] dark:hover:text-[#ff0000]"
							data-testid="thread-title"
						>
							{title}
						</Link>

						{/* thread-post-count: レス数 */}
						<span
							className="text-muted-foreground text-xs whitespace-nowrap"
							data-testid="thread-post-count"
						>
							({postCount})
						</span>

						{/* thread-last-post-at: 最終書き込み日時（相対表示） */}
						<span
							className="text-muted-foreground text-xs whitespace-nowrap"
							data-testid="thread-last-post-at"
							title={lastPostAt}
						>
							{relativeTime}
						</span>
					</div>
					{previewPosts.length > 0 && (
						<ul className="mt-2 space-y-0.5">
							{previewPosts.map((previewPost) => {
								const previewBody = formatPreviewBody(previewPost);
								return (
									<li
										key={`${threadKey}-${previewPost.postNumber}`}
										className="flex items-start gap-2 text-[15px] text-muted-foreground"
										title={previewBody}
									>
										<span className="shrink-0 text-[14px] text-muted-foreground/90">
											{previewPost.postNumber}:
										</span>
										<span
											className={`min-w-0 whitespace-pre-wrap break-words leading-[1.45] ${
												previewPost.isDeleted
													? "italic text-muted-foreground/80"
													: previewPost.isSystemMessage
														? "text-foreground/70"
														: "text-foreground/80"
											}`}
										>
											{previewBody}
										</span>
									</li>
								);
							})}
						</ul>
					)}
					<details className="mt-2">
						<summary className="cursor-pointer text-[12px] text-blue-700 hover:underline dark:text-blue-400">
							書き込み
						</summary>
						<div className="mt-2">
							<PostForm
								idPrefix={`thread-preview-${threadId}`}
								threadId={threadId}
							/>
						</div>
					</details>
				</div>
			</div>
		</li>
	);
}
