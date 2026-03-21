"use client";

/**
 * IP BAN管理ページ — /admin/ip-bans
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 * See: tmp/feature_plan_admin_expansion.md §6-a ルーティング構成
 *
 * 提供機能:
 *   - 有効な IP BAN 一覧テーブル（BAN日時 / 有効期限 / 理由）
 *   - 各BAN の解除ボタン
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - セキュリティ: IP ハッシュ値はサーバー側でフィルタリングされており、このページには表示しない
 *     （管理者に IP ハッシュを直接扱わせない方針）
 *   - See: tmp/feature_plan_admin_expansion.md §2-g セキュリティ注意
 */

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** IP BAN レスポンス型（ipHash を除いたサニタイズ済み）
 * See: src/app/api/admin/ip-bans/route.ts GET レスポンス
 */
interface SanitizedIpBan {
	id: string;
	reason: string | null;
	bannedAt: string;
	expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// IP BAN管理ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * IP BAN管理ページ（Client Component）
 *
 * See: features/admin.feature @管理者がIP BANを解除する
 */
export default function AdminIpBansPage() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [bans, setBans] = useState<SanitizedIpBan[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [removingId, setRemovingId] = useState<string | null>(null);
	const [removeMessage, setRemoveMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * 有効な IP BAN 一覧を取得する。
	 * See: tmp/feature_plan_admin_expansion.md §2-g GET /api/admin/ip-bans
	 */
	const fetchBans = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/ip-bans", { cache: "no-store" });
			if (!res.ok) {
				setError("IP BAN一覧の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as { bans: SanitizedIpBan[] };
			setBans(data.bans);
		} catch {
			setError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchBans();
	}, [fetchBans]);

	// ---------------------------------------------------------------------------
	// イベントハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * IP BAN を解除する。
	 * See: features/admin.feature @管理者がIP BANを解除する
	 */
	const handleRemoveBan = async (banId: string) => {
		setRemoveMessage(null);
		setRemovingId(banId);
		try {
			const res = await fetch(`/api/admin/ip-bans/${banId}`, {
				method: "DELETE",
			});
			const data = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok) {
				setRemoveMessage({
					type: "error",
					text: data.error ?? "BAN解除に失敗しました。",
				});
				return;
			}
			setRemoveMessage({ type: "success", text: "IP BANを解除しました。" });
			// 一覧から削除したBANを取り除く（再取得の代わりにローカル更新）
			setBans((prev) => prev.filter((b) => b.id !== banId));
		} catch {
			setRemoveMessage({
				type: "error",
				text: "ネットワークエラーが発生しました。",
			});
		} finally {
			setRemovingId(null);
		}
	};

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-bold text-gray-800">IP BAN管理</h2>
				<span className="text-sm text-gray-500">
					有効なBAN: {bans.length.toLocaleString("ja-JP")} 件
				</span>
			</div>

			{/* セキュリティ注意書き */}
			<p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
				IP
				ハッシュはセキュリティ上の理由から表示されません。ユーザー詳細ページの
				「このIPをBANする」ボタンからBANを追加できます。
			</p>

			{/* メッセージ表示 */}
			{removeMessage && (
				<p
					className={`text-sm ${removeMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
				>
					{removeMessage.text}
				</p>
			)}

			{error && <p className="text-red-600 text-sm">{error}</p>}

			{/* IP BAN 一覧テーブル
          See: features/admin.feature @管理者がIP BANを解除する */}
			<div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
				<table
					id="ip-ban-list-table"
					className="w-full text-sm text-left border-collapse"
				>
					<thead>
						<tr className="bg-gray-50 border-b border-gray-200">
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								BAN日時
							</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								有効期限
							</th>
							<th className="px-3 py-2 font-medium text-gray-600">理由</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								操作
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td
									colSpan={4}
									className="px-3 py-6 text-center text-gray-500 text-sm"
								>
									読み込み中...
								</td>
							</tr>
						) : bans.length === 0 ? (
							<tr>
								<td
									colSpan={4}
									className="px-3 py-6 text-center text-gray-400 text-sm"
								>
									有効なIP BANはありません
								</td>
							</tr>
						) : (
							bans.map((ban) => (
								<tr
									key={ban.id}
									className="border-b border-gray-100 hover:bg-gray-50"
								>
									{/* BAN日時 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{formatDateTime(ban.bannedAt)}
									</td>
									{/* 有効期限 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{ban.expiresAt ? (
											formatDateTime(ban.expiresAt)
										) : (
											<span className="text-red-600 font-medium">無期限</span>
										)}
									</td>
									{/* 理由 */}
									<td className="px-3 py-2 text-xs text-gray-600">
										{ban.reason ?? <span className="text-gray-400">—</span>}
									</td>
									{/* 解除ボタン
                      See: features/admin.feature @管理者がIP BANを解除する */}
									<td className="px-3 py-2">
										<button
											type="button"
											onClick={() => {
												void handleRemoveBan(ban.id);
											}}
											disabled={removingId === ban.id}
											className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50"
										>
											{removingId === ban.id ? "解除中..." : "解除"}
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
