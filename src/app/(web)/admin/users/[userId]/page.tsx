"use client";

/**
 * 管理ユーザー詳細ページ — /admin/users/[userId]
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
 * See: features/admin.feature @管理者がユーザーをBANする
 * See: features/admin.feature @管理者がユーザーのIPをBANする
 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
 * See: tmp/feature_plan_admin_expansion.md §6-e ユーザー詳細ページ
 *
 * 提供機能:
 *   - 基本情報セクション（ID / 登録日時 / ステータス / 通貨残高 / ストリーク / 草カウント）
 *   - 書き込み履歴セクション（スレッドID / 本文 / 日時）
 *   - 管理操作セクション（通貨付与フォーム / ユーザーBAN / IP BAN ボタン）
 *
 * 設計方針:
 *   - Client Component として実装し、use パラメータ for params
 *   - 管理操作（BAN / 通貨付与）はそれぞれの API を fetch で呼び出す
 *   - 操作後にユーザー詳細を再取得してUIを最新状態に更新する
 */

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { Post } from "@/lib/domain/models/post";
import type { UserDetail } from "@/lib/services/admin-service";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface PostHistoryResponse {
	posts: Post[];
	limit: number;
	offset: number;
}

// ---------------------------------------------------------------------------
// ユーザー詳細ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * ユーザー詳細ページ（Client Component）
 *
 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
 */
