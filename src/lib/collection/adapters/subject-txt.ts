/**
 * SubjectTxtAdapter — 5ch 系掲示板 subject.txt 収集アダプター
 *
 * subject.txt をフェッチし、バズスコア上位6件を収集する。
 * subject.txt のパースのみで完結し、DATファイルへのアクセスは行わない（5ch負荷軽減）。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5
 */

import { calculateBuzzScore } from "../../domain/rules/buzz-score";
import type { CollectedItem } from "../../services/bot-strategies/types";
import type { CollectionAdapter, SourceConfig } from "./types";

// buzz-score.ts への移管後も後方互換のため re-export する
// See: src/lib/domain/rules/buzz-score.ts
export { calculateBuzzScore };

// ---------------------------------------------------------------------------
// subject.txt パース
// ---------------------------------------------------------------------------

/** パース結果の中間型 */
interface SubjectEntry {
	/** スレッド番号（Unix タイムスタンプ文字列）例: "1711612345" */
	threadNumber: string;
	/** スレタイ */
	title: string;
	/** レス数 */
	resCount: number;
	/** スレッド作成時刻（Unix タイムスタンプ）*/
	createdUnixTime: number;
}

/**
 * subject.txt のテキストを解析し、SubjectEntry の配列に変換する。
 * フォーマット: `{threadNumber}.dat<>{title} ({resCount})`
 * 不正な行は無視する。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: docs/architecture/components/bot.md §2.13.5
 */
export function parseSubjectTxt(text: string): SubjectEntry[] {
	return text
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => {
			const match = line.match(/^(\d+)\.dat<>(.+)\s+\((\d+)\)$/);
			if (!match) return null;
			return {
				threadNumber: match[1],
				title: match[2].trim(),
				resCount: parseInt(match[3], 10),
				createdUnixTime: parseInt(match[1], 10),
			};
		})
		.filter((e): e is SubjectEntry => e !== null);
}

// ---------------------------------------------------------------------------
// fetch ヘルパー型定義
// ---------------------------------------------------------------------------

/**
 * テキスト取得関数の型。
 * 本番環境では Shift_JIS デコードを行う実装を使用し、
 * テスト環境ではコンストラクタ経由でモックを注入する。
 */
export type FetchTextFn = (url: string) => Promise<string>;

/**
 * デフォルトの fetchText 実装。
 * subject.txt / DAT は Shift_JIS エンコードのため TextDecoder("shift_jis") でデコードする。
 * Shift_JIS デコードは Node.js の ICU full データが必要（GitHub Actions ubuntu-latest で利用可能）。
 *
 * See: docs/architecture/components/bot.md §2.13.5 Shift_JIS デコード
 */
export async function defaultFetchText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`fetch failed: ${url} (${response.status})`);
	}
	// subject.txt / DAT は Shift_JIS
	const buffer = await response.arrayBuffer();
	const decoder = new TextDecoder("shift_jis");
	return decoder.decode(buffer);
}

// ---------------------------------------------------------------------------
// SubjectTxtAdapter
// ---------------------------------------------------------------------------

/**
 * SubjectTxtAdapter — 5ch 系掲示板の subject.txt を収集するアダプター実装。
 *
 * collect() の処理フロー:
 *   1. subject.txt を fetch してスレッド一覧を取得
 *   2. バズスコアを算出してソート
 *   3. 上位6件を CollectedItem[] に変換して返す
 *
 * エラーハンドリング:
 *   - subject.txt の fetch 失敗: 例外をスロー（collection-job.ts が隔離する）
 *
 * @param fetchTextFn - テキスト取得関数（テスト時にモックを注入する）。
 *                      省略時はデフォルトの Shift_JIS デコード実装を使用。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: docs/architecture/components/bot.md §2.13.5
 */
export class SubjectTxtAdapter implements CollectionAdapter {
	private readonly fetchText: FetchTextFn;

	constructor(fetchTextFn?: FetchTextFn) {
		this.fetchText = fetchTextFn ?? defaultFetchText;
	}

	async collect(config: SourceConfig): Promise<CollectedItem[]> {
		// 1. subject.txt を fetch
		const subjectText = await this.fetchText(config.sourceUrl);
		const entries = parseSubjectTxt(subjectText);

		// 2. バズスコア算出・降順ソート
		const scored = entries
			.map((e) => ({
				...e,
				buzzScore: calculateBuzzScore(e.resCount, e.createdUnixTime),
			}))
			.sort((a, b) => b.buzzScore - a.buzzScore);

		// 3. 上位6件を CollectedItem[] に変換
		const top6 = scored.slice(0, 6);
		const baseUrl = config.sourceUrl.replace(/\/subject\.txt$/, "");

		return top6.map((entry) => ({
			articleTitle: entry.title,
			// 元ネタURL はスレッド番号から構築
			sourceUrl: `${baseUrl}/${entry.threadNumber}`,
			buzzScore: entry.buzzScore,
		}));
	}
}
