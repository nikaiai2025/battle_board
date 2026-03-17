"use client";

/**
 * 管理ダッシュボードページ — /admin
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 * See: tmp/feature_plan_admin_expansion.md §6-c ダッシュボード表示要素
 *
 * 提供機能:
 *   - 統計カード4枚（総ユーザー数 / 本日書き込み数 / アクティブスレッド数 / 通貨流通量）
 *   - 日次推移テーブル（7日 / 30日 切替）
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - グラフライブラリは使わず、テーブル形式で推移を表示する（新規npm依存を避ける）
 *   - See: tmp/tasks/task_TASK-108.md §補足・制約
 */

import { useCallback, useEffect, useState } from "react";
import type { DailyStat } from "@/lib/infrastructure/repositories/daily-stats-repository";
import type { DashboardSummary } from "@/lib/services/admin-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type HistoryDays = 7 | 30;

// ---------------------------------------------------------------------------
// 統計カードコンポーネント
// ---------------------------------------------------------------------------

/**
 * 統計情報を1枚のカードで表示するコンポーネント。
 * See: tmp/feature_plan_admin_expansion.md §6-c ダッシュボード表示要素
 */
function StatCard({
	label,
	value,
	unit = "",
}: {
	label: string;
	value: number | null;
	unit?: string;
}) {
	return (
		<div className="bg-white border border-gray-200 rounded p-4 shadow-sm">
			<p className="text-xs text-gray-500 mb-1">{label}</p>
			<p className="text-2xl font-bold text-gray-800">
				{value === null ? (
					<span className="text-gray-400 text-base">読み込み中...</span>
				) : (
					<>
						{value.toLocaleString("ja-JP")}
						{unit && (
							<span className="text-sm font-normal text-gray-500 ml-1">
								{unit}
							</span>
						)}
					</>
				)}
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// ダッシュボードページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * 管理ダッシュボードページ（Client Component）
 *
 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
 */
export default function AdminDashboardPage() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [history, setHistory] = useState<DailyStat[]>([]);
	const [historyDays, setHistoryDays] = useState<HistoryDays>(7);
	const [isLoadingSummary, setIsLoadingSummary] = useState(true);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * ダッシュボードのリアルタイムサマリーを取得する。
	 * See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
	 */
	const fetchSummary = useCallback(async () => {
		setIsLoadingSummary(true);
		setSummaryError(null);
		try {
			const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
			if (!res.ok) {
				setSummaryError("統計情報の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as DashboardSummary;
			setSummary(data);
		} catch {
			setSummaryError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoadingSummary(false);
		}
	}, []);

	/**
	 * 日次推移を取得する。
	 * See: features/admin.feature @管理者が統計情報の日次推移を確認できる
	 */
	const fetchHistory = useCallback(async (days: HistoryDays) => {
		setIsLoadingHistory(true);
		setHistoryError(null);
		try {
			const res = await fetch(`/api/admin/dashboard/history?days=${days}`, {
				cache: "no-store",
			});
			if (!res.ok) {
				setHistoryError("推移データの取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as { history: DailyStat[] };
			setHistory(data.history);
		} catch {
			setHistoryError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoadingHistory(false);
		}
	}, []);

	useEffect(() => {
		void fetchSummary();
	}, [fetchSummary]);

	useEffect(() => {
		void fetchHistory(historyDays);
	}, [fetchHistory, historyDays]);

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-6">
			<h2 className="text-lg font-bold text-gray-800">ダッシュボード</h2>

			{/* =============================
          統計カードセクション
          See: features/admin.feature @管理者がダッシュボードで統計情報を確認できる
          ============================= */}
			{summaryError ? (
				<p className="text-red-600 text-sm">{summaryError}</p>
			) : (
				<div id="stats-cards" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					{/* 総ユーザー数
              See: features/admin.feature @総ユーザー数が表示される */}
					<StatCard
						label="総ユーザー数"
						value={isLoadingSummary ? null : (summary?.totalUsers ?? 0)}
						unit="人"
					/>
					{/* 本日の書き込み数
              See: features/admin.feature @本日の書き込み数が表示される */}
					<StatCard
						label="本日の書き込み数"
						value={isLoadingSummary ? null : (summary?.todayPosts ?? 0)}
						unit="件"
					/>
					{/* アクティブスレッド数
              See: features/admin.feature @アクティブスレッド数が表示される */}
					<StatCard
						label="アクティブスレッド数"
						value={isLoadingSummary ? null : (summary?.activeThreads ?? 0)}
						unit="件"
					/>
					{/* 通貨流通量
              See: features/admin.feature @通貨流通量が表示される */}
					<StatCard
						label="通貨流通量"
						value={
							isLoadingSummary ? null : (summary?.currencyInCirculation ?? 0)
						}
						unit="BT"
					/>
				</div>
			)}

			{/* =============================
          日次推移テーブルセクション
          See: features/admin.feature @管理者が統計情報の日次推移を確認できる
          ============================= */}
			<section
				id="history-section"
				className="bg-white border border-gray-200 rounded p-4 shadow-sm"
			>
				{/* 期間切替ボタン */}
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-base font-bold text-gray-700">日次推移</h3>
					<div className="flex gap-2">
						{([7, 30] as HistoryDays[]).map((days) => (
							<button
								key={days}
								type="button"
								onClick={() => setHistoryDays(days)}
								className={
									historyDays === days
										? "px-3 py-1 text-xs rounded bg-gray-700 text-white"
										: "px-3 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
								}
							>
								{days}日
							</button>
						))}
					</div>
				</div>

				{/* 推移テーブル */}
				{historyError ? (
					<p className="text-red-600 text-sm">{historyError}</p>
				) : isLoadingHistory ? (
					<p className="text-gray-500 text-sm">読み込み中...</p>
				) : history.length === 0 ? (
					<p className="text-gray-400 text-sm">
						推移データがありません（daily_stats
						テーブルへのデータ投入後に表示されます）
					</p>
				) : (
					<div className="overflow-x-auto">
						<table
							id="history-table"
							className="w-full text-xs text-left border-collapse"
						>
							<thead>
								<tr className="bg-gray-50 border-b border-gray-200">
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
										日付
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										ユーザー数
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										新規
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										書き込み数
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										アクティブユーザー
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										通貨流通量
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										通貨付与
									</th>
									<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
										通貨消費
									</th>
								</tr>
							</thead>
							<tbody>
								{history.map((stat) => (
									<tr
										key={stat.statDate}
										className="border-b border-gray-100 hover:bg-gray-50"
									>
										<td className="px-3 py-2 font-medium whitespace-nowrap">
											{stat.statDate}
										</td>
										<td className="px-3 py-2 text-right">
											{stat.totalUsers.toLocaleString("ja-JP")}
										</td>
										<td className="px-3 py-2 text-right text-green-700">
											+{stat.newUsers.toLocaleString("ja-JP")}
										</td>
										<td className="px-3 py-2 text-right">
											{stat.totalPosts.toLocaleString("ja-JP")}
										</td>
										<td className="px-3 py-2 text-right">
											{stat.activeUsers.toLocaleString("ja-JP")}
										</td>
										<td className="px-3 py-2 text-right">
											{stat.currencyInCirculation.toLocaleString("ja-JP")} BT
										</td>
										<td className="px-3 py-2 text-right text-green-700">
											+{stat.currencyGranted.toLocaleString("ja-JP")}
										</td>
										<td className="px-3 py-2 text-right text-red-600">
											-{stat.currencyConsumed.toLocaleString("ja-JP")}
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
