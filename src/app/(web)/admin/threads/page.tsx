"use client";

/**
 * 管理スレッド管理ページ — /admin/threads
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 *
 * 提供機能:
 *   - スレッド一覧テーブル（タイトル / レス数 / 作成日時 / 最終書き込み / 状態）
 *   - スレッド削除: 確認UI（スレッドタイトル・レス数を表示）→ DELETE API 実行
 *   - スレッド詳細: レス一覧テーブル（番号 / 名前 / 本文 / 投稿日時 / 状態）
 *   - レス削除: 確認UI（レス番号・本文プレビュー + コメント入力）→ DELETE API 実行
 *
 * 設計方針:
 *   - Client Component として実装し、fetch API でデータを取得する
 *   - スレッド一覧とスレッド詳細を同一ページ内で state 切替（ページ遷移なし）
 *   - 確認ダイアログは window.confirm() を使わずインライン確認UI を使用する
 *     （レス削除時にコメント入力欄が必要なため）
 */

import { useCallback, useEffect, useState } from "react";
import type { Post } from "@/lib/domain/models/post";
import type { Thread } from "@/lib/domain/models/thread";
import { formatDateTime } from "@/lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ThreadListResponse {
	threads: Thread[];
}

interface ThreadDetailResponse {
	thread: Thread;
	posts: Post[];
}

/** スレッド削除確認ダイアログの状態 */
interface DeleteThreadConfirm {
	thread: Thread;
}

/** レス削除確認ダイアログの状態 */
interface DeletePostConfirm {
	post: Post;
	comment: string;
}

// ---------------------------------------------------------------------------
// スレッド状態バッジ
// ---------------------------------------------------------------------------

/**
 * スレッドの状態を表示するバッジ。
 * 削除済み / 固定 / 休眠 / 通常 を表示する。
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 */
function ThreadStatusBadge({ thread }: { thread: Thread }) {
	if (thread.isDeleted) {
		return (
			<span className="inline-block px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
				削除済
			</span>
		);
	}
	if (thread.isPinned) {
		return (
			<span className="inline-block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
				固定
			</span>
		);
	}
	if (thread.isDormant) {
		return (
			<span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
				休眠
			</span>
		);
	}
	return (
		<span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
			通常
		</span>
	);
}

// ---------------------------------------------------------------------------
// レス状態バッジ
// ---------------------------------------------------------------------------

/**
 * レスの状態を表示するバッジ。
 * 削除済み / 通常 を表示する。
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 */
function PostStatusBadge({ post }: { post: Post }) {
	if (post.isDeleted) {
		return (
			<span className="inline-block px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
				削除済
			</span>
		);
	}
	return (
		<span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
			通常
		</span>
	);
}

// ---------------------------------------------------------------------------
// スレッド管理ページコンポーネント（Client Component）
// ---------------------------------------------------------------------------

/**
 * スレッド管理ページ（Client Component）
 *
 * モード1: スレッド一覧 (selectedThread === null)
 * モード2: スレッド詳細・レス一覧 (selectedThread !== null)
 *
 * See: features/admin.feature @管理者が指定したスレッドを削除する
 * See: features/admin.feature @管理者がコメント付きでレスを削除する
 */
