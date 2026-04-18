/**
 * ドメインルール: URL検出・画像URL判定
 *
 * 本文中の全URLを検出し、画像URLかどうかを判定する純粋関数。
 * 外部依存なし。
 *
 * See: features/thread.feature @image_preview
 * See: tmp/workers/bdd-architect_TASK-212/design.md §2 URL検出ロジック
 */

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 対応する画像拡張子（大文字小文字不問で判定） */
export const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
] as const;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** URL検出結果 */
export interface UrlMatch {
	/** マッチしたURL文字列 */
	url: string;
	/** 本文中の開始位置 */
	startIndex: number;
	/** 本文中の終了位置 */
	endIndex: number;
	/** 画像URLかどうか */
	isImage: boolean;
	/** 音声URLかどうか */
	isAudio: boolean;
}

// ---------------------------------------------------------------------------
// URL検出の正規表現
// See: design.md §2.4
// ---------------------------------------------------------------------------

/** 本文中のURLを検出する正規表現（https:// または http:// で始まり、空白・<>等で終端） */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

// ---------------------------------------------------------------------------
// 関数
// ---------------------------------------------------------------------------

/**
 * URLが画像URLかどうかを判定する純粋関数。
 *
 * クエリ文字列（?以降）とフラグメント（#以降）を除去した上で
 * パス末尾の拡張子が IMAGE_EXTENSIONS のいずれかに一致するかを
 * 大文字小文字不問で判定する。
 *
 * See: features/thread.feature @image_preview
 * See: design.md §2.5 isImageUrl の判定ロジック
 *
 * @param url - 判定対象のURL文字列
 * @returns 画像URLならtrue
 */
export function isImageUrl(url: string): boolean {
	if (!url) return false;

	// クエリ文字列（?以降）とフラグメント（#以降）を除去
	// 例: "https://example.com/a.jpg?w=100#top" → "https://example.com/a.jpg"
	let path = url;
	const queryIndex = path.indexOf("?");
	if (queryIndex !== -1) {
		path = path.slice(0, queryIndex);
	}
	const fragmentIndex = path.indexOf("#");
	if (fragmentIndex !== -1) {
		path = path.slice(0, fragmentIndex);
	}

	// パス末尾の拡張子を大文字小文字不問で IMAGE_EXTENSIONS と比較
	const lowerPath = path.toLowerCase();
	return IMAGE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

/**
 * URLが埋め込み再生対象の音声URLかどうかを判定する。
 *
 * 現状は !yomiage が配布する MP4 コンテナのみを対象にする。
 */
export function isAudioUrl(url: string): boolean {
	if (!url) return false;

	let path = url;
	const queryIndex = path.indexOf("?");
	if (queryIndex !== -1) {
		path = path.slice(0, queryIndex);
	}
	const fragmentIndex = path.indexOf("#");
	if (fragmentIndex !== -1) {
		path = path.slice(0, fragmentIndex);
	}

	return path.toLowerCase().endsWith(".mp4");
}

/**
 * 本文中の全URLを検出し、画像かどうかを判定する純粋関数。
 *
 * 本文中の https:// または http:// で始まるURLを正規表現で検出し、
 * 各URLに対して isImageUrl で画像判定を行う。
 * 出現順に配列として返す。
 *
 * See: features/thread.feature @image_preview
 * See: design.md §2.3 関数インターフェース
 * See: design.md §6.2 分割ロジックの詳細
 *
 * @param body - レス本文
 * @returns URL検出結果の配列（出現順）
 */
export function detectUrls(body: string): UrlMatch[] {
	if (!body) return [];

	const results: UrlMatch[] = [];
	// グローバル正規表現は lastIndex をリセットして使う
	const pattern = new RegExp(URL_PATTERN.source, "g");
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(body)) !== null) {
		const url = match[0];
		const startIndex = match.index;
		const endIndex = startIndex + url.length;

		results.push({
			url,
			startIndex,
			endIndex,
			isImage: isImageUrl(url),
			isAudio: isAudioUrl(url),
		});
	}

	return results;
}
