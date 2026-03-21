"use client";

/**
 * 書き込み履歴セクション — マイページ内の書き込み履歴・検索・ページネーションを担うコンポーネント
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 * See: tmp/workers/bdd-architect_TASK-237/design.md §6 UIコンポーネント設計
 *
 * 責務:
 *   - 検索フォームの状態管理（keyword, startDate, endDate）
 *   - ページネーションの状態管理（currentPage）
 *   - GET /api/mypage/history の呼び出しとレスポンス管理
 *   - 検索結果の表示（0件メッセージ含む）
 *   - ページネーションコントロールの表示（totalPages <= 1 の場合は非表示）
 */

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "../../../../lib/utils/date";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 書き込み履歴1件
 * See: tmp/workers/bdd-architect_TASK-237/design.md §4.1 PostHistoryItem の拡張
 */
interface PostHistoryItem {
	id: string;
	threadId: string;
	threadTitle: string; // スレッドタイトル（API JOIN で取得）
	postNumber: number;
	body: string;
	createdAt: string;
}

/** API レスポンス型
 * See: tmp/workers/bdd-architect_TASK-237/design.md §2.3 レスポンス型
 */
interface PostHistoryResponse {
	posts: PostHistoryItem[];
	total: number;
	totalPages: number;
	page: number;
}

/** 検索パラメータ */
interface SearchParams {
	keyword: string;
	startDate: string;
	endDate: string;
}

// ---------------------------------------------------------------------------
// PostHistorySection コンポーネント
// ---------------------------------------------------------------------------

/**
 * 書き込み履歴セクション（マイページ内）
 *
 * See: features/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
 * See: features/mypage.feature @書き込み履歴をキーワードや日付範囲で絞り込める
 */
