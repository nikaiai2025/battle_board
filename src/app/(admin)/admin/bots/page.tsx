"use client";

/**
 * 管理BOT一覧ページ -- /admin/bots
 *
 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 *
 * 提供機能:
 *   - 「活動中」「撃破済み」の切り替えタブ
 *   - 活動中: 名前、HP/最大HP、生存日数、投稿数、告発回数
 *   - 撃破済み: 名前、生存日数、撃破日時、撃破者（ID短縮表示）
 *   - 各行からBOT詳細（/admin/bots/[botId]）へのリンク
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - 既存の管理者ページ（users/page.tsx）と同一のパターンに従う
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 活動中BOTのAPIレスポンス型 */
interface ActiveBot {
	id: string;
	name: string;
	botProfileKey: string | null;
	hp: number;
	maxHp: number;
	survivalDays: number;
	totalPosts: number;
	accusedCount: number;
}

/** 撃破済みBOTのAPIレスポンス型 */
interface EliminatedBot {
	id: string;
	name: string;
	botProfileKey: string | null;
	survivalDays: number;
	eliminatedAt: string | null;
	eliminatedBy: string | null;
}

/** BOT一覧APIレスポンス（活動中/撃破済み共通） */
interface BotListResponse {
	bots: ActiveBot[] | EliminatedBot[];
}

/** 表示モード: 活動中 or 撃破済み */
type StatusTab = "active" | "eliminated";

// ---------------------------------------------------------------------------
// BOT一覧ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * BOT一覧ページ（Client Component）
 *
 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
 * See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる
 */
