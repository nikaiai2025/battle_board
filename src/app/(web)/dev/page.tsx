/**
 * 開発連絡板ページ — /dev/（Server Component, SSR）
 *
 * 本番の PostService / ThreadCreateForm / ThreadList / AuthService 等には一切依存しない。
 * DevPostService を通じて dev_posts テーブルのみを操作する。
 *
 * UI はCGI掲示板風のレトロデザイン。
 *   - ベージュ背景 (#efefef)、テーブルレイアウト、システムフォント
 *   - Tailwind 不使用。<style> 直書き + インラインスタイル
 *   - Client Component ゼロ。JavaScript 不要
 *   - 投稿フォームは HTML <form method="POST"> → /api/dev/posts → 302 リダイレクト
 *
 * See: features/dev_board.feature
 * See: docs/architecture/architecture.md §13 TDR-014
 */

import type { DevPost } from "@/lib/services/dev-post-service";
import { getPosts } from "@/lib/services/dev-post-service";

// リクエストごとにSSRを実行し、Vercelのページキャッシュを無効化する。
// See: docs/architecture/architecture.md §13 TDR-006
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * Date を「YYYY/MM/DD HH:MM」形式の文字列に変換する。
 */
function formatDate(date: Date): string {
	const y = date.getFullYear();
	const mo = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const mi = String(date.getMinutes()).padStart(2, "0");
	return `${y}/${mo}/${d} ${h}:${mi}`;
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * 開発連絡板ページ（Server Component）
 *
 * See: features/dev_board.feature @認証なしで書き込みができる
 * See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
 */
export default async function DevBoardPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	// 投稿一覧を取得（新しい順）
	let posts: DevPost[] = [];
	try {
		posts = await getPosts();
	} catch {
		// DB エラー時は空一覧で表示する（開発連絡板は常に利用可能であることが重要）
	}

	// バリデーションエラーメッセージの取得
	const { error: errorMessage } = await searchParams;

	return (
		<>
			{/* =====================================================
			    CGI掲示板風インラインスタイル定義
			    Tailwind 不使用。<style> 直書き。
			    See: features/dev_board.feature
			    ===================================================== */}
			<style>{`
				body { background: #efefef; }
				.dev-wrap {
					font-family: "MS UI Gothic", "Osaka", sans-serif;
					font-size: 13px;
					color: #000;
					max-width: 780px;
					margin: 10px auto;
					padding: 0 8px;
				}
				.dev-title {
					font-size: 18px;
					font-weight: bold;
					border-bottom: 2px solid #000080;
					padding-bottom: 4px;
					margin-bottom: 8px;
					color: #000080;
				}
				.dev-form-table {
					border-collapse: collapse;
					margin-bottom: 12px;
					width: 100%;
				}
				.dev-form-table th {
					background: #c0c0c0;
					border: 1px solid #808080;
					padding: 3px 6px;
					text-align: right;
					width: 80px;
					font-weight: normal;
				}
				.dev-form-table td {
					background: #ffffff;
					border: 1px solid #808080;
					padding: 3px 6px;
				}
				.dev-form-table input[type="text"] {
					width: 280px;
					font-size: 13px;
				}
				.dev-form-table textarea {
					width: 100%;
					height: 80px;
					font-size: 13px;
				}
				.dev-submit {
					background: #d4d0c8;
					border: 2px outset #fff;
					padding: 2px 16px;
					font-size: 13px;
					cursor: pointer;
				}
				.dev-error {
					color: #cc0000;
					background: #ffe0e0;
					border: 1px solid #cc0000;
					padding: 4px 8px;
					margin-bottom: 8px;
				}
				.dev-post-table {
					border-collapse: collapse;
					width: 100%;
					margin-bottom: 4px;
				}
				.dev-post-header {
					background: #e8e0d0;
					border: 1px solid #a08060;
					padding: 2px 6px;
					font-size: 12px;
				}
				.dev-post-num {
					color: #008000;
					font-weight: bold;
					margin-right: 6px;
				}
				.dev-post-name {
					font-weight: bold;
					color: #000080;
					margin-right: 6px;
				}
				.dev-post-date {
					color: #606060;
				}
				.dev-post-body {
					padding: 4px 10px 8px 20px;
					border-left: 1px solid #a08060;
					border-right: 1px solid #a08060;
					border-bottom: 1px solid #a08060;
					background: #ffffff;
					white-space: pre-wrap;
					word-break: break-all;
				}
				.dev-footer {
					color: #808080;
					font-size: 11px;
					text-align: center;
					margin-top: 16px;
					border-top: 1px solid #808080;
					padding-top: 4px;
				}
			`}</style>

			<div className="dev-wrap">
				{/* ページタイトル */}
				<div className="dev-title">開発連絡板</div>

				{/* =====================================================
				    投稿フォーム
				    HTML <form method="POST"> → /api/dev/posts → 302 リダイレクト
				    JavaScript 不要。Client Component ゼロ。
				    See: features/dev_board.feature @認証なしで書き込みができる
				    ===================================================== */}
				<form method="POST" action="/api/dev/posts">
					{/* バリデーションエラー表示 */}
					{errorMessage && (
						<div className="dev-error" id="error-message">
							エラー: {errorMessage}
						</div>
					)}

					<table className="dev-form-table">
						<tbody>
							<tr>
								<th>名前</th>
								<td>
									{/* name-input: 名前フィールド（任意。空の場合は「名無しさん」） */}
									<input
										type="text"
										name="name"
										id="name-input"
										placeholder="名無しさん"
										maxLength={50}
									/>
								</td>
							</tr>
							<tr>
								<th>本文</th>
								<td>
									{/* body-input: 本文フィールド（必須） */}
									<textarea name="body" id="body-input" required />
								</td>
							</tr>
							<tr>
								<th></th>
								<td>
									<button
										type="submit"
										className="dev-submit"
										id="submit-button"
									>
										書き込む
									</button>
								</td>
							</tr>
						</tbody>
					</table>
				</form>

				<hr />

				{/* =====================================================
				    投稿一覧（新しい順）
				    通番・名前・投稿日時を表示する
				    See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
				    ===================================================== */}
				{posts.length === 0 ? (
					<p style={{ color: "#808080" }}>まだ書き込みがありません。</p>
				) : (
					posts.map((post, index) => (
						<div
							key={post.id}
							id={`post-${post.id}`}
							style={{ marginBottom: "8px" }}
						>
							{/* 投稿ヘッダ: 通番・名前・投稿日時 */}
							<div className="dev-post-header">
								{/* post-number: 通番（1始まり、新しい順） */}
								<span className="dev-post-num" data-testid="post-number">
									{index + 1}
								</span>
								{/* post-name: 投稿者名 */}
								<span className="dev-post-name" data-testid="post-name">
									{post.name}
								</span>
								{/* post-date: 投稿日時 */}
								<span className="dev-post-date" data-testid="post-date">
									{formatDate(post.createdAt)}
								</span>
							</div>
							{/* 投稿本文 */}
							<div className="dev-post-body" data-testid="post-body">
								{post.body}
							</div>
						</div>
					))
				)}

				{/* フッター */}
				<div className="dev-footer">
					開発連絡板 — BattleBoard 開発チーム専用
				</div>
			</div>
		</>
	);
}
