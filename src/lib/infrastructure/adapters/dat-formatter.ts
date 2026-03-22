/**
 * DatFormatter — DAT形式テキストの構築
 *
 * 5ch専用ブラウザが要求するDAT形式（1レス=1行、<br>区切り）のテキストを生成する。
 * UTF-8文字列を返す。Shift_JISへの変換は呼び出し元（Route Handler）が担う。
 *
 * See: features/specialist_browser_compat.feature
 *   @scenario DATファイルが所定のフォーマットで返される
 *   @scenario DATファイルの1行目のみスレッドタイトルを含む
 *   @scenario レス内の改行がHTMLのbrタグに変換される
 *   @scenario レス内のHTML特殊文字がエスケープされる
 *   @scenario 日次リセットIDがDATの日付フィールドに正しく含まれる
 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
 * See: docs/architecture/components/senbra-adapter.md §2 DatFormatter, §3 公開インターフェース
 * See: docs/architecture/components/posting.md §5 方式A: レス内マージ
 */

import type { Post } from "../../domain/models/post";
import { toJSTDate } from "../../utils/date";
import { ShiftJisEncoder } from "../encoding/shift-jis";

/** 曜日ラベル（日本語） */
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * Shift_JISで表現できない絵文字等をテキストに置換するマッピング。
 * 新しいBOT絵文字が追加された場合はここに追記する。
 */
/**
 * inlineSystemInfo の区切り線（全角ダッシュ10個）。
 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
 * See: docs/architecture/components/posting.md §5 方式A
 */
const INLINE_SYSTEM_INFO_SEPARATOR = "──────────";

const BOT_EMOJI_REPLACEMENTS: [RegExp, string][] = [
	[/🤖/g, "[BOT]"],
	[/🦾/g, "[BOT]"],
	[/🦿/g, "[BOT]"],
	[/🧠/g, "[BOT]"],
];

/**
 * DAT形式テキストの構築クラス。
 *
 * 責務: Post[] → DAT文字列変換（UTF-8）
 */
export class DatFormatter {
	private readonly encoder = new ShiftJisEncoder();

	/**
	 * Post配列とスレッドタイトルからDAT形式テキストを構築する。
	 *
	 * DATフォーマット（1レス1行）:
	 *   名前<>メール<>YYYY/MM/DD(曜) HH:mm:ss.SS ID:dailyId<>本文(<br>区切り)<>スレッドタイトル(1行目のみ)\n
	 *
	 * @param posts - レスのリスト（UTF-8）
	 * @param threadTitle - スレッドタイトル（1行目のみに付与）
	 * @returns DAT形式のUTF-8文字列
	 */
	buildDat(posts: Post[], threadTitle: string): string {
		if (posts.length === 0) return "";

		return (
			posts
				.map((post, index) => {
					const name = this.replaceBotEmoji(post.displayName);
					const mail = ""; // メールフィールド（現仕様では空）
					const dateId = this.formatDateId(post.createdAt, post.dailyId);
					const body = this.formatBody(post);
					// スレッドタイトルは第1レス（index=0）のみに付与
					const title = index === 0 ? threadTitle : "";
					return `${name}<>${mail}<>${dateId}<>${body}<>${title}`;
				})
				.join("\n") + "\n"
		);
	}

	/**
	 * DAT1行のShift_JISバイト数を計算する。
	 *
	 * ThreadのdatByteSizeを更新する際（書き込み時）に使用する。
	 * 末尾の改行(\n)を含む文字列を渡すこと。
	 *
	 * @param line - DAT1行のUTF-8文字列（末尾\nを含む）
	 * @returns Shift_JISエンコード後のバイト数
	 */
	calcShiftJisLineBytes(line: string): number {
		if (line === "") return 0;
		return this.encoder.encode(line).length;
	}

