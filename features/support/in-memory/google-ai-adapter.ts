/**
 * インメモリ Google AI Adapter — BDD テスト用モック
 *
 * IGoogleAiAdapter インターフェースのモック実装。
 * BDD テストでは本物の Gemini API を呼ばずに固定レスポンスを返す。
 * `shouldFail=true` に設定すると例外をスローする（エラーシナリオ検証用）。
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_271/newspaper_design.md §5.1
 */

import type {
	GoogleAiResult,
	IGoogleAiAdapter,
} from "../../../src/lib/infrastructure/adapters/google-ai-adapter";

/**
 * BDD テスト用の Google AI Adapter モック。
 * AI API を呼ばずに固定レスポンスを返す。
 *
 * See: features/command_newspaper.feature @AI APIに新聞配達員の人格プロンプトとカテゴリ指示が渡される
 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
 */
export class InMemoryGoogleAiAdapter implements IGoogleAiAdapter {
	/** 次回の generateWithSearch で返す結果（テストから設定可能） */
	nextResult: GoogleAiResult = {
		text: "【ITニュース速報】\nテスト用のニュース記事です。\n\nソース: テスト",
		searchQueries: ["テスト検索クエリ"],
	};

	/** true に設定すると generateWithSearch が例外をスローする */
	shouldFail = false;

	/** 呼び出し履歴（アサーション用） */
	calls: Array<{
		systemPrompt: string;
		userPrompt: string;
		modelId: string;
	}> = [];

	/**
	 * AI API の呼び出しをシミュレートする。
	 * shouldFail=true の場合は例外をスロー（リトライ含む全試行失敗のシミュレーション）。
	 *
	 * See: features/command_newspaper.feature @AI API呼び出しが失敗した場合は通貨返却・システム通知
	 */
	async generateWithSearch(params: {
		systemPrompt: string;
		userPrompt: string;
		modelId: string;
	}): Promise<GoogleAiResult> {
		this.calls.push(params);

		if (this.shouldFail) {
			throw new Error("AI API is unavailable (mock)");
		}

		return this.nextResult;
	}

	/** テストのリセット用（各シナリオの Before フックから呼び出す） */
	reset(): void {
		this.nextResult = {
			text: "【ITニュース速報】\nテスト用のニュース記事です。\n\nソース: テスト",
			searchQueries: ["テスト検索クエリ"],
		};
		this.shouldFail = false;
		this.calls = [];
	}
}
