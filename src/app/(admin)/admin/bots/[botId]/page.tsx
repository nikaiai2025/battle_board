"use client";

/**
 * 管理BOT詳細ページ -- /admin/bots/[botId]
 *
 * See: features/admin.feature @管理者がBOTの詳細を確認できる
 *
 * 提供機能:
 *   - BOT基本情報表示（名前、稼働状態、HP、生存日数、投稿数、告発回数）
 *   - 投稿履歴テーブル（アクティブスレッドの投稿のみ。APIが休眠除外済み）
 *     - 各投稿: スレッド名、本文（先頭50文字）、投稿日時
 *     - スレッド名からスレッド詳細へのリンク
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - 既存の管理者ページ（users/[userId]/page.tsx）と同一のパターンに従う
 */

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** BOT基本情報型（APIレスポンスの bot フィールド） */
interface BotDetail {
	id: string;
	name: string;
	persona: string;
	hp: number;
	maxHp: number;
	isActive: boolean;
	isRevealed: boolean;
	survivalDays: number;
	totalPosts: number;
	accusedCount: number;
	timesAttacked: number;
	grassCount: number;
	botProfileKey: string | null;
	nextPostAt: string | null;
	eliminatedAt: string | null;
	eliminatedBy: string | null;
	createdAt: string;
}

/** 投稿履歴の個別レコード型（APIレスポンスの posts[] の要素） */
interface BotPostHistory {
	id: string;
	threadId: string;
	postNumber: number;
	body: string;
	createdAt: string;
	threadTitle: string;
}

/** BOT詳細APIレスポンス */
interface BotDetailResponse {
	bot: BotDetail;
	posts: BotPostHistory[];
}

// ---------------------------------------------------------------------------
// BOT詳細ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * BOT詳細ページ（Client Component）
 *
 * See: features/admin.feature @管理者がBOTの詳細を確認できる
 */
