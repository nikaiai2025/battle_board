"use client";

/**
 * 管理ユーザー一覧ページ — /admin/users
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 * See: tmp/feature_plan_admin_expansion.md §6-d ユーザー一覧ページ
 *
 * 提供機能:
 *   - ユーザー一覧テーブル（ID / 登録日時 / ステータス / 通貨残高 / 最終書き込み日 / ストリーク）
 *   - ページネーション（50件ずつ）
 *   - 各行に「詳細」リンク
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - ページネーションは offset ベース（limit=50 固定）
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { UserListItem } from "@/lib/services/admin-service";
import { formatDateTime } from "@/lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface UserListResponse {
	users: UserListItem[];
	total: number;
	limit: number;
	offset: number;
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// ユーザーステータスバッジ
// ---------------------------------------------------------------------------

/**
 * ユーザーのステータスを表示するバッジ。
 * BANされているかどうか、本登録/仮ユーザー、有料/無料を組み合わせて表示する。
 * See: tmp/feature_plan_admin_expansion.md §6-d カラム：ステータス
 */
function StatusBadges({ user }: { user: UserListItem }) {
	return (
		<div className="flex flex-wrap gap-1">
			{user.isBanned && (
				<span className="inline-block px-1.5 py-0.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 text-xs font-bold rounded">
					BAN
				</span>
			)}
			{user.registrationType ? (
				<span className="inline-block px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs rounded">
					本登録
				</span>
			) : (
				<span className="inline-block px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded">
					仮
				</span>
			)}
			{user.isPremium ? (
				<span className="inline-block px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 text-xs rounded">
					有料
				</span>
			) : (
				<span className="inline-block px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded">
					無料
				</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// ユーザー一覧ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * ユーザー一覧ページ（Client Component）
 *
 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
 */
export default function AdminUsersPage() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [users, setUsers] = useState<UserListItem[]>([]);
	const [total, setTotal] = useState(0);
	const [currentPage, setCurrentPage] = useState(0); // 0-indexed
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * 指定ページのユーザー一覧を取得する。
	 * See: features/admin.feature @管理者がユーザー一覧を閲覧できる
	 */
	const fetchUsers = useCallback(async (page: number) => {
		setIsLoading(true);
		setError(null);
		try {
			const offset = page * PAGE_SIZE;
			const res = await fetch(
				`/api/admin/users?limit=${PAGE_SIZE}&offset=${offset}`,
				{ cache: "no-store" },
			);
			if (!res.ok) {
				setError("ユーザー一覧の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as UserListResponse;
			setUsers(data.users);
			setTotal(data.total);
		} catch {
			setError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchUsers(currentPage);
	}, [fetchUsers, currentPage]);

	// ---------------------------------------------------------------------------
	// ページネーション計算
	// ---------------------------------------------------------------------------

	const totalPages = Math.ceil(total / PAGE_SIZE);
	const hasPrev = currentPage > 0;
	const hasNext = currentPage < totalPages - 1;

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-bold text-foreground">ユーザー一覧</h2>
				<span className="text-sm text-muted-foreground">
					全 {total.toLocaleString("ja-JP")} 件
				</span>
			</div>

			{error && <p className="text-red-600 text-sm">{error}</p>}

			{/* ユーザー一覧テーブル
          See: features/admin.feature @管理者がユーザー一覧を閲覧できる
          See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される */}
			<div className="bg-card border border-border rounded shadow-sm overflow-x-auto">
				<table
					id="user-list-table"
					className="w-full text-sm text-left border-collapse"
				>
					<thead>
						<tr className="bg-muted border-b border-border">
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
								ユーザーID（短縮）
							</th>
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
								登録日時
							</th>
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
								ステータス
							</th>
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
								通貨残高
							</th>
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
								最終書き込み日
							</th>
							<th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-right">
								ストリーク
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
						) : users.length === 0 ? (
							<tr>
								<td
									colSpan={7}
									className="px-3 py-6 text-center text-muted-foreground text-sm"
								>
									ユーザーが見つかりません
								</td>
							</tr>
						) : (
							users.map((user) => (
								<tr
									key={user.id}
									className={`border-b border-border hover:bg-accent ${
										user.isBanned ? "bg-red-50 dark:bg-red-950/30" : ""
									}`}
								>
									{/* ユーザーID（短縮表示）
                      See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される */}
									<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
										{user.id.slice(0, 8)}...
									</td>
									{/* 登録日時 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{formatDateTime(user.createdAt)}
									</td>
									{/* ステータスバッジ */}
									<td className="px-3 py-2">
										<StatusBadges user={user} />
									</td>
									{/* 通貨残高
                      See: features/admin.feature @各ユーザーのID、登録日時、ステータス、通貨残高が表示される */}
									<td className="px-3 py-2 text-right text-xs">
										{user.balance.toLocaleString("ja-JP")}
									</td>
									{/* 最終書き込み日 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{user.lastPostDate ?? "—"}
									</td>
									{/* ストリーク */}
									<td className="px-3 py-2 text-right text-xs">
										{user.streakDays}日
									</td>
									{/* 詳細リンク */}
									<td className="px-3 py-2">
										<Link
											href={`/admin/users/${user.id}`}
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

			{/* ページネーション
          See: tmp/feature_plan_admin_expansion.md §6-d ユーザー一覧ページ */}
			{totalPages > 1 && (
				<div id="pagination" className="flex items-center justify-between">
					<button
						type="button"
						onClick={() => setCurrentPage((p) => p - 1)}
						disabled={!hasPrev}
						className="px-3 py-1.5 text-sm bg-muted text-foreground rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
					>
						前へ
					</button>
					<span className="text-sm text-muted-foreground">
						{currentPage + 1} / {totalPages} ページ
					</span>
					<button
						type="button"
						onClick={() => setCurrentPage((p) => p + 1)}
						disabled={!hasNext}
						className="px-3 py-1.5 text-sm bg-muted text-foreground rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
					>
						次へ
					</button>
				</div>
			)}
		</div>
	);
}