export default function AdminBotsPage() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [activeTab, setActiveTab] = useState<StatusTab>("active");
	const [activeBots, setActiveBots] = useState<ActiveBot[]>([]);
	const [eliminatedBots, setEliminatedBots] = useState<EliminatedBot[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * 指定ステータスのBOT一覧を取得する。
	 * See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
	 * See: src/app/api/admin/bots/route.ts > GET
	 */
	const fetchBots = useCallback(async (status: StatusTab) => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/admin/bots?status=${status}`, {
				cache: "no-store",
			});
			if (!res.ok) {
				setError("BOT一覧の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as BotListResponse;
			if (status === "active") {
				setActiveBots(data.bots as ActiveBot[]);
			} else {
				setEliminatedBots(data.bots as EliminatedBot[]);
			}
		} catch {
			setError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchBots(activeTab);
	}, [fetchBots, activeTab]);

	// ---------------------------------------------------------------------------
	// タブ切り替え
	// ---------------------------------------------------------------------------

	function handleTabChange(tab: StatusTab) {
		setActiveTab(tab);
	}

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-4">
			{/* ページヘッダー */}
			<h2 className="text-lg font-bold text-foreground">BOT管理</h2>

			{/* タブ切り替え
          See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる
          See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる */}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => handleTabChange("active")}
					className={`px-4 py-2 text-sm rounded ${
						activeTab === "active"
							? "bg-blue-600 text-white"
							: "bg-muted text-foreground hover:bg-accent"
					}`}
				>
					活動中
				</button>
				<button
					type="button"
					onClick={() => handleTabChange("eliminated")}
					className={`px-4 py-2 text-sm rounded ${
						activeTab === "eliminated"
							? "bg-blue-600 text-white"
							: "bg-muted text-foreground hover:bg-accent"
					}`}
				>
					撃破済み
				</button>
			</div>

			{error && <p className="text-red-600 text-sm">{error}</p>}

			{/* 活動中BOTテーブル
          See: features/admin.feature @管理者が活動中のBOT一覧を閲覧できる */}
			{activeTab === "active" && (
				<div className="bg-card border border-border rounded shadow-sm overflow-x-auto">
					<table
						id="active-bot-table"
						className="w-full text-sm text-left border-collapse"
					>
						<thead>
							<tr className="bg-muted border-b border-border">
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									名前
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									プロファイル
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
									HP / 最大HP
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
									生存日数
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
									投稿数
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
									告発回数
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									操作
								</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center text-muted-foreground text-sm"
									>
										読み込み中...
									</td>
								</tr>
							) : activeBots.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center text-muted-foreground text-sm"
									>
										活動中のBOTがありません
									</td>
								</tr>
							) : (
								activeBots.map((bot) => (
									<tr
										key={bot.id}
										className="border-b border-border hover:bg-accent"
									>
										{/* 名前 */}
										<td className="px-3 py-2 text-xs text-foreground">
											{bot.name}
										</td>
										{/* プロファイル */}
										<td className="px-3 py-2 text-xs text-muted-foreground">
											{bot.botProfileKey ?? "-"}
										</td>
										{/* HP / 最大HP */}
										<td className="px-3 py-2 text-right text-xs">
											<span
												className={
													bot.hp <= bot.maxHp * 0.3
														? "text-red-600 font-bold"
														: "text-foreground"
												}
											>
												{bot.hp}
											</span>
											<span className="text-muted-foreground">
												{" "}
												/ {bot.maxHp}
											</span>
										</td>
										{/* 生存日数 */}
										<td className="px-3 py-2 text-right text-xs">
											{bot.survivalDays}日
										</td>
										{/* 投稿数 */}
										<td className="px-3 py-2 text-right text-xs">
											{bot.totalPosts.toLocaleString("ja-JP")}
										</td>
										{/* 告発回数 */}
										<td className="px-3 py-2 text-right text-xs">
											{bot.accusedCount}
										</td>
										{/* 詳細リンク */}
										<td className="px-3 py-2">
											<Link
												href={`/admin/bots/${bot.id}`}
												className="inline-block px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
											>
												詳細
											</Link>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* 撃破済みBOTテーブル
          See: features/admin.feature @管理者が撃破済みのBOT一覧を閲覧できる */}
			{activeTab === "eliminated" && (
				<div className="bg-card border border-border rounded shadow-sm overflow-x-auto">
					<table
						id="eliminated-bot-table"
						className="w-full text-sm text-left border-collapse"
					>
						<thead>
							<tr className="bg-muted border-b border-border">
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									名前
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									プロファイル
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
									生存日数
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									撃破日時
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									撃破者
								</th>
								<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
									操作
								</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<tr>
									<td
										colSpan={6}
										className="px-3 py-6 text-center text-muted-foreground text-sm"
									>
										読み込み中...
									</td>
								</tr>
							) : eliminatedBots.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-3 py-6 text-center text-muted-foreground text-sm"
									>
										撃破済みのBOTがありません
									</td>
								</tr>
							) : (
								eliminatedBots.map((bot) => (
									<tr
										key={bot.id}
										className="border-b border-border hover:bg-accent bg-muted/30"
									>
										{/* 名前 */}
										<td className="px-3 py-2 text-xs text-foreground">
											{bot.name}
										</td>
										{/* プロファイル */}
										<td className="px-3 py-2 text-xs text-muted-foreground">
											{bot.botProfileKey ?? "-"}
										</td>
										{/* 生存日数 */}
										<td className="px-3 py-2 text-right text-xs">
											{bot.survivalDays}日
										</td>
										{/* 撃破日時 */}
										<td className="px-3 py-2 text-xs whitespace-nowrap">
											{bot.eliminatedAt
												? formatDateTime(bot.eliminatedAt)
												: "-"}
										</td>
										{/* 撃破者（ID短縮表示） */}
										<td className="px-3 py-2 text-xs font-mono text-muted-foreground">
											{bot.eliminatedBy
												? `${bot.eliminatedBy.slice(0, 8)}...`
												: "-"}
										</td>
										{/* 詳細リンク */}
										<td className="px-3 py-2">
											<Link
												href={`/admin/bots/${bot.id}`}
												className="inline-block px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
											>
												詳細
											</Link>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