export default function PostHistorySection() {
	// ---------------------------------------------------------------------------
	// 状態管理
	// ---------------------------------------------------------------------------

	/** 書き込み履歴の表示状態 */
	const [posts, setPosts] = useState<PostHistoryItem[]>([]);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [isLoading, setIsLoading] = useState(true);

	/** 検索フォームの入力状態（サブミット前の入力値）
	 * See: features/mypage.feature @キーワードで書き込み履歴を検索する
	 * See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
	 */
	const [searchInput, setSearchInput] = useState<SearchParams>({
		keyword: "",
		startDate: "",
		endDate: "",
	});

	/** 現在適用中の検索条件（fetchHistory に渡す値）
	 * 検索ボタン押下時にのみ更新される
	 */
	const [appliedSearch, setAppliedSearch] = useState<SearchParams>({
		keyword: "",
		startDate: "",
		endDate: "",
	});

	// ---------------------------------------------------------------------------
	// データ取得
	// ---------------------------------------------------------------------------

	/**
	 * 書き込み履歴を API から取得する。
	 * 検索条件・ページ番号を URL クエリパラメータとして送信する。
	 *
	 * See: features/mypage.feature @書き込み履歴は新しい順に50件ずつ表示される
	 * See: tmp/workers/bdd-architect_TASK-237/design.md §2.1 エンドポイント変更
	 */
	const fetchHistory = useCallback(
		async (page: number, search: SearchParams) => {
			setIsLoading(true);
			try {
				// クエリパラメータを構築する
				const params = new URLSearchParams();
				params.set("page", String(page));
				if (search.keyword.trim() !== "") {
					params.set("keyword", search.keyword.trim());
				}
				if (search.startDate !== "") {
					params.set("start_date", search.startDate);
				}
				if (search.endDate !== "") {
					params.set("end_date", search.endDate);
				}

				const res = await fetch(`/api/mypage/history?${params.toString()}`, {
					cache: "no-store",
				});

				if (!res.ok) return;

				const data = (await res.json()) as PostHistoryResponse;
				setPosts(data.posts);
				setTotal(data.total);
				setTotalPages(data.totalPages);
				setCurrentPage(data.page);
			} catch {
				// 書き込み履歴取得失敗はサイレントに処理する
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	// 初期表示: page=1、検索条件なしで取得する
	useEffect(() => {
		void fetchHistory(1, { keyword: "", startDate: "", endDate: "" });
	}, [fetchHistory]);

	// ---------------------------------------------------------------------------
	// イベントハンドラ
	// ---------------------------------------------------------------------------

	/**
	 * 検索フォームのサブミット処理。
	 * 入力された検索条件を適用し、page=1 から再取得する。
	 *
	 * See: features/mypage.feature @キーワードで書き込み履歴を検索する
	 * See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
	 * See: features/mypage.feature @キーワードと日付範囲を組み合わせて検索する
	 */
	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		// 検索条件を適用してpage=1で再取得
		setAppliedSearch({ ...searchInput });
		void fetchHistory(1, searchInput);
	};

	/**
	 * 検索条件をリセットし、全件表示に戻す。
	 *
	 * See: tmp/workers/bdd-architect_TASK-237/design.md §6.5 検索フォームUI
	 */
	const handleClearSearch = () => {
		const cleared: SearchParams = { keyword: "", startDate: "", endDate: "" };
		setSearchInput(cleared);
		setAppliedSearch(cleared);
		void fetchHistory(1, cleared);
	};

	/**
	 * 指定ページに遷移する。現在の検索条件を維持する。
	 *
	 * See: features/mypage.feature @2ページ目を表示すると51件目以降が表示される
	 * See: tmp/workers/bdd-architect_TASK-237/design.md §6.3 状態遷移
	 */
	const handlePageChange = (page: number) => {
		void fetchHistory(page, appliedSearch);
	};

	// ---------------------------------------------------------------------------
	// 算出値
	// ---------------------------------------------------------------------------

	/** 検索条件が適用されているかどうか */
	const isSearchActive =
		appliedSearch.keyword !== "" ||
		appliedSearch.startDate !== "" ||
		appliedSearch.endDate !== "";

	// ---------------------------------------------------------------------------
	// レンダリング
	// ---------------------------------------------------------------------------

	return (
		<section
			id="post-history"
			className="bg-white border border-gray-300 rounded p-4 space-y-3"
		>
			<h2 className="text-base font-bold text-gray-700">書き込み履歴</h2>

			{/* =============================
          検索フォーム
          See: features/mypage.feature @キーワードで書き込み履歴を検索する
          See: features/mypage.feature @日付範囲で書き込み履歴を絞り込む
          See: tmp/workers/bdd-architect_TASK-237/design.md §6.5 検索フォームUI
          ============================= */}
			<form
				id="history-search-form"
				onSubmit={handleSearch}
				className="space-y-2"
			>
				{/* キーワード入力
            See: tmp/workers/bdd-architect_TASK-237/design.md §6.5 > history-keyword-input */}
				<input
					id="history-keyword-input"
					type="text"
					value={searchInput.keyword}
					onChange={(e) =>
						setSearchInput((prev) => ({ ...prev, keyword: e.target.value }))
					}
					placeholder="本文を検索（キーワード）"
					maxLength={200}
					className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
				/>

				{/* 日付範囲
            See: tmp/workers/bdd-architect_TASK-237/design.md §6.5 > history-start-date / history-end-date */}
				<div className="flex items-center gap-2 flex-wrap">
					<input
						id="history-start-date"
						type="date"
						value={searchInput.startDate}
						onChange={(e) =>
							setSearchInput((prev) => ({
								...prev,
								startDate: e.target.value,
							}))
						}
						className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
					/>
					<span className="text-gray-500 text-sm">〜</span>
					<input
						id="history-end-date"
						type="date"
						value={searchInput.endDate}
						onChange={(e) =>
							setSearchInput((prev) => ({ ...prev, endDate: e.target.value }))
						}
						className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
					/>
				</div>

				{/* 検索・クリアボタン */}
				<div className="flex gap-2">
					{/* history-search-btn
              See: tmp/workers/bdd-architect_TASK-237/design.md §6.5 > history-search-btn */}
					<button
						id="history-search-btn"
						type="submit"
						className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
					>
						検索
					</button>
					{/* クリアボタン: 検索条件が適用中のときのみ表示 */}
					{isSearchActive && (
						<button
							id="history-clear-btn"
							type="button"
							onClick={handleClearSearch}
							className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
						>
							クリア
						</button>
					)}
				</div>
			</form>

			{/* =============================
          書き込み一覧 / メッセージ
          See: features/mypage.feature @自分の書き込み履歴を確認できる
          ============================= */}
			{isLoading ? (
				<p className="text-gray-400 text-sm">読み込み中...</p>
			) : posts.length === 0 ? (
				isSearchActive ? (
					/* 検索条件あり + 0件
              See: features/mypage.feature @検索結果が0件の場合はメッセージが表示される
              See: tmp/workers/bdd-architect_TASK-237/design.md §6.6 検索結果メッセージ */
					<p id="no-search-results-message" className="text-gray-500 text-sm">
						該当する書き込みはありません
					</p>
				) : (
					/* 検索条件なし + 0件（まだ書き込みなし）
              See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される */
					<p id="no-posts-message" className="text-gray-500 text-sm">
						まだ書き込みがありません
					</p>
				)
			) : (
				<>
					{/* 件数表示 */}
					<p className="text-xs text-gray-400">全 {total} 件</p>

					{/* 書き込み一覧
              See: features/mypage.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる */}
					<ul id="post-history-list" className="space-y-2">
						{posts.map((post) => (
							<li
								key={post.id}
								className="border-b border-gray-100 pb-2 last:border-b-0"
							>
								{/* スレッドタイトル（スレッドへのリンク）
                    See: features/mypage.feature @各書き込みのスレッド名、本文、書き込み日時が含まれる
                    See: tmp/workers/bdd-architect_TASK-237/design.md §6.4 > history-thread-title */}
								<div className="text-xs text-gray-500 mb-0.5">
									<a
										href={`/threads/${post.threadId}`}
										className="font-medium text-blue-600 hover:underline"
									>
										{post.threadTitle}
									</a>
									<span className="ml-2">{formatDateTime(post.createdAt)}</span>
								</div>
								<p className="text-sm text-gray-800 line-clamp-2">
									{post.body}
								</p>
							</li>
						))}
					</ul>
				</>
			)}

			{/* =============================
          ページネーションコントロール
          totalPages <= 1 の場合は非表示
          See: features/mypage.feature @書き込み履歴が50件以下の場合は全件表示される（ページネーション非表示）
          See: features/mypage.feature @書き込み履歴が50件を超える場合はページネーションで表示される
          See: tmp/workers/bdd-architect_TASK-237/design.md §6.4 ページネーションUI
          ============================= */}
			{totalPages > 1 && (
				<nav
					id="history-pagination"
					aria-label="書き込み履歴のページネーション"
					className="flex items-center gap-1 flex-wrap pt-1"
				>
					{/* 前へボタン: 1ページ目では非活性 */}
					<button
						id="history-page-prev"
						type="button"
						onClick={() => handlePageChange(currentPage - 1)}
						disabled={currentPage <= 1}
						className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						前へ
					</button>

					{/* ページ番号ボタン
              See: tmp/workers/bdd-architect_TASK-237/design.md §6.4 > history-page-{n} */}
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
						<button
							key={page}
							id={`history-page-${page}`}
							type="button"
							onClick={() => handlePageChange(page)}
							disabled={page === currentPage}
							aria-current={page === currentPage ? "page" : undefined}
							className={
								page === currentPage
									? "px-3 py-1 text-sm border border-blue-500 rounded bg-blue-600 text-white font-bold cursor-default"
									: "px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
							}
						>
							{page}
						</button>
					))}

					{/* 次へボタン: 最終ページでは非活性 */}
					<button
						id="history-page-next"
						type="button"
						onClick={() => handlePageChange(currentPage + 1)}
						disabled={currentPage >= totalPages}
						className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						次へ
					</button>

					{/* ページ情報テキスト
              See: tmp/workers/bdd-architect_TASK-237/design.md §6.4 > history-page-info */}
					<span id="history-page-info" className="text-xs text-gray-500 ml-1">
						全{totalPages}ページ
					</span>
				</nav>
			)}
		</section>
	);
}
