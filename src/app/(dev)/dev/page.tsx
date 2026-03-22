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
 *   - 左ナビ＋右メインのフレーム風レイアウト（tableで再現）
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
				body {
					background: #efefef;
					margin: 0;
					padding: 0;
					font-family: "MS Pゴシック", "MS PGothic", "Osaka", sans-serif;
					font-size: 12px;
					color: #000;
					-webkit-font-smoothing: none;
					-moz-osx-font-smoothing: unset;
				}
				a { color: #0000EE; }
				a:visited { color: #551A8B; }

				/* ============================================
				   フレーム風 外枠テーブル
				   ============================================ */
				.dev-frame {
					width: 100%;
					height: 100vh;
					border-collapse: collapse;
				}
				.dev-frame td {
					vertical-align: top;
				}

				/* ---- 左ナビ（フレーム風） ---- */
				.dev-nav {
					width: 160px;
					background: #c0c8d8;
					border-right: 2px solid #808080;
					padding: 8px;
					font-size: 12px;
				}
				.dev-nav-title {
					font-size: 11px;
					font-weight: bold;
					color: #000080;
					text-align: center;
					margin-bottom: 10px;
					padding-bottom: 6px;
					border-bottom: 1px solid #808080;
				}
				.dev-nav-section {
					font-size: 10px;
					font-weight: bold;
					color: #404040;
					margin-top: 10px;
					margin-bottom: 3px;
				}
				.dev-nav ul {
					list-style: none;
					margin: 0;
					padding: 0;
				}
				.dev-nav li {
					margin-bottom: 3px;
				}
				.dev-nav li a {
					font-size: 12px;
					text-decoration: none;
				}
				.dev-nav li a:hover {
					text-decoration: underline;
				}
				.dev-nav-sep {
					border: none;
					border-top: 1px solid #808080;
					border-bottom: 1px solid #ffffff;
					margin: 8px 0;
				}
				/* ---- カウンター ---- */
				.dev-counter-box {
					text-align: center;
					margin-top: 12px;
				}
				.dev-counter-label {
					font-size: 10px;
					color: #404040;
					margin-bottom: 2px;
				}
				.dev-counter {
					display: inline-block;
					background: #000000;
					color: #00ff00;
					font-family: "Courier New", monospace;
					font-size: 14px;
					font-weight: bold;
					padding: 2px 8px;
					letter-spacing: 2px;
					border-top: 2px solid #404040;
					border-left: 2px solid #404040;
					border-right: 2px solid #ffffff;
					border-bottom: 2px solid #ffffff;
				}
				.dev-nav-copy {
					font-size: 9px;
					color: #606060;
					text-align: center;
					margin-top: 12px;
				}

				/* ============================================
				   右メイン（掲示板本体）
				   ============================================ */
				.dev-main {
					padding: 8px 12px;
				}
				/* ---- ページタイトル ---- */
				.dev-title {
					font-size: 20px;
					font-weight: bold;
					color: #800000;
					margin-bottom: 6px;
				}
				.dev-title-sub {
					font-size: 12px;
					font-weight: normal;
					color: #606060;
					margin-bottom: 8px;
				}
				/* ---- フォーム ---- */
				.dev-form-table {
					border-collapse: collapse;
					margin-bottom: 8px;
					width: 100%;
				}
				.dev-form-table td {
					padding: 1px 4px;
					vertical-align: top;
				}
				.dev-form-table td.dev-label {
					text-align: right;
					padding-right: 6px;
					white-space: nowrap;
					font-weight: normal;
					color: #000;
					width: 80px;
				}
				.dev-form-table input[type="text"],
				.dev-form-table textarea {
					border-top: 2px solid #808080;
					border-left: 2px solid #808080;
					border-right: 2px solid #ffffff;
					border-bottom: 2px solid #ffffff;
					background: #ffffff;
					font-size: 12px;
					font-family: inherit;
					padding: 1px 2px;
				}
				.dev-form-table input[type="text"] {
					width: 95%;
				}
				.dev-form-table textarea {
					width: 95%;
					height: 120px;
				}
				.dev-submit {
					background: #d4d0c8;
					border-top: 2px solid #ffffff;
					border-left: 2px solid #ffffff;
					border-right: 2px solid #404040;
					border-bottom: 2px solid #404040;
					padding: 2px 16px;
					font-size: 12px;
					font-family: inherit;
					cursor: pointer;
				}
				.dev-submit:active {
					border-top: 2px solid #404040;
					border-left: 2px solid #404040;
					border-right: 2px solid #ffffff;
					border-bottom: 2px solid #ffffff;
				}
				.dev-error {
					color: #cc0000;
					background: #ffe0e0;
					border: 1px solid #cc0000;
					padding: 4px 8px;
					margin-bottom: 8px;
					display: inline-block;
				}
				/* ---- 区切り線 ---- */
				hr.dev-hr {
					border: none;
					border-top: 1px solid #808080;
					border-bottom: 1px solid #ffffff;
					margin: 8px 0;
				}
				/* ---- 投稿 ---- */
				.dev-post {
					margin-bottom: 2px;
				}
				.dev-post-title-line {
					font-size: 12px;
					font-weight: bold;
					color: #800000;
					padding: 1px 0;
				}
				.dev-post-num {
					color: #800000;
					font-weight: bold;
				}
				.dev-post-body {
					padding: 4px 0 4px 20px;
					white-space: pre-wrap;
					word-break: break-all;
				}
				.dev-post-footer {
					text-align: right;
					font-size: 12px;
					color: #000;
					padding: 0 0 2px 0;
				}
				.dev-post-name {
					font-weight: bold;
					color: #008000;
				}
				.dev-post-date {
					color: #606060;
					margin-left: 6px;
				}
				.dev-post-hr {
					border: none;
					border-top: 1px solid #c0c0c0;
					margin: 4px 0;
				}
				/* ---- フッター ---- */
				.dev-footer {
					color: #808080;
					font-size: 10px;
					text-align: left;
					margin-top: 16px;
				}
			`}</style>

			{/* =====================================================
			    フレーム風テーブルレイアウト: 左ナビ | 右メイン
			    ===================================================== */}
			<table className="dev-frame">
				<tbody>
					<tr>
						{/* ===== 左ナビ ===== */}
						<td className="dev-nav">
							<div className="dev-nav-title">
								BattleBoard
								<br />
								Dev Menu
							</div>

							<div className="dev-nav-section">- Menu -</div>
							<ul>
								<li>
									<a href="/dev">開発連絡板</a>
								</li>
							</ul>

							<hr className="dev-nav-sep" />

							<div className="dev-nav-section">- Links -</div>
							<ul>
								<li>
									<a href="/">BattleBoard 本番</a>
								</li>
								<li>
									<a href="#">デプロイ状況</a>
								</li>
								<li>
									<a href="#">DB管理画面</a>
								</li>
								<li>
									<a href="#">GitHub</a>
								</li>
								<li>
									<a href="#">API仕様書</a>
								</li>
							</ul>

							<hr className="dev-nav-sep" />

							<div className="dev-nav-section">- Tools -</div>
							<ul>
								<li>
									<a href="#">ログビューア</a>
								</li>
								<li>
									<a href="#">テストデータ生成</a>
								</li>
							</ul>

							<hr className="dev-nav-sep" />

							{/* キリ番カウンター */}
							<div className="dev-counter-box">
								<div className="dev-counter-label">あなたは</div>
								<div className="dev-counter">
									{String(posts.length * 137 + 4649).padStart(6, "0")}
								</div>
								<div className="dev-counter-label">人目の訪問者です</div>
							</div>

							<div className="dev-nav-copy">since 2025</div>
						</td>

						{/* ===== 右メイン（掲示板本体） ===== */}
						<td className="dev-main">
							{/* ページタイトル */}
							<div className="dev-title">開発連絡板</div>
							<div className="dev-title-sub">
								BattleBoard 開発チーム専用の連絡掲示板です。
							</div>

							{/* =====================================================
							    投稿フォーム — ASKA BBS 風レイアウト
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
											<td className="dev-label">おなまえ</td>
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
											<td className="dev-label">タイトル</td>
											<td>
												{/* title-input: タイトルフィールド（任意。バックエンド未対応） */}
												<input type="text" id="title-input" placeholder="" />
											</td>
										</tr>
										<tr>
											<td className="dev-label">メッセージ</td>
											<td>
												{/* body-input: 本文フィールド（必須） */}
												<textarea name="body" id="body-input" />
											</td>
										</tr>
										<tr>
											<td className="dev-label">ホームページ</td>
											<td>
												{/* url-input: URLフィールド（任意。バックエンド未対応） */}
												<input
													type="text"
													id="url-input"
													placeholder="http://"
												/>
											</td>
										</tr>
										<tr>
											<td className="dev-label"></td>
											<td>
												<button
													type="submit"
													className="dev-submit"
													id="submit-button"
												>
													投稿する
												</button>
											</td>
										</tr>
									</tbody>
								</table>
							</form>

							<hr className="dev-hr" />

							{/* =====================================================
							    投稿一覧（新しい順）— ASKA BBS 風表示
							    タイトル行（左寄せ）＋本文＋名前・日時（右寄せ）
							    See: features/dev_board.feature @書き込みが新しい順に通番付きで表示される
							    ===================================================== */}
							{posts.length === 0 ? (
								<p style={{ color: "#808080" }}>まだ書き込みがありません。</p>
							) : (
								posts.map((post, index) => (
									<div
										key={post.id}
										id={`post-${post.id}`}
										className="dev-post"
									>
										{/* タイトル行: 通番＋タイトル（左寄せ） */}
										<div className="dev-post-title-line">
											<span className="dev-post-num" data-testid="post-number">
												[{index + 1}]
											</span>{" "}
											<span data-testid="post-title">（無題）</span>
										</div>
										{/* 投稿本文 */}
										<div className="dev-post-body" data-testid="post-body">
											{post.body}
										</div>
										{/* フッター行: 名前・日時・ホームページ（右寄せ） */}
										<div className="dev-post-footer">
											<span className="dev-post-name" data-testid="post-name">
												{post.name}
											</span>
											<span className="dev-post-date" data-testid="post-date">
												{formatDate(post.createdAt)}
											</span>
										</div>
										<hr className="dev-post-hr" />
									</div>
								))
							)}

							{/* フッター */}
							<div className="dev-footer">
								開発連絡板 — BattleBoard 開発チーム専用
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}
