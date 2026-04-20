"use client";

/**
 * PostItem — 1レスの表示コンポーネント（Client Component）
 *
 * - レス番号、表示名、日次ID、書き込み日時、本文を表示
 * - 削除済みレスは「このレスは削除されました」と表示
 * - 本文内の >>N 形式のアンカーをクリックでポップアップ表示（AnchorLink 使用）
 * - 本文内の画像URLをサムネイル表示（ImageThumbnail 使用）
 * - 本文内の非画像URLをリンク化
 * - inlineSystemInfo が存在する場合、本文の下に区切り線付きでシステム情報を表示
 * - dangerouslySetInnerHTML 禁止（白スペース表示は white-space: pre-wrap で対応）
 * - 日時フォーマット: YYYY/MM/DD(ddd) HH:mm:ss
 * - レス番号はクリック可能なボタン（>>なし、数字のみ）。クリックでフォームに >>N を挿入
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/thread.feature @anchor_popup
 * See: features/thread.feature @post_number_display
 * See: features/thread.feature @image_preview
 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
 * See: docs/specs/screens/thread-view.yaml > elements > post-list > itemTemplate
 * See: docs/specs/screens/thread-view.yaml > post-inline-system-info
 * See: docs/architecture/components/web-ui.md §6 > dangerouslySetInnerHTML使用禁止
 */

import { detectUrls } from "../../../lib/domain/rules/url-detector";
import { formatDateTime } from "../../../lib/utils/date";
import AnchorLink from "./AnchorLink";
import { useEliminatedBotToggle } from "./EliminatedBotToggleContext";
import ImageThumbnail from "./ImageThumbnail";
import { usePostFormContext } from "./PostFormContext";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** APIから返されるPostデータの型 */
export interface Post {
	id: string;
	threadId: string;
	postNumber: number;
	displayName: string;
	dailyId: string;
	body: string;
	/** レス内マージ型システム情報（コマンド結果・書き込み報酬等）。null なら表示なし */
	inlineSystemInfo: string | null;
	isSystemMessage: boolean;
	isDeleted: boolean;
	botMark?: { hp: number; maxHp: number } | null;
	createdAt: string;
}

/**
 * 本文内の >>N 形式アンカーを解析してReact要素配列に変換する。
 *
 * dangerouslySetInnerHTML を使わずに Reactの標準エスケープを利用する。
 * >> の後に続く数字列を AnchorLink コンポーネントに変換する。
 * クリックでポップアップ表示（ページ内スクロールからポップアップへ変更）。
 *
 * See: features/thread.feature @anchor_popup
 * See: docs/architecture/components/web-ui.md §6 > dangerouslySetInnerHTML使用禁止
 *
 * @param body - 本文テキスト
 * @returns アンカーリンク変換済みのReact要素配列
 */
export function parseAnchorLinks(
	body: string,
): (string | React.ReactElement)[] {
	// >>N 形式を分割するための正規表現
	const anchorPattern = /(>>(\d+))/g;
	const parts: (string | React.ReactElement)[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = anchorPattern.exec(body)) !== null) {
		// アンカーより前のテキスト部分を追加
		if (match.index > lastIndex) {
			parts.push(body.slice(lastIndex, match.index));
		}
		// AnchorLink コンポーネントとして追加（クリックでポップアップ表示）
		// See: features/thread.feature @anchor_popup
		const postNumber = parseInt(match[2], 10);
		parts.push(
			<AnchorLink key={`anchor-${match.index}`} postNumber={postNumber} />,
		);
		lastIndex = match.index + match[0].length;
	}

	// 末尾の残りテキストを追加
	if (lastIndex < body.length) {
		parts.push(body.slice(lastIndex));
	}

	return parts;
}

/**
 * 本文全体をパースして React 要素配列に変換する上位パーサー。
 *
 * parseAnchorLinks を変更せず、本文全体の URL 処理を統括する新関数。
 * 処理フロー:
 *   1. 全 URL を正規表現で検出（位置情報付き）
 *   2. 本文を「URL部分」と「テキスト部分」に分割
 *   3. テキスト部分 → parseAnchorLinks でアンカー変換
 *   4. 画像URL部分 → ImageThumbnail コンポーネント
 *   5. 音声URL部分 → <audio controls>
 *   6. その他URL部分 → <a> リンク
 *
 * See: features/thread.feature @image_preview
 * See: tmp/workers/bdd-architect_TASK-212/design.md §3.1 設計方針
 * See: tmp/workers/bdd-architect_TASK-212/design.md §6 parsePostBody の設計
 *
 * @param body - レス本文テキスト
 * @returns パース済みの React 要素配列
 */
