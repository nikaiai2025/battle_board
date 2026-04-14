/**
 * WikipediaAdapter — Wikimedia pageviews top API 収集アダプター
 *
 * ja.wikipedia の日次急上昇記事 Top6（メタページ除外後）を取得する。
 *
 * 処理フロー:
 *   1. UTC 現在時刻から「2日前」の年月日を算出（pageviews の生成遅延対応）
 *   2. Wikimedia pageviews top API を呼び出し、articles 配列を取得
 *   3. 404 の場合は「3日前」で再試行（1段フォールバック）
 *   4. メタページ（メインページ / 特別: / Wikipedia: 等）を除外
 *   5. 先頭から 6件を CollectedItem[] に変換して返す
 *
 * エラーハンドリング:
 *   - 2日前・3日前ともに 404: 例外をスロー
 *   - 429 / 5xx: 即座に例外をスロー（リトライしない）
 *   - タイムアウト: AbortController で 10秒打ち切り
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
 * See: docs/architecture/components/bot.md §2.13.5
 * See: tmp/workers/bdd-architect_TASK-379/design.md
 */

import type { CollectedItem } from "../../services/bot-strategies/types";
import type { CollectionAdapter, SourceConfig } from "./types";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** API レスポンスの articles 配列要素 */
interface WikipediaArticle {
	article: string;
	views: number;
	rank: number;
}

/** API レスポンストップレベル */
interface WikipediaTopResponse {
	items: Array<{
		project: string;
		access: string;
		year: string;
		month: string;
		day: string;
		articles?: WikipediaArticle[];
	}>;
}

/**
 * fetchJson の型。
 * 本番では default 実装が fetch + タイムアウト + User-Agent 付与を行う。
 * テスト時はコンストラクタ経由でモック注入する。
 *
 * @returns
 *   - ok:    HTTP 2xx のとき true
 *   - status: HTTP ステータスコード
 *   - body:  JSON パース結果（ok=false でもパース可能なら含む。失敗時は null）
 */
export type FetchJsonFn = (url: string) => Promise<{
	ok: boolean;
	status: number;
	body: WikipediaTopResponse | null;
}>;

// ---------------------------------------------------------------------------
// メタページ除外定数
// See: design.md §6
// ---------------------------------------------------------------------------

/** 完全一致で除外（メインページ系） */
const EXACT_EXCLUDES: ReadonlySet<string> = new Set([
	"メインページ",
	"Main_Page",
]);

/** プレフィックス一致で除外（名前空間プレフィックス） */
const PREFIX_EXCLUDES: readonly string[] = [
	"特別:",
	"Special:",
	"Wikipedia:",
	"ヘルプ:",
	"Help:",
	"Category:",
	"カテゴリ:",
	"File:",
	"ファイル:",
	"Talk:",
	"ノート:",
	"Template:",
	"Portal:",
	"ポータル:",
	"利用者:",
	"User:",
];

// ---------------------------------------------------------------------------
// その他の定数
// ---------------------------------------------------------------------------

/** 収集件数上限（メタページ除外後の先頭N件） */
const TOP_LIMIT = 6;

/** API タイムアウト（ミリ秒） */
const FETCH_TIMEOUT_MS = 10_000;

/** ja.wikipedia のWeb URL 構築ベース */
const JA_WIKI_BASE = "https://ja.wikipedia.org/wiki/";

/** User-Agent 既定の連絡先（WIKIMEDIA_CONTACT 未設定時のフォールバック）*/
const DEFAULT_CONTACT = "bot-ops@example.com";

// ---------------------------------------------------------------------------
// プライベート純粋関数（単体テスト対象 — すべて export する）
// ---------------------------------------------------------------------------

/**
 * article 名がメタページ（百科事典記事以外）かどうかを判定する。
 * 完全一致 + プレフィックス一致のハイブリッド。
 *
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: tmp/workers/bdd-architect_TASK-379/design.md §6
 */