export default function AdminThreadsPage() {
	// ---------------------------------------------------------------------------
	// 状態管理: スレッド一覧
	// ---------------------------------------------------------------------------

	const [threads, setThreads] = useState<Thread[]>([]);
	const [isLoadingThreads, setIsLoadingThreads] = useState(true);
	const [threadListError, setThreadListError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// 状態管理: スレッド詳細（モード2）
	// ---------------------------------------------------------------------------

	/** null のとき: スレッド一覧モード。非 null のとき: スレッド詳細モード */
	const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
	const [posts, setPosts] = useState<Post[]>([]);
	const [isLoadingPosts, setIsLoadingPosts] = useState(false);
	const [postListError, setPostListError] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// 状態管理: 確認ダイアログ
	// ---------------------------------------------------------------------------

	/** スレッド削除確認中の情報（null = 非表示）*/
	const [deleteThreadConfirm, setDeleteThreadConfirm] =
		useState<DeleteThreadConfirm | null>(null);
	/** レス削除確認中の情報（null = 非表示）*/
	const [deletePostConfirm, setDeletePostConfirm] =
		useState<DeletePostConfirm | null>(null);

	/** API実行中フラグ（多重送信防止）*/
	const [isDeleting, setIsDeleting] = useState(false);

	// ---------------------------------------------------------------------------
	// データ取得: スレッド一覧
	// ---------------------------------------------------------------------------

	/**
	 * スレッド一覧を取得する。
	 * See: features/admin.feature @管理者が指定したスレッドを削除する
	 */
	const fetchThreads = useCallback(async () => {
		setIsLoadingThreads(true);
		setThreadListError(null);
		try {
			const res = await fetch("/api/admin/threads", { cache: "no-store" });
			if (!res.ok) {
				setThreadListError("スレッド一覧の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as ThreadListResponse;
			setThreads(data.threads);
		} catch {
			setThreadListError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoadingThreads(false);
		}
	}, []);

	useEffect(() => {
		void fetchThreads();
	}, [fetchThreads]);

	// ---------------------------------------------------------------------------
	// データ取得: スレッド詳細（レス一覧）
	// ---------------------------------------------------------------------------

	/**
	 * スレッド詳細（レス一覧）を取得する。
	 * See: features/admin.feature @管理者がコメント付きでレスを削除する
	 */
	const fetchThreadDetail = useCallback(async (thread: Thread) => {
		setIsLoadingPosts(true);
		setPostListError(null);
		try {
			const res = await fetch(`/api/admin/threads/${thread.id}`, {
				cache: "no-store",
			});
			if (!res.ok) {
				setPostListError("レス一覧の取得に失敗しました。");
				return;
			}
			const data = (await res.json()) as ThreadDetailResponse;
			setSelectedThread(data.thread);
			setPosts(data.posts);
		} catch {
			setPostListError("ネットワークエラーが発生しました。");
		} finally {
			setIsLoadingPosts(false);
		}
	}, []);

	// ---------------------------------------------------------------------------
	// アクション: スレッド一覧に戻る
	// ---------------------------------------------------------------------------

	function handleBackToList() {
		setSelectedThread(null);
		setPosts([]);
		setPostListError(null);
		setDeletePostConfirm(null);
	}

	// ---------------------------------------------------------------------------
	// アクション: スレッド削除
	// ---------------------------------------------------------------------------

	/**
	 * スレッド削除確認ダイアログを表示する。
	 * See: features/admin.feature @管理者が指定したスレッドを削除する
	 */
	function handleDeleteThreadRequest(thread: Thread) {
		setDeleteThreadConfirm({ thread });
	}

	/**
	 * スレッド削除を実行する。
	 * See: features/admin.feature @管理者が指定したスレッドを削除する
	 */
	async function handleDeleteThreadConfirm() {
		if (!deleteThreadConfirm || isDeleting) return;
		setIsDeleting(true);
		try {
			const res = await fetch(
				`/api/admin/threads/${deleteThreadConfirm.thread.id}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				alert("スレッドの削除に失敗しました。");
				return;
			}
			setDeleteThreadConfirm(null);
			// 一覧を再取得して最新状態に更新する
			await fetchThreads();
		} catch {
			alert("ネットワークエラーが発生しました。");
		} finally {
			setIsDeleting(false);
		}
	}

	// ---------------------------------------------------------------------------
	// アクション: レス削除
	// ---------------------------------------------------------------------------

	/**
	 * レス削除確認ダイアログを表示する。
	 * See: features/admin.feature @管理者がコメント付きでレスを削除する
	 */
	function handleDeletePostRequest(post: Post) {
		setDeletePostConfirm({ post, comment: "" });
	}

	/**
	 * レス削除を実行する。
	 * See: features/admin.feature @管理者がコメント付きでレスを削除する
	 */
	async function handleDeletePostConfirm() {
		if (!deletePostConfirm || !selectedThread || isDeleting) return;
		setIsDeleting(true);
		try {
			const commentParam = deletePostConfirm.comment
				? `?comment=${encodeURIComponent(deletePostConfirm.comment)}`
				: "";
			const res = await fetch(
				`/api/admin/posts/${deletePostConfirm.post.id}${commentParam}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				alert("レスの削除に失敗しました。");
				return;
			}
			setDeletePostConfirm(null);
			// レス一覧を再取得して最新状態に更新する
			await fetchThreadDetail(selectedThread);
		} catch {
			alert("ネットワークエラーが発生しました。");
		} finally {
			setIsDeleting(false);
		}
	}

	// ---------------------------------------------------------------------------
	// レンダリング: スレッド一覧モード
	// ---------------------------------------------------------------------------

	if (selectedThread === null) {
		return (
			<div className="space-y-4">
				{/* ページヘッダー */}
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-bold text-gray-800">スレッド管理</h2>
					<span className="text-sm text-gray-500">
						全 {threads.length.toLocaleString("ja-JP")} 件
					</span>
				</div>

				{threadListError && (
					<p className="text-red-600 text-sm">{threadListError}</p>
				)}

				{/* スレッド一覧テーブル
            See: features/admin.feature @管理者が指定したスレッドを削除する */}
				<div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
					<table
						id="thread-list-table"
						className="w-full text-sm text-left border-collapse"
					>
						<thead>
							<tr className="bg-gray-50 border-b border-gray-200">
								<th className="px-3 py-2 font-medium text-gray-600">
									タイトル
								</th>
								<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
									レス数
								</th>
								<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
									作成日時
								</th>
								<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
									最終書き込み
								</th>
								<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
									状態
								</th>
								<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
									操作
								</th>
							</tr>
						</thead>
						<tbody>
							{isLoadingThreads ? (
								<tr>
									<td
										colSpan={6}
										className="px-3 py-6 text-center text-gray-500 text-sm"
									>
										読み込み中...
									</td>
								</tr>
							) : threads.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-3 py-6 text-center text-gray-400 text-sm"
									>
										スレッドが見つかりません
									</td>
								</tr>
							) : (
								threads.map((thread) => (
									<tr
										key={thread.id}
										className={`border-b border-gray-100 hover:bg-gray-50 ${
											thread.isDeleted ? "bg-gray-100 opacity-60" : ""
										}`}
									>
										{/* タイトル */}
										<td className="px-3 py-2 text-xs text-gray-800 max-w-xs truncate">
											{thread.title}
										</td>
										{/* レス数 */}
										<td className="px-3 py-2 text-right text-xs">
											{thread.postCount.toLocaleString("ja-JP")}
										</td>
										{/* 作成日時 */}
										<td className="px-3 py-2 text-xs whitespace-nowrap">
											{formatDateTime(thread.createdAt)}
										</td>
										{/* 最終書き込み */}
										<td className="px-3 py-2 text-xs whitespace-nowrap">
											{formatDateTime(thread.lastPostAt)}
										</td>
										{/* 状態バッジ */}
										<td className="px-3 py-2">
											<ThreadStatusBadge thread={thread} />
										</td>
										{/* 操作ボタン */}
										<td className="px-3 py-2">
											<div className="flex gap-1">
												<button
													type="button"
													onClick={() => void fetchThreadDetail(thread)}
													className="inline-block px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
												>
													詳細
												</button>
												{/* 削除済みスレッドの「削除」ボタンは非表示（二重削除防止）
                            See: タスク指示書 §補足・制約 */}
												{!thread.isDeleted && (
													<button
														type="button"
														onClick={() => handleDeleteThreadRequest(thread)}
														className="inline-block px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
													>
														削除
													</button>
												)}
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{/* スレッド削除確認ダイアログ（インライン）
            See: features/admin.feature @管理者が指定したスレッドを削除する */}
				{deleteThreadConfirm && (
					<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
						<div className="bg-white rounded shadow-lg p-6 max-w-md w-full mx-4">
							<h3 className="text-base font-bold text-gray-800 mb-4">
								スレッドを削除しますか？
							</h3>
							<div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
								<p className="text-gray-700 font-medium">
									{deleteThreadConfirm.thread.title}
								</p>
								<p className="text-gray-500">
									レス数:{" "}
									{deleteThreadConfirm.thread.postCount.toLocaleString("ja-JP")}{" "}
									件
								</p>
							</div>
							<p className="text-xs text-red-600 mb-4">
								この操作は元に戻せません。スレッド内の全レスも削除されます。
							</p>
							<div className="flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setDeleteThreadConfirm(null)}
									disabled={isDeleting}
									className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-40"
								>
									キャンセル
								</button>
								<button
									type="button"
									onClick={() => void handleDeleteThreadConfirm()}
									disabled={isDeleting}
									className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40"
								>
									{isDeleting ? "削除中..." : "削除する"}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// レンダリング: スレッド詳細（レス一覧）モード
	// ---------------------------------------------------------------------------

	return (
		<div className="space-y-4">
			{/* ページヘッダー */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={handleBackToList}
					className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
				>
					一覧に戻る
				</button>
				<h2 className="text-lg font-bold text-gray-800 truncate max-w-lg">
					{selectedThread.title}
				</h2>
				<span className="text-sm text-gray-500 whitespace-nowrap">
					{posts.length.toLocaleString("ja-JP")} 件
				</span>
			</div>

			{postListError && <p className="text-red-600 text-sm">{postListError}</p>}

			{/* レス一覧テーブル
          See: features/admin.feature @管理者がコメント付きでレスを削除する */}
			<div className="bg-white border border-gray-200 rounded shadow-sm overflow-x-auto">
				<table
					id="post-list-table"
					className="w-full text-sm text-left border-collapse"
				>
					<thead>
						<tr className="bg-gray-50 border-b border-gray-200">
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap text-right">
								番号
							</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								名前
							</th>
							<th className="px-3 py-2 font-medium text-gray-600">本文</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								投稿日時
							</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								状態
							</th>
							<th className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
								操作
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoadingPosts ? (
							<tr>
								<td
									colSpan={6}
									className="px-3 py-6 text-center text-gray-500 text-sm"
								>
									読み込み中...
								</td>
							</tr>
						) : posts.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-3 py-6 text-center text-gray-400 text-sm"
								>
									レスが見つかりません
								</td>
							</tr>
						) : (
							posts.map((post) => (
								<tr
									key={post.id}
									className={`border-b border-gray-100 hover:bg-gray-50 ${
										post.isDeleted ? "bg-gray-100 opacity-60" : ""
									}`}
								>
									{/* レス番号 */}
									<td className="px-3 py-2 text-right text-xs font-mono text-gray-600">
										{post.postNumber}
									</td>
									{/* 名前 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{post.displayName}
									</td>
									{/* 本文（先頭50文字）*/}
									<td className="px-3 py-2 text-xs text-gray-700 max-w-xs">
										{post.body.slice(0, 50)}
										{post.body.length > 50 && "…"}
									</td>
									{/* 投稿日時 */}
									<td className="px-3 py-2 text-xs whitespace-nowrap">
										{formatDateTime(post.createdAt)}
									</td>
									{/* 状態バッジ */}
									<td className="px-3 py-2">
										<PostStatusBadge post={post} />
									</td>
									{/* 操作ボタン */}
									<td className="px-3 py-2">
										{/* 削除済みレスの「削除」ボタンは非表示（二重削除防止）*/}
										{!post.isDeleted && (
											<button
												type="button"
												onClick={() => handleDeletePostRequest(post)}
												className="inline-block px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
											>
												削除
											</button>
										)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* レス削除確認ダイアログ（インライン、コメント入力欄付き）
          See: features/admin.feature @管理者がコメント付きでレスを削除する */}
			{deletePostConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-white rounded shadow-lg p-6 max-w-md w-full mx-4">
						<h3 className="text-base font-bold text-gray-800 mb-4">
							レスを削除しますか？
						</h3>
						<div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
							<p className="text-gray-500 text-xs">
								レス番号: {deletePostConfirm.post.postNumber}
							</p>
							<p className="text-gray-700">
								{deletePostConfirm.post.body.slice(0, 80)}
								{deletePostConfirm.post.body.length > 80 && "…"}
							</p>
						</div>
						{/* 削除コメント入力欄（任意）
                See: features/admin.feature @管理者がコメント付きでレスを削除する */}
						<div className="mb-4">
							<label
								htmlFor="delete-comment"
								className="block text-sm font-medium text-gray-700 mb-1"
							>
								削除コメント（任意）
							</label>
							<input
								id="delete-comment"
								type="text"
								value={deletePostConfirm.comment}
								onChange={(e) =>
									setDeletePostConfirm((prev) =>
										prev ? { ...prev, comment: e.target.value } : null,
									)
								}
								placeholder="システムレスに表示するコメント"
								className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setDeletePostConfirm(null)}
								disabled={isDeleting}
								className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-40"
							>
								キャンセル
							</button>
							<button
								type="button"
								onClick={() => void handleDeletePostConfirm()}
								disabled={isDeleting}
								className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40"
							>
								{isDeleting ? "削除中..." : "削除する"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
