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
					color: #000;
					-webkit-font-smoothing: none;
					-moz-osx-font-smoothing: unset;
				}
				a { color: #0000EE; }
				a:visited { color: #551A8B; }
				a:hover { text-decoration: none; }

				/* ---- marquee ---- */
				.dev-marquee {
					background: #000080;
					color: #ffff00;
					font-weight: bold;
					padding: 2px 0;
					margin-bottom: 6px;
					border-top: 2px solid #c0c0c0;
					border-left: 2px solid #c0c0c0;
					border-right: 2px solid #404040;
					border-bottom: 2px solid #404040;
				}

				/* ============================================
				   フレーム風 外枠テーブル
				   ============================================ */
				.dev-frame {
					width: 100%;
					height: 100vh;
					border-collapse: collapse;
					table-layout: fixed;
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
				.dev-counter-kiriban {
					font-size: 9px;
					color: #cc0000;
					font-weight: bold;
					margin-top: 2px;
				}
				.dev-nav-update {
					font-size: 10px;
					color: #000;
				}
				.dev-nav-update dt {
					font-weight: bold;
					color: #404040;
					margin-top: 3px;
				}
				.dev-nav-update dd {
					margin: 0 0 0 4px;
				}
				.dev-nav-env {
					font-size: 9px;
					color: #808080;
					text-align: center;
					margin-top: 8px;
				}
				.dev-nav-copy {
					font-size: 9px;
					color: #606060;
					text-align: center;
					margin-top: 4px;
				}
				.dev-construction {
					font-size: 10px;
					color: #cc0000;
				}
				/* ---- プロフィール ---- */
				.dev-profile {
					font-size: 10px;
					color: #000;
				}
				.dev-profile-name {
					font-size: 11px;
					font-weight: bold;
					color: #000080;
					text-align: center;
					margin-bottom: 4px;
				}
				.dev-profile dt {
					color: #606060;
				}
				.dev-profile dd {
					margin: 0 0 2px 6px;
				}
				.dev-profile-rule {
					font-size: 9px;
					color: #cc0000;
					margin-top: 4px;
				}

				/* ============================================
				   右メイン（掲示板本体）
				   ============================================ */
				.dev-main {
					width: 640px;
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

				/* ---- 右カラム（広告枠） ---- */
				.dev-aside {
					background: #d0d0d0;
					border-left: 2px solid #808080;
					padding: 8px;
					font-size: 10px;
					text-align: center;
				}
				.dev-ad-box {
					background: #ffffff;
					border-top: 2px solid #808080;
					border-left: 2px solid #808080;
					border-right: 2px solid #ffffff;
					border-bottom: 2px solid #ffffff;
					padding: 4px;
					margin-bottom: 8px;
				}
				.dev-ad-img {
					width: 144px;
					height: 144px;
					background: #c0c0c0;
					border: 1px solid #808080;
					display: table-cell;
					vertical-align: middle;
					text-align: center;
					color: #808080;
					font-size: 10px;
				}
				.dev-ad-label {
					font-size: 9px;
					color: #808080;
					margin-top: 2px;
				}
				.dev-ad-banner {
					width: 144px;
					height: 42px;
					background: #c0c0c0;
					border: 1px solid #808080;
					display: table-cell;
					vertical-align: middle;
					text-align: center;
					color: #808080;
					font-size: 9px;
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

							{/* 管理人プロフィール */}
							<div className="dev-nav-section">- Profile -</div>
							<div className="dev-profile">
								<div className="dev-profile-name">†Eternal_Coder†</div>
								<dl>
									<dt>性別</dt>
									<dd>秘密</dd>
									<dt>趣味</dt>
									<dd>プログラミング,深夜徘徊</dd>
									<dt>好きな言語</dt>
									<dd>TypeScript,Perl</dd>
									<dt>好きなOS</dt>
									<dd>Windows98SE</dd>
									<dt>好きな食べ物</dt>
									<dd>ペヤング</dd>
									<dt>座右の銘</dt>
									<dd>コードは書いた人の魂</dd>
								</dl>
								<div className="dev-profile-rule">
									*** このサイトについて ***
									<br />
									リンクフリーです。
									<br />
									報告は任意ですが頂ける
									<br />
									と管理人が喜びます(^_^)
									<br />
									画像の無断転載は禁止!!
								</div>
							</div>

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
									<a href="#">ログビューア</a>{" "}
									<span className="dev-construction">工事中</span>
								</li>
								<li>
									<a href="#">テストデータ生成</a>{" "}
									<span className="dev-construction">工事中</span>
								</li>
							</ul>

							<hr className="dev-nav-sep" />

							{/* 更新履歴 */}
							<div className="dev-nav-section">- 更新履歴 -</div>
							<dl className="dev-nav-update">
								<dt>2025/03/22</dt>
								<dd>掲示板UI刷新(^_^)</dd>
								<dt>2025/03/15</dt>
								<dd>開発連絡板を設置</dd>
								<dt>2025/03/01</dt>
								<dd>BattleBoard開発開始!</dd>
							</dl>

							<hr className="dev-nav-sep" />

							{/* キリ番カウンター */}
							<div className="dev-counter-box">
								<div className="dev-counter-label">あなたは</div>
								<div className="dev-counter">
									{String(posts.length * 137 + 4649).padStart(6, "0")}
								</div>
								<div className="dev-counter-label">人目の訪問者です</div>
								<div className="dev-counter-kiriban">キリ番踏み逃げ禁止!!</div>
							</div>

							<div className="dev-nav-env">
								推奨: IE5.0以上
								<br />
								800x600 / 文字サイズ中
							</div>
							<div className="dev-nav-copy">since 2025</div>
						</td>

						{/* ===== 右メイン（掲示板本体） ===== */}
						<td className="dev-main">
							{/* marquee お知らせテロップ */}
							<marquee className="dev-marquee" scrollamount="3">
								ようこそ開発連絡板へ!
								バグ報告・作業連絡・雑談などご自由にどうぞ。荒らしはやめてね(^_^;)
							</marquee>

							{/* ページタイトル */}
							<div className="dev-title">開発連絡板</div>
							<div className="dev-title-sub">
								BattleBoard 開発チーム専用の連絡掲示板です m(_ _)m
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

						{/* ===== 右カラム（広告枠） ===== */}
						<td className="dev-aside">
							<div className="dev-ad-box">
								<div className="dev-ad-img">
									AD
									<br />
									144x144
								</div>
								<div className="dev-ad-label">- 広告 -</div>
							</div>

							<div className="dev-ad-box">
								<div className="dev-ad-img">
									AD
									<br />
									144x144
								</div>
								<div className="dev-ad-label">- 広告 -</div>
							</div>

							<div className="dev-ad-box">
								<div className="dev-ad-banner">BANNER 144x42</div>
							</div>

							<div className="dev-ad-box">
								<div className="dev-ad-banner">BANNER 144x42</div>
							</div>

							<div className="dev-ad-box">
								<div className="dev-ad-banner">BANNER 144x42</div>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}