export function parsePostBody(body: string): (string | React.ReactElement)[] {
	const urlMatches = detectUrls(body);

	// URL が含まれない場合は既存の parseAnchorLinks に委譲
	if (urlMatches.length === 0) {
		return parseAnchorLinks(body);
	}

	const parts: (string | React.ReactElement)[] = [];
	let lastIndex = 0;

	for (const match of urlMatches) {
		// URL より前のテキスト部分を parseAnchorLinks でアンカー変換して追加
		if (match.startIndex > lastIndex) {
			const textBefore = body.slice(lastIndex, match.startIndex);
			parts.push(...parseAnchorLinks(textBefore));
		}

		if (match.isImage) {
			// 画像URL → ImageThumbnail コンポーネント
			// See: features/thread.feature @画像URLがサムネイルとして展開表示される
			parts.push(
				<ImageThumbnail key={`img-${match.startIndex}`} url={match.url} />,
			);
		} else if (match.isAudio) {
			parts.push(
				<audio
					key={`audio-${match.startIndex}`}
					controls
					preload="none"
					className="block my-2 max-w-full"
				>
					<source src={match.url} type="audio/mp4" />
					<a
						href={match.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 dark:text-blue-400 hover:underline break-all"
					>
						{match.url}
					</a>
				</audio>,
			);
		} else {
			// 非画像URL → <a> リンク
			// See: features/thread.feature @画像以外のURLはサムネイル展開されない
			parts.push(
				<a
					key={`link-${match.startIndex}`}
					href={match.url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-blue-600 dark:text-blue-400 hover:underline break-all"
				>
					{match.url}
				</a>,
			);
		}

		lastIndex = match.endIndex;
	}

	// 末尾の残りテキストを parseAnchorLinks でアンカー変換して追加
	if (lastIndex < body.length) {
		const textAfter = body.slice(lastIndex);
		parts.push(...parseAnchorLinks(textAfter));
	}

	return parts;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

interface PostItemProps {
	post: Post;
}

/**
 * 1レスの表示コンポーネント（PostList・PostListLiveWrapper の両方から使用）
 *
 * See: docs/specs/screens/thread-view.yaml > elements > post-list > itemTemplate
 * See: features/thread.feature @post_number_display
 */
export default function PostItem({ post }: PostItemProps) {
	// 削除済みレスの場合は代替テキストを表示
	// See: docs/specs/screens/thread-view.yaml > post-body > conditions > isDeleted
	const isDeleted = post.isDeleted;

	// システムメッセージの場合は背景色を変える
	// See: docs/specs/screens/thread-view.yaml > post-display-name > style > system_message
	const isSystemMessage = post.isSystemMessage;

	// PostFormContext からテキスト挿入コールバックを取得する
	// See: features/thread.feature @post_number_display
	const { insertText } = usePostFormContext();

	// 撃破済みBOTレス表示トグルの状態を取得する
	// See: features/bot_system.feature @撃破済みボットのレス表示をトグルで切り替えられる
	// See: tmp/workers/bdd-architect_TASK-219/design.md §3.4 トグルOFF時の挙動
	const { showEliminatedBotPosts } = useEliminatedBotToggle();

	// 撃破済みBOTのレスかつトグルOFFの場合は非表示（DOMから除去）
	// E2Eテスト: await expect(botPost).not.toBeVisible() が display:none で PASS する
	if (post.botMark && !showEliminatedBotPosts) {
		return null;
	}

	/**
	 * レス番号クリック時のハンドラ
	 * フォームに ">>N" 形式のアンカーテキストを挿入する
	 *
	 * See: features/thread.feature @post_number_display
	 */
	const handlePostNumberClick = () => {
		insertText(`>>${post.postNumber}`);
	};

	return (
		<article
			id={`post-${post.postNumber}`}
			className={`py-2 border-b border-border text-sm ${
				isSystemMessage ? "bg-yellow-50 dark:bg-yellow-950" : ""
			}`}
			style={post.botMark ? { opacity: 0.5 } : undefined}
		>
			{/* レスヘッダー行: レス番号・表示名・日次ID・日時
          See: docs/specs/screens/thread-view.yaml > post-header */}
			<div className="mb-1 flex flex-wrap items-center gap-2 text-[10px]">
				{/* post-number: レス番号（数字のみ、クリックでフォームに >>N を挿入）
            See: docs/specs/screens/thread-view.yaml > post-number
            See: features/thread.feature @post_number_display */}
				<button
					type="button"
					className="inline-flex items-center rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-700 shadow-[1px_1px_0_rgba(15,23,42,0.12)] transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
					onClick={handlePostNumberClick}
					data-testid={`post-number-btn-${post.postNumber}`}
				>
					{post.postNumber}
				</button>

				{/* post-display-name: 表示名
            See: docs/specs/screens/thread-view.yaml > post-display-name */}
				<span
					className={`text-[10px] font-semibold ${
						isSystemMessage
							? "text-red-700 dark:text-red-400"
							: "text-green-700 dark:text-green-400"
					}`}
				>
					{post.displayName}
				</span>

				{/* post-daily-id: 日次リセットID
            See: docs/specs/screens/thread-view.yaml > post-daily-id */}
				<span className="text-muted-foreground text-[10px]">
					ID:{post.dailyId}
				</span>

				{/* post-datetime: 書き込み日時（YYYY/MM/DD(ddd) HH:mm:ss）
            See: docs/specs/screens/thread-view.yaml > post-datetime */}
				<time
					className="text-muted-foreground text-[10px]"
					dateTime={post.createdAt}
				>
					{formatDateTime(post.createdAt)}
				</time>
			</div>

			{/* post-body: 本文
          削除済みの場合は削除メッセージを表示。
          通常は white-space: pre-wrap で改行を表現（dangerouslySetInnerHTML 禁止）。
          >>N 形式のアンカーはクリック可能なリンクに変換（parseAnchorLinks）。
          画像URLはサムネイル表示、非画像URLはリンク化（parsePostBody）。
          See: docs/specs/screens/thread-view.yaml > post-body
          See: features/thread.feature @image_preview */}
			<div
				className={`pl-6 whitespace-pre-wrap break-words text-base ${
					isDeleted ? "text-muted-foreground line-through" : "text-foreground"
				}`}
			>
				{isDeleted ? (
					<span className="text-muted-foreground not-italic">
						このレスは削除されました
					</span>
				) : (
					parsePostBody(post.body)
				)}
			</div>

			{/* post-inline-system-info: レス内マージ型システム情報（方式A）
				コマンド実行結果・書き込み報酬など即時確定情報を本文の下に区切り線付きで表示。
				See: docs/specs/screens/thread-view.yaml > post-inline-system-info
				See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される */}
			{post.inlineSystemInfo && (
				<div data-testid="post-inline-system-info" className="pl-6 mt-1">
					{/* inline-separator: 本文とシステム情報を視覚的に分離する区切り線
						See: docs/specs/screens/thread-view.yaml > inline-separator */}
					<hr className="border-border mb-1" />
					{/* inline-system-content: システム情報テキスト
						AA（!copipe結果）を含む場合はMS Pゴシック互換フォント+16pxで描画する。
						copipe結果は「【name】\n（AA本文）」形式のため、「【】+改行」でAA判定する。
						おみくじは「…【大吉】テキスト」形式（改行なし）なので誤判定しない。
						それ以外のシステム情報（書き込み報酬等）は通常フォント。
						AA時は折り返し禁止（whitespace-pre）＋横スクロール（overflow-x-auto）でスマホ表示崩れを防ぐ。
						See: docs/specs/screens/thread-view.yaml > inline-system-content
						See: config/copipe-seed.txt ヘッダー「AA表示の前提フォントとスペース方針」 */}
					{/* See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される */}
					{(() => {
						const isAA = /【.+】\n/.test(post.inlineSystemInfo);
						return isAA ? (
							// AA: 横スクロール有効（折り返し禁止）
							<div className="overflow-x-auto">
								<p
									className="text-muted-foreground whitespace-pre"
									style={{ fontFamily: "var(--font-aa)", fontSize: "16px", lineHeight: "18px" }}
								>
									{post.inlineSystemInfo}
								</p>
							</div>
						) : (
							// 非AA: 従来通り（折り返しあり）
							<p className="text-muted-foreground text-xs whitespace-pre-wrap">
								{post.inlineSystemInfo}
							</p>
						);
					})()}
				</div>
			)}
		</article>
	);
}
