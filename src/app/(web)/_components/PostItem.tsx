"use client";

/**
 * PostItem — 1レスの表示コンポーネント（Client Component）
 *
 * - レス番号、表示名、日次ID、書き込み日時、本文を表示
 * - 削除済みレスは「このレスは削除されました」と表示
 * - 本文内の >>N 形式のアンカーをページ内リンクに変換
 * - inlineSystemInfo が存在する場合、本文の下に区切り線付きでシステム情報を表示
 * - dangerouslySetInnerHTML 禁止（白スペース表示は white-space: pre-wrap で対応）
 * - 日時フォーマット: YYYY/MM/DD(ddd) HH:mm:ss
 * - レス番号はクリック可能なボタン（>>なし、数字のみ）。クリックでフォームに >>N を挿入
 *
 * See: features/thread.feature @スレッドのレスが書き込み順に表示される
 * See: features/thread.feature @レス内のアンカーで他のレスを参照できる
 * See: features/thread.feature @post_number_display
 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
 * See: docs/specs/screens/thread-view.yaml > elements > post-list > itemTemplate
 * See: docs/specs/screens/thread-view.yaml > post-inline-system-info
 * See: docs/architecture/components/web-ui.md §6 > dangerouslySetInnerHTML使用禁止
 */

import Link from "next/link";
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

// ---------------------------------------------------------------------------
// ユーティリティ関数
// ---------------------------------------------------------------------------

/** 曜日の表示名（日本語） */
const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 日時を YYYY/MM/DD(ddd) HH:mm:ss 形式にフォーマットする。
 *
 * See: docs/specs/screens/thread-view.yaml > post-datetime > format
 *
 * @param dateStr - ISO8601形式の日時文字列
 * @returns フォーマット済み日時文字列
 */
export function formatDateTime(dateStr: string): string {
	const date = new Date(dateStr);

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const dayName = DAY_NAMES[date.getDay()];
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}/${month}/${day}(${dayName}) ${hours}:${minutes}:${seconds}`;
}

/**
 * 本文内の >>N 形式アンカーを解析してReact要素配列に変換する。
 *
 * dangerouslySetInnerHTML を使わずに Reactの標準エスケープを利用する。
 * >> の後に続く数字列をページ内リンク（#post-N）に変換する。
 *
 * See: features/thread.feature @レス内のアンカーで他のレスを参照できる
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
		// アンカーリンクをReact要素として追加
		const postNumber = match[2];
		parts.push(
			<Link
				key={`anchor-${match.index}`}
				href={`#post-${postNumber}`}
				className="text-blue-600 hover:underline"
			>
				{match[1]}
			</Link>,
		);
		lastIndex = match.index + match[0].length;
	}

	// 末尾の残りテキストを追加
	if (lastIndex < body.length) {
		parts.push(body.slice(lastIndex));
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
			className={`py-2 border-b border-gray-200 text-sm ${
				isSystemMessage ? "bg-yellow-50" : ""
			}`}
		>
			{/* レスヘッダー行: レス番号・表示名・日次ID・日時
          See: docs/specs/screens/thread-view.yaml > post-header */}
			<div className="flex flex-wrap items-center gap-2 mb-1">
				{/* post-number: レス番号（数字のみ、クリックでフォームに >>N を挿入）
            See: docs/specs/screens/thread-view.yaml > post-number
            See: features/thread.feature @post_number_display */}
				<button
					type="button"
					className="font-bold text-gray-700 hover:text-blue-600 cursor-pointer"
					onClick={handlePostNumberClick}
					data-testid={`post-number-btn-${post.postNumber}`}
				>
					{post.postNumber}
				</button>

				{/* post-display-name: 表示名
            See: docs/specs/screens/thread-view.yaml > post-display-name */}
				<span
					className={`font-semibold ${
						isSystemMessage ? "text-red-700" : "text-green-700"
					}`}
				>
					{isSystemMessage
						? `[システム] ${post.displayName}`
						: post.displayName}
				</span>

				{/* post-daily-id: 日次リセットID
            See: docs/specs/screens/thread-view.yaml > post-daily-id */}
				<span className="text-gray-500 text-xs">ID:{post.dailyId}</span>

				{/* post-datetime: 書き込み日時（YYYY/MM/DD(ddd) HH:mm:ss）
            See: docs/specs/screens/thread-view.yaml > post-datetime */}
				<time className="text-gray-500 text-xs" dateTime={post.createdAt}>
					{formatDateTime(post.createdAt)}
				</time>
			</div>

			{/* post-body: 本文
          削除済みの場合は削除メッセージを表示。
          通常は white-space: pre-wrap で改行を表現（dangerouslySetInnerHTML 禁止）。
          >>N 形式のアンカーはクリック可能なリンクに変換。
          See: docs/specs/screens/thread-view.yaml > post-body */}
			<div
				className={`pl-6 whitespace-pre-wrap break-words ${
					isDeleted ? "text-gray-400 line-through" : "text-gray-800"
				}`}
			>
				{isDeleted ? (
					<span className="text-gray-400 not-italic">
						このレスは削除されました
					</span>
				) : (
					parseAnchorLinks(post.body)
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
					<hr className="border-gray-300 mb-1" />
					{/* inline-system-content: システム情報テキスト（控えめなフォント）
						See: docs/specs/screens/thread-view.yaml > inline-system-content */}
					<p className="text-gray-500 text-xs whitespace-pre-wrap">
						{post.inlineSystemInfo}
					</p>
				</div>
			)}
		</article>
	);
}