	/**
	 * レス本文をDAT形式用にフォーマットする。
	 *
	 * - isDeleted=trueの場合は「このレスは削除されました」に置換
	 * - HTML特殊文字をエスケープ（XSS対策）
	 * - BOT絵文字を[BOT]に置換（Shift_JIS変換不可のため）
	 * - 改行(\n)を<br>に変換（DAT形式では1レス=1物理行）
	 * - inlineSystemInfoが存在する場合、区切り線付きで本文末尾に連結
	 *
	 * See: features/command_system.feature @コマンド実行結果がレス末尾に区切り線付きで表示される
	 * See: docs/architecture/components/posting.md §5 方式A: レス内マージ
	 *
	 * @param post - レスエンティティ
	 * @returns フォーマット済み本文文字列
	 */
	private formatBody(post: Post): string {
		// 削除済みレスはシステム情報も含めず固定メッセージに置換する
		if (post.isDeleted) {
			return "このレスは削除されました";
		}
		const escaped = this.escapeHtml(post.body);
		const botReplaced = this.replaceBotEmoji(escaped);
		// 改行を<br>に変換（1レス=1物理行にする）
		let body = botReplaced.replace(/\n/g, "<br>");

		// inlineSystemInfo が存在する場合、区切り線付きで末尾に連結する
		// See: features/command_system.feature @書き込み報酬がレス末尾に表示される
		if (post.inlineSystemInfo && post.inlineSystemInfo.length > 0) {
			const escapedInfo = this.escapeHtml(post.inlineSystemInfo);
			const botReplacedInfo = this.replaceBotEmoji(escapedInfo);
			const formattedInfo = botReplacedInfo.replace(/\n/g, "<br>");
			body += `<br>${INLINE_SYSTEM_INFO_SEPARATOR}<br>${formattedInfo}`;
		}

		return body;
	}

	/**
	 * HTML特殊文字をエスケープする。
	 * 順序が重要: & を最初に変換しないと二重エスケープが発生する。
	 *
	 * @param text - エスケープ対象の文字列
	 * @returns エスケープ済み文字列
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	/**
	 * Shift_JISで表現できないBOT絵文字を[BOT]テキストに置換する。
	 *
	 * See: docs/architecture/components/senbra-adapter.md §2 DatFormatter
	 *   "BOTマーク絵文字（🤖等）の Shift_JIS 変換不可問題：DAT出力時は `[BOT]` テキストに置換する"
	 *
	 * @param text - 置換対象の文字列
	 * @returns BOT絵文字を[BOT]に置換した文字列
	 */
	private replaceBotEmoji(text: string): string {
		let result = text;
		for (const [pattern, replacement] of BOT_EMOJI_REPLACEMENTS) {
			result = result.replace(pattern, replacement);
		}
		return result;
	}

	/**
	 * 日付とIDをDAT形式のフィールド文字列に変換する。
	 *
	 * フォーマット: YYYY/MM/DD(曜) HH:mm:ss.SS ID:xxxxxxxx
	 * 小数点以下2桁(SS)はミリ秒の上2桁を使用する（5ch互換）。
	 *
	 * JST固定で出力する。toJSTDate() で UTC+9 にオフセットした Date を作成し、
	 * UTCメソッドで値を取得することで環境非依存の JST 日時を出力する。
	 *
	 * See: src/lib/utils/date.ts > toJSTDate
	 *
	 * @param date - 書き込み日時
	 * @param dailyId - 日次リセットID（8文字）
	 * @returns フォーマット済み日付IDフィールド文字列（JST固定）
	 */
	private formatDateId(date: Date, dailyId: string): string {
		// JST = UTC + 9時間。toJSTDate() でオフセット済み Date を得て UTCメソッドで読む
		const jst = toJSTDate(date);
		const y = jst.getUTCFullYear();
		const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
		const d = String(jst.getUTCDate()).padStart(2, "0");
		const weekday = WEEKDAY_JA[jst.getUTCDay()];
		const hh = String(jst.getUTCHours()).padStart(2, "0");
		const mm = String(jst.getUTCMinutes()).padStart(2, "0");
		const ss = String(jst.getUTCSeconds()).padStart(2, "0");
		// ミリ秒の上2桁（5ch互換: 小数点以下2桁）。ミリ秒はオフセットに依存しない
		const ms = String(Math.floor(date.getMilliseconds() / 10)).padStart(2, "0");
		return `${y}/${m}/${d}(${weekday}) ${hh}:${mm}:${ss}.${ms} ID:${dailyId}`;
	}
}