export function isMetaPage(article: string): boolean {
	if (EXACT_EXCLUDES.has(article)) return true;
	return PREFIX_EXCLUDES.some((p) => article.startsWith(p));
}

/**
 * Wikimedia pageviews top API の URL を組み立てる。
 *
 * See: tmp/workers/bdd-architect_TASK-379/design.md §2.4
 *
 * @param baseUrl - プロファイルの source_url（例: "https://.../all-access"）
 * @param year    - 4桁年
 * @param month   - 2桁月（"04" など 0 埋め済み）
 * @param day     - 2桁日（"12" など 0 埋め済み）
 */
export function buildApiUrl(
	baseUrl: string,
	year: number,
	month: string,
	day: string,
): string {
	return `${baseUrl.replace(/\/$/, "")}/${year}/${month}/${day}`;
}

/**
 * UTC 現在時刻から N 日前の年月日を返す。
 * Wikimedia の pageviews は UTC 基準で日次集計され、生成遅延があるため
 * N=2（2日前）を標準パス、N=3 をフォールバックに使う。
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: tmp/workers/bdd-architect_TASK-379/design.md §2.2, §5.3
 *
 * @returns { year: number, month: string（MM）, day: string（DD） }
 */
export function getTargetDateUtc(
	nowUtcMs: number,
	daysAgo: number,
): { year: number; month: string; day: string } {
	const target = new Date(nowUtcMs - daysAgo * 24 * 60 * 60 * 1000);
	const year = target.getUTCFullYear();
	const month = String(target.getUTCMonth() + 1).padStart(2, "0");
	const day = String(target.getUTCDate()).padStart(2, "0");
	return { year, month, day };
}

/**
 * User-Agent ヘッダ文字列を組み立てる。
 * Wikimedia User-Agent Policy 準拠:
 *   <client name>/<version> (<contact info>) <library name>/<version>
 *
 * See: tmp/workers/bdd-architect_TASK-379/design.md §7
 *
 * @param contact - 連絡先メールアドレス（process.env.WIKIMEDIA_CONTACT）。
 *                  未指定時は DEFAULT_CONTACT にフォールバック。
 */
export function buildUserAgent(contact?: string | null): string {
	const effectiveContact =
		contact && contact.trim() !== "" ? contact.trim() : DEFAULT_CONTACT;
	return `BattleBoard/1.0 (+https://github.com/nikaiai2025/battle_board; ${effectiveContact}) curation-bot/1.0`;
}

/**
 * Wikimedia API の1記事を CollectedItem に変換する。
 *
 * See: features/curation_bot.feature @キュレーションBOTが蓄積データから新規スレッドを立てる
 * See: tmp/workers/bdd-architect_TASK-379/design.md §9
 *
 * - articleTitle: アンダースコアを半角スペースに置換（人間可読化）
 * - sourceUrl:    https://ja.wikipedia.org/wiki/{encodeURIComponent(article)}
 *                 （API の article は既にスペース→アンダースコア変換済み）
 * - buzzScore:    views をそのまま採用（design.md §3）
 */
export function articleToCollectedItem(
	article: WikipediaArticle,
): CollectedItem {
	// API 仕様変更時の保険として、スペース→アンダースコア置換を通す
	const normalized = article.article.replace(/ /g, "_");
	return {
		articleTitle: article.article.replace(/_/g, " "),
		sourceUrl: `${JA_WIKI_BASE}${encodeURIComponent(normalized)}`,
		buzzScore: article.views,
	};
}

/**
 * デフォルトの fetchJson 実装。
 * User-Agent を付与し、10秒タイムアウト、JSON レスポンスをパース。
 *
 * 本番環境（GitHub Actions）でのみ使用される。単体テストでは fetchJsonFn を
 * コンストラクタ経由で注入し、本関数をバイパスする。
 *
 * See: tmp/workers/bdd-architect_TASK-379/design.md §5.4, §7
 */