export default function AdminUserDetailPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const { userId } = use(params);

	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
	const [posts, setPosts] = useState<Post[]>([]);
	const [isLoadingDetail, setIsLoadingDetail] = useState(true);
	const [isLoadingPosts, setIsLoadingPosts] = useState(true);
	const [detailError, setDetailError] = useState<string | null>(null);

	// 通貨付与フォームの状態
	const [currencyAmount, setCurrencyAmount] = useState("");
	const [isGrantingCurrency, setIsGrantingCurrency] = useState(false);
	const [currencyMessage, setCurrencyMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// BAN操作の状態
	const [isBanning, setIsBanning] = useState(false);
	const [isIpBanning, setIsIpBanning] = useState(false);
	const [banMessage, setBanMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * ユーザー詳細を取得する。
	 * See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
	 */
	const fetchUserDetail = useCallback(async () => {
		setIsLoadingDetail(true);
		setDetailError(null);
		try {
			const res = await fetch(`/api/admin/users/${userId}`, {
				cache: "no-store",
			});
			if (res.status === 404) {
				setDetailError("ユーザーが見つかりません。");
				return;
			}
			if (!res.ok) {
				setDetailError("ユーザー詳細の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as UserDetail;
			setUserDetail(data);
		} catch {
			setDetailError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoadingDetail(false);
		}
	}, [userId]);

	/**
	 * 書き込み履歴を取得する。
	 * See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
	 */
	const fetchPosts = useCallback(async () => {
		setIsLoadingPosts(true);
		try {
			const res = await fetch(`/api/admin/users/${userId}/posts?limit=50`, {
				cache: "no-store",
			});
			if (!res.ok) return;
			const data = (await res.json()) as PostHistoryResponse;
			setPosts(data.posts);
		} catch {
			// 書き込み履歴取得失敗はサイレントに処理する
		} finally {
			setIsLoadingPosts(false);
		}
	}, [userId]);

	useEffect(() => {
		void fetchUserDetail();
		void fetchPosts();
	}, [fetchUserDetail, fetchPosts]);

	// ---------------------------------------------------------------------------
	// イベントハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * 通貨付与を実行する。
	 * See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
	 */
	const handleGrantCurrency = async (e: React.FormEvent) => {
		e.preventDefault();
		setCurrencyMessage(null);
		const amount = Number.parseInt(currencyAmount, 10);
		if (!Number.isInteger(amount) || amount <= 0) {
			setCurrencyMessage({
				type: "error",
				text: "正の整数を入力してください。",
			});
			return;
		}

		setIsGrantingCurrency(true);
		try {
			const res = await fetch(`/api/admin/users/${userId}/currency`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ amount }),
			});
			const data = (await res.json()) as {
				success?: boolean;
				newBalance?: number;
				error?: string;
			};
			if (!res.ok) {
				setCurrencyMessage({
					type: "error",
					text: data.error ?? "通貨付与に失敗しました。",
				});
				return;
			}
			setCurrencyMessage({
				type: "success",
				text: `付与成功。新残高: ${data.newBalance?.toLocaleString("ja-JP") ?? "?"} BT`,
			});
			setCurrencyAmount("");
			// ユーザー詳細を再取得して残高を更新する
			void fetchUserDetail();
		} catch {
			setCurrencyMessage({
				type: "error",
				text: "ネットワークエラーが発生しました。",
			});
		} finally {
			setIsGrantingCurrency(false);
		}
	};

	/**
	 * ユーザーBANを実行する。
	 * See: features/admin.feature @管理者がユーザーをBANする
	 */
	const handleBanUser = async () => {
		if (!userDetail) return;
		setBanMessage(null);
		setIsBanning(true);
		try {
			const res = await fetch(`/api/admin/users/${userId}/ban`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok) {
				setBanMessage({
					type: "error",
					text: data.error ?? "BAN操作に失敗しました。",
				});
				return;
			}
			setBanMessage({ type: "success", text: "ユーザーをBANしました。" });
			// ユーザー詳細を再取得してステータスを更新する
			void fetchUserDetail();
		} catch {
			setBanMessage({
				type: "error",
				text: "ネットワークエラーが発生しました。",
			});
		} finally {
			setIsBanning(false);
		}
	};

	/**
	 * ユーザーBAN解除を実行する。
	 * See: features/admin.feature @管理者がユーザーBANを解除する
	 */
	const handleUnbanUser = async () => {
		if (!userDetail) return;
		setBanMessage(null);
		setIsBanning(true);
		try {
			const res = await fetch(`/api/admin/users/${userId}/ban`, {
				method: "DELETE",
			});
			const data = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok) {
				setBanMessage({
					type: "error",
					text: data.error ?? "BAN解除に失敗しました。",
				});
				return;
			}
			setBanMessage({ type: "success", text: "BAN解除しました。" });
			void fetchUserDetail();
		} catch {
			setBanMessage({
				type: "error",
				text: "ネットワークエラーが発生しました。",
			});
		} finally {
			setIsBanning(false);
		}
	};

	/**
	 * IP BANを実行する。
	 * See: features/admin.feature @管理者がユーザーのIPをBANする
	 */
	const handleIpBan = async () => {
		if (!userDetail) return;
		setBanMessage(null);
		setIsIpBanning(true);
		try {
			const res = await fetch("/api/admin/ip-bans", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId }),
			});
			const data = (await res.json()) as {
				success?: boolean;
				banId?: string;
				error?: string;
			};
			if (!res.ok) {
				setBanMessage({
					type: "error",
					text: data.error ?? "IP BANに失敗しました。",
				});
				return;
			}
			setBanMessage({ type: "success", text: "IP BANを登録しました。" });
		} catch {
			setBanMessage({
				type: "error",
				text: "ネットワークエラーが発生しました。",
			});
		} finally {
			setIsIpBanning(false);
		}
	};

	// ---------------------------------------------------------------------------
	// ローディング・エラー表示
	// ---------------------------------------------------------------------------

	if (isLoadingDetail) {
		return (
			<div className="space-y-4">
				<Link
					href="/admin/users"
					className="text-sm text-blue-600 hover:underline"
				>
					← ユーザー一覧に戻る
				</Link>
				<p className="text-gray-500 text-sm">読み込み中...</p>
			</div>
		);
	}

	if (detailError || !userDetail) {
		return (
			<div className="space-y-4">
				<Link
					href="/admin/users"
					className="text-sm text-blue-600 hover:underline"
				>
					← ユーザー一覧に戻る
				</Link>
				<p className="text-red-600 text-sm">
					{detailError ?? "ユーザー情報を取得できませんでした。"}
				</p>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	const registrationLabel =
		userDetail.registrationType === "email"
			? "メール"
			: userDetail.registrationType === "discord"
				? "Discord"
				: "仮ユーザー（未登録）";

	return (
		<div className="space-y-6">
			{/* ナビゲーション */}
			<div className="flex items-center gap-2">
				<Link
					href="/admin/users"
					className="text-sm text-blue-600 hover:underline"
				>
					← ユーザー一覧に戻る
				</Link>
			</div>

			<h2 className="text-lg font-bold text-gray-800">ユーザー詳細</h2>

			{/* =============================
          基本情報セクション
          See: features/admin.feature @管理者が特定ユーザーの詳細を閲覧できる
          See: features/admin.feature @ユーザーの基本情報（ステータス、通貨残高、ストリーク）が表示される
          ============================= */}
			<section
				id="user-basic-info"
				className="bg-white border border-gray-200 rounded p-4 shadow-sm space-y-2"
			>
				<h3 className="text-base font-bold text-gray-700">基本情報</h3>

				<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
					{/* ユーザーID */}
					<div>
						<span className="text-gray-500 text-xs">ユーザーID</span>
						<p className="font-mono text-xs text-gray-700 break-all">
							{userDetail.id}
						</p>
					</div>
					{/* 登録日時 */}
					<div>
						<span className="text-gray-500 text-xs">登録日時</span>
						<p className="text-gray-700">
							{new Date(userDetail.createdAt).toLocaleString("ja-JP")}
						</p>
					</div>
					{/* BANステータス */}
					<div>
						<span className="text-gray-500 text-xs">BANステータス</span>
						<p>
							{userDetail.isBanned ? (
								<span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
									BAN済み
								</span>
							) : (
								<span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
									有効
								</span>
							)}
						</p>
					</div>
					{/* アカウント種別 */}
					<div>
						<span className="text-gray-500 text-xs">アカウント種別</span>
						<p className="text-gray-700">{registrationLabel}</p>
					</div>
					{/* 有料/無料 */}
					<div>
						<span className="text-gray-500 text-xs">プラン</span>
						<p>
							{userDetail.isPremium ? (
								<span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
									有料
								</span>
							) : (
								<span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
									無料
								</span>
							)}
						</p>
					</div>
					{/* ユーザーネーム */}
					<div>
						<span className="text-gray-500 text-xs">ユーザーネーム</span>
						<p className="text-gray-700">{userDetail.username ?? "—"}</p>
					</div>
					{/* 通貨残高 */}
					<div>
						<span className="text-gray-500 text-xs">通貨残高</span>
						<p className="text-gray-700 font-bold text-yellow-700">
							{userDetail.balance.toLocaleString("ja-JP")} BT
						</p>
					</div>
					{/* ストリーク */}
					<div>
						<span className="text-gray-500 text-xs">ストリーク</span>
						<p className="text-gray-700">{userDetail.streakDays}日</p>
					</div>
					{/* 草カウント */}
					<div>
						<span className="text-gray-500 text-xs">草カウント</span>
						<p className="text-gray-700">{userDetail.grassCount}本</p>
					</div>
				</div>
			</section>

			{/* =============================
          管理操作セクション
          See: features/admin.feature @管理者がユーザーをBANする
          See: features/admin.feature @管理者がユーザーのIPをBANする
          See: features/admin.feature @管理者が指定ユーザーに通貨を付与する
          See: tmp/feature_plan_admin_expansion.md §6-e 管理操作
          ============================= */}
			<section
				id="admin-operations"
				className="bg-white border border-gray-200 rounded p-4 shadow-sm space-y-4"
			>
				<h3 className="text-base font-bold text-gray-700">管理操作</h3>

				{/* メッセージ表示 */}
				{banMessage && (
					<p
						className={`text-sm ${banMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
					>
						{banMessage.text}
					</p>
				)}

				{/* 通貨付与フォーム
            See: features/admin.feature @管理者が指定ユーザーに通貨を付与する */}
				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">通貨付与</h4>
					<form
						onSubmit={(e) => {
							void handleGrantCurrency(e);
						}}
						className="flex items-center gap-2"
					>
						<input
							id="currency-amount-input"
							type="number"
							min="1"
							value={currencyAmount}
							onChange={(e) => setCurrencyAmount(e.target.value)}
							placeholder="付与額（BT）"
							className="w-32 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
						/>
						<button
							id="grant-currency-button"
							type="submit"
							disabled={isGrantingCurrency}
							className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
						>
							{isGrantingCurrency ? "付与中..." : "付与する"}
						</button>
					</form>
					{currencyMessage && (
						<p
							className={`text-xs mt-1 ${currencyMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
						>
							{currencyMessage.text}
						</p>
					)}
				</div>

				{/* BAN / BAN解除ボタン
            See: features/admin.feature @管理者がユーザーをBANする
            See: features/admin.feature @管理者がユーザーBANを解除する */}
				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">
						ユーザーBAN
					</h4>
					<div className="flex gap-2">
						{userDetail.isBanned ? (
							<button
								id="unban-user-button"
								type="button"
								onClick={() => {
									void handleUnbanUser();
								}}
								disabled={isBanning}
								className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
							>
								{isBanning ? "処理中..." : "BAN解除する"}
							</button>
						) : (
							<button
								id="ban-user-button"
								type="button"
								onClick={() => {
									void handleBanUser();
								}}
								disabled={isBanning}
								className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
							>
								{isBanning ? "処理中..." : "BANする"}
							</button>
						)}
					</div>
				</div>

				{/* IP BANボタン
            See: features/admin.feature @管理者がユーザーのIPをBANする
            See: tmp/feature_plan_admin_expansion.md §2-d IP BAN 対象の特定方法 */}
				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">IP BAN</h4>
					<p className="text-xs text-gray-500 mb-2">
						このユーザーの最終アクセスIPをBANします。
						IPが変わると効果がありません（IP BANの本質的限界）。
					</p>
					<button
						id="ip-ban-button"
						type="button"
						onClick={() => {
							void handleIpBan();
						}}
						disabled={isIpBanning}
						className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50"
					>
						{isIpBanning ? "処理中..." : "このIPをBANする"}
					</button>
				</div>
			</section>

			{/* =============================
          書き込み履歴セクション
          See: features/admin.feature @管理者がユーザーの書き込み履歴を確認できる
          See: features/admin.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる
          ============================= */}
			<section
				id="post-history"
				className="bg-white border border-gray-200 rounded p-4 shadow-sm space-y-3"
			>
				<h3 className="text-base font-bold text-gray-700">書き込み履歴</h3>

				{isLoadingPosts ? (
					<p className="text-gray-500 text-sm">読み込み中...</p>
				) : posts.length === 0 ? (
					<p className="text-gray-400 text-sm">書き込み履歴がありません。</p>
				) : (
					<ul id="post-history-list" className="space-y-2">
						{posts.map((post) => (
							<li
								key={post.id}
								className="border-b border-gray-100 pb-2 last:border-b-0"
							>
								{/* スレッドID・本文・日時
                    See: features/admin.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる */}
								<div className="text-xs text-gray-500 mb-0.5 flex gap-3">
									<span>
										<span className="font-medium">スレッドID:</span>{" "}
										<span className="font-mono">
											{post.threadId.slice(0, 8)}...
										</span>
									</span>
									<span>
										{new Date(post.createdAt).toLocaleString("ja-JP")}
									</span>
									<span>レス#{post.postNumber}</span>
								</div>
								<p
									className={`text-sm line-clamp-2 ${
										post.isDeleted
											? "text-gray-400 line-through"
											: "text-gray-800"
									}`}
								>
									{post.isDeleted ? "（削除済み）" : post.body}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