export default function AdminBotDetailPage({
	params,
}: {
	params: Promise<{ botId: string }>;
}) {
	const { botId } = use(params);

	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [botDetail, setBotDetail] = useState<BotDetail | null>(null);
	const [posts, setPosts] = useState<BotPostHistory[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * BOT詳細 + 投稿履歴を取得する。
	 * See: features/admin.feature @管理者がBOTの詳細を確認できる
	 * See: src/app/api/admin/bots/[botId]/route.ts > GET
	 */
	const fetchBotDetail = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/bots/${botId}`, {
				cache: "no-store",
			});
			if (res.status === 404) {
				setError("BOTが見つかりません。");
				return;
			}
			if (!res.ok) {
				setError("BOT詳細の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as BotDetailResponse;
			setBotDetail(data.bot);
			setPosts(data.posts);
		} catch {
			setError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoading(false);
		}
	}, [botId]);

	useEffect(() => {
		void fetchBotDetail();
	}, [fetchBotDetail]);

	// ---------------------------------------------------------------------------
	// ローディング・エラー表示
	// ---------------------------------------------------------------------------

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Link
					href="/admin/bots"
					className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>
					BOT一覧に戻る
				</Link>
				<p className="text-muted-foreground text-sm">読み込み中...</p>
			</div>
		);
	}

	if (error || !botDetail) {
		return (
			<div className="space-y-4">
				<Link
					href="/admin/bots"
					className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>
					BOT一覧に戻る
				</Link>
				<p className="text-red-600 text-sm">
					{error ?? "BOT情報を取得できませんでした。"}
				</p>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-6">
			{/* ナビゲーション */}
			<div className="flex items-center gap-2">
				<Link
					href="/admin/bots"
					className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>
					BOT一覧に戻る
				</Link>
			</div>

			<h2 className="text-lg font-bold text-foreground">BOT詳細</h2>

			{/* =============================
          基本情報セクション
          See: features/admin.feature @管理者がBOTの詳細を確認できる
          See: features/admin.feature @BOTの稼働状態と統計情報が表示される
          ============================= */}
			<section
				id="bot-basic-info"
				className="bg-card border border-border rounded p-4 shadow-sm space-y-2"
			>
				<div className="flex items-center gap-3 mb-2">
					<h3 className="text-base font-bold text-foreground">
						{botDetail.name}
					</h3>
					{botDetail.isActive ? (
						<span className="inline-block px-2 py-0.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 text-xs font-bold rounded">
							活動中
						</span>
					) : (
						<span className="inline-block px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 text-xs font-bold rounded">
							撃破済み
						</span>
					)}
					{botDetail.isRevealed && (
						<span className="inline-block px-2 py-0.5 bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 text-xs rounded">
							BOTマーク表示中
						</span>
					)}
				</div>

				<div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
					{/* id(uuid) */}
					<div className="col-span-2 md:col-span-3">
						<span className="text-muted-foreground text-xs">id(uuid)</span>
						<p className="font-mono text-xs text-foreground break-all">
							{botDetail.id}
						</p>
					</div>
					{/* プロファイル */}
					<div>
						<span className="text-muted-foreground text-xs">プロファイル</span>
						<p className="text-foreground">{botDetail.botProfileKey ?? "-"}</p>
					</div>
					{/* HP */}
					<div>
						<span className="text-muted-foreground text-xs">HP</span>
						<p className="text-foreground font-bold">
							<span
								className={
									botDetail.hp <= botDetail.maxHp * 0.3
										? "text-red-600"
										: "text-foreground"
								}
							>
								{botDetail.hp}
							</span>{" "}
							/ {botDetail.maxHp}
						</p>
					</div>
					{/* 生存日数 */}
					<div>
						<span className="text-muted-foreground text-xs">生存日数</span>
						<p className="text-foreground">{botDetail.survivalDays}日</p>
					</div>
					{/* 投稿数 */}
					<div>
						<span className="text-muted-foreground text-xs">総投稿数</span>
						<p className="text-foreground">
							{botDetail.totalPosts.toLocaleString("ja-JP")}
						</p>
					</div>
					{/* 告発回数 */}
					<div>
						<span className="text-muted-foreground text-xs">被告発回数</span>
						<p className="text-foreground">{botDetail.accusedCount}</p>
					</div>
					{/* 被攻撃回数 */}
					<div>
						<span className="text-muted-foreground text-xs">被攻撃回数</span>
						<p className="text-foreground">{botDetail.timesAttacked}</p>
					</div>
					{/* 草カウント */}
					<div>
						<span className="text-muted-foreground text-xs">草カウント</span>
						<p className="text-foreground">{botDetail.grassCount}</p>
					</div>
					{/* created_at */}
					<div>
						<span className="text-muted-foreground text-xs">created_at</span>
						<p className="text-foreground">
							{formatDateTime(botDetail.createdAt)}
						</p>
					</div>
					{/* next_post_at */}
					<div>
						<span className="text-muted-foreground text-xs">next_post_at</span>
						<p className="text-foreground">
							{botDetail.nextPostAt
								? formatDateTime(botDetail.nextPostAt)
								: "-"}
						</p>
					</div>
					{/* 撃破情報（撃破済みの場合のみ） */}
					{botDetail.eliminatedAt && (
						<>
							<div>
								<span className="text-muted-foreground text-xs">撃破日時</span>
								<p className="text-foreground">
									{formatDateTime(botDetail.eliminatedAt)}
								</p>
							</div>
							<div>
								<span className="text-muted-foreground text-xs">撃破者</span>
								<p className="font-mono text-xs text-foreground">
									{botDetail.eliminatedBy
										? `${botDetail.eliminatedBy.slice(0, 8)}...`
										: "-"}
								</p>
							</div>
						</>
					)}
				</div>
			</section>

			{/* =============================
          投稿履歴セクション
          See: features/admin.feature @管理者がBOTの詳細を確認できる
          See: features/admin.feature @アクティブスレッドでの投稿履歴が表示される
          ============================= */}
			<section
				id="bot-post-history"
				className="bg-card border border-border rounded p-4 shadow-sm space-y-3"
			>
				<h3 className="text-base font-bold text-foreground">
					投稿履歴（アクティブスレッド）
				</h3>
				<p className="text-xs text-muted-foreground">
					休眠スレッドの投稿は除外されています。最新50件を表示。
				</p>

				{posts.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						投稿履歴がありません。
					</p>
				) : (
					<div className="overflow-x-auto">
						<table
							id="bot-post-history-table"
							className="w-full text-sm text-left border-collapse"
						>
							<thead>
								<tr className="bg-muted border-b border-border">
									<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
										スレッド名
									</th>
									<th className="px-3 py-2 font-medium text-muted-foreground">
										本文
									</th>
									<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
										投稿日時
									</th>
								</tr>
							</thead>
							<tbody>
								{posts.map((post) => (
									<tr
										key={post.id}
										className="border-b border-border hover:bg-accent"
									>
										{/* スレッド名（スレッド詳細へのリンク付き）
                        See: features/admin.feature @管理者がBOTの詳細を確認できる */}
										<td className="px-3 py-2 text-xs whitespace-nowrap">
											<Link
												href={`/admin/threads?selected=${post.threadId}`}
												className="text-blue-600 hover:underline"
											>
												{post.threadTitle}
											</Link>
										</td>
										{/* 本文（先頭50文字） */}
										<td className="px-3 py-2 text-xs text-foreground max-w-xs">
											{post.body.slice(0, 50)}
											{post.body.length > 50 && "..."}
										</td>
										{/* 投稿日時 */}
										<td className="px-3 py-2 text-xs whitespace-nowrap">
											{formatDateTime(post.createdAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