export async function defaultFetchJson(
	url: string,
	contact?: string | null,
): Promise<{
	ok: boolean;
	status: number;
	body: WikipediaTopResponse | null;
}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": buildUserAgent(contact),
				Accept: "application/json",
			},
		});
		let body: WikipediaTopResponse | null = null;
		try {
			body = (await response.json()) as WikipediaTopResponse;
		} catch {
			body = null;
		}
		return { ok: response.ok, status: response.status, body };
	} finally {
		clearTimeout(timer);
	}
}

// ---------------------------------------------------------------------------
// WikipediaAdapter クラス
// ---------------------------------------------------------------------------

/**
 * WikipediaAdapter — Wikimedia pageviews top API を使う収集アダプター。
 *
 * collect() の処理フロー:
 *   1. UTC 2日前の日付で API 呼び出し
 *   2. 404 なら UTC 3日前でフォールバック（1段のみ）
 *   3. メタページを除外してから先頭 6件を返す
 *
 * エラーハンドリング:
 *   - 2日前・3日前ともに 404: 例外スロー（collection-job.ts がソース単位で隔離する）
 *   - 429 / 5xx: 即座に例外スロー（リトライしない）
 *
 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
 * See: docs/architecture/components/bot.md §2.13.5
 */
export class WikipediaAdapter implements CollectionAdapter {
	private readonly fetchJson: FetchJsonFn;
	private readonly nowUtcMs: () => number;

	/**
	 * @param fetchJsonFn - テスト時に注入するフェッチ関数。
	 *                      省略時は defaultFetchJson + process.env.WIKIMEDIA_CONTACT を使用。
	 * @param nowUtcMsFn  - テスト時に注入する現在時刻関数。省略時は Date.now() を使用。
	 */
	constructor(fetchJsonFn?: FetchJsonFn, nowUtcMsFn?: () => number) {
		this.fetchJson =
			fetchJsonFn ??
			((url) => defaultFetchJson(url, process.env.WIKIMEDIA_CONTACT));
		this.nowUtcMs = nowUtcMsFn ?? (() => Date.now());
	}

	/**
	 * バズ情報を収集して CollectedItem[] に変換して返す。
	 *
	 * See: features/curation_bot.feature @日次バッチでバズデータを収集・蓄積する
	 * See: features/curation_bot.feature @ソースごとの蓄積上限は6件である
	 */
	async collect(config: SourceConfig): Promise<CollectedItem[]> {
		const articles = await this.fetchWithFallback(config.sourceUrl);
		const filtered = articles.filter((a) => !isMetaPage(a.article));
		const top = filtered.slice(0, TOP_LIMIT);
		return top.map(articleToCollectedItem);
	}

	/**
	 * UTC 2日前・3日前の順で API を呼び、最初に成功した日付の articles を返す。
	 *
	 * See: features/curation_bot.feature @データ取得失敗時は前回の蓄積データを保持する
	 * See: tmp/workers/bdd-architect_TASK-379/design.md §5.3
	 */
	private async fetchWithFallback(
		baseUrl: string,
	): Promise<WikipediaArticle[]> {
		const attempts: number[] = [2, 3];
		let last404: string | null = null;

		for (const daysAgo of attempts) {
			const { year, month, day } = getTargetDateUtc(this.nowUtcMs(), daysAgo);
			const url = buildApiUrl(baseUrl, year, month, day);
			const res = await this.fetchJson(url);

			if (res.status === 404) {
				last404 = url;
				continue; // フォールバックへ
			}
			if (!res.ok || !res.body) {
				throw new Error(`Wikimedia API error: url=${url} status=${res.status}`);
			}
			const articles = res.body.items?.[0]?.articles;
			if (!Array.isArray(articles)) {
				throw new Error(`Wikimedia API: 予期しないレスポンス構造 url=${url}`);
			}
			return articles;
		}

		throw new Error(
			`Wikimedia API: 2日前・3日前ともデータ未生成（最終404: ${last404}）`,
		);
	}
}
