/**
 * Google AI Adapter — Gemini API + Google Search Grounding クライアント
 *
 * TDR-015 準拠。`adapters/` に配置し、将来のマルチプロバイダ対応時に
 * アダプター追加で拡張する。
 *
 * リトライ戦略:
 *   - 最大試行回数: 3
 *   - バックオフ: 指数バックオフ（1s, 2s, 4s）
 *   - リトライ対象: HTTP 429, 500, 503 およびネットワークエラー
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §1
 */

import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// 公開インターフェース
// ---------------------------------------------------------------------------

/**
 * Gemini API の呼び出し結果。
 */
export interface GoogleAiResult {
	/** 生成されたテキスト */
	text: string;
	/** 実行された検索クエリ（デバッグ・ログ用） */
	searchQueries: string[];
}

/**
 * Google AI Adapter の DI インターフェース。
 * BDD テストではモック実装に差し替える。
 *
 * See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
 */
export interface IGoogleAiAdapter {
	generateWithSearch(params: {
		systemPrompt: string;
		userPrompt: string;
		modelId: string;
	}): Promise<GoogleAiResult>;
}

// ---------------------------------------------------------------------------
// リトライ設定
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// GoogleAiAdapter クラス
// ---------------------------------------------------------------------------

/**
 * Gemini API + Google Search Grounding を使用する本番実装。
 *
 * See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §1.4
 */
export class GoogleAiAdapter implements IGoogleAiAdapter {
	private readonly ai: GoogleGenAI;

	constructor(private readonly apiKey: string) {
		this.ai = new GoogleGenAI({ apiKey: this.apiKey });
	}

	/**
	 * Gemini API を呼び出し、Google Search Grounding でニュースを取得する。
	 * 失敗時は指数バックオフでリトライする（最大 3 回）。
	 *
	 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
	 * See: tmp/workers/bdd-architect_271/newspaper_design.md §1.6
	 */
	async generateWithSearch(params: {
		systemPrompt: string;
		userPrompt: string;
		modelId: string;
	}): Promise<GoogleAiResult> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				return await this._callGeminiApi(params);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));

				if (!this._isRetryable(err) || attempt === MAX_RETRIES - 1) {
					throw lastError;
				}

				// 指数バックオフ: 1s, 2s, 4s
				await this._sleep(INITIAL_DELAY_MS * 2 ** attempt);
			}
		}

		throw lastError!; // TypeScript 用（到達しない）
	}

	/**
	 * Gemini API を 1 回呼び出す内部メソッド。
	 * Google Search Grounding（tools: [{ googleSearch: {} }]）を有効化する。
	 */
	private async _callGeminiApi(params: {
		systemPrompt: string;
		userPrompt: string;
		modelId: string;
	}): Promise<GoogleAiResult> {
		const response = await this.ai.models.generateContent({
			model: params.modelId,
			contents: params.userPrompt,
			config: {
				systemInstruction: params.systemPrompt,
				tools: [{ googleSearch: {} }],
			},
		});

		// 検索クエリをログ出力（デバッグ・監視用）
		const searchQueries: string[] =
			response.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];

		if (searchQueries.length > 0) {
			console.info(
				"[GoogleAiAdapter] searchQueries:",
				searchQueries.join(", "),
			);
		}

		return {
			text: response.text ?? "",
			searchQueries,
		};
	}

	/**
	 * エラーがリトライ可能かどうかを判定する。
	 * 一時的な障害（429/500/503、ネットワークエラー）はリトライする。
	 * 恒久的なエラー（400/403）はリトライしない。
	 */
	private _isRetryable(err: unknown): boolean {
		if (err instanceof Error) {
			const message = err.message.toLowerCase();
			// HTTP 429 (rate limit), 500, 503 はリトライ対象
			if (
				message.includes("429") ||
				message.includes("500") ||
				message.includes("503") ||
				message.includes("network") ||
				message.includes("timeout") ||
				message.includes("econnreset") ||
				message.includes("fetch failed")
			) {
				return true;
			}
		}
		return false;
	}

	/** 指定ミリ秒待機する（指数バックオフ用）。 */
	private _sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
