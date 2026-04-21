/**
 * GoogleAiAdapter.generate() 単体テスト
 *
 * 検索なしの generate() メソッドの振る舞いを検証する。
 * - tools なしで Gemini API を呼び出すこと
 * - systemInstruction と contents を分離すること（プロンプトインジェクション防止）
 * - リトライが正しく動作すること
 *
 * テスト方針:
 *   - @google/genai の GoogleGenAI をモック化する
 *   - generateContent 呼び出しの引数を検証する
 *
 * See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
 * See: tmp/orchestrator/memo_hiroyuki_command.md §6
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// @google/genai モック
// ---------------------------------------------------------------------------

// vi.mock はホイストされるため、ファクトリ関数内ではモジュールスコープ変数を使えない。
// vi.hoisted を使ってモック関数を宣言する。
const { mockGenerateContent } = vi.hoisted(() => {
	return { mockGenerateContent: vi.fn() };
});

vi.mock("@google/genai", () => ({
	// Arrow Function はコンストラクタとして使えないため、通常の関数を使用する
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	GoogleGenAI: function (this: any) {
		this.models = { generateContent: mockGenerateContent };
	},
}));

// モック後にアダプタをインポート
import { GoogleAiAdapter } from "../../../../lib/infrastructure/adapters/google-ai-adapter";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-api-key-123";
const TEST_MODEL_ID = "gemini-3-flash-preview";
const TEST_SYSTEM_PROMPT = "あなたはひろゆきです。";
const TEST_USER_PROMPT = "スレッドの内容です。";

/** 成功レスポンスのモック */
function createSuccessResponse(text: string) {
	return {
		text,
		candidates: [{ groundingMetadata: { webSearchQueries: [] } }],
	};
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("GoogleAiAdapter.generate()", () => {
	let adapter: GoogleAiAdapter;

	beforeEach(() => {
		adapter = new GoogleAiAdapter(TEST_API_KEY);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// =========================================================================
	// 正常系: tools なしで呼び出すこと
	// See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
	// =========================================================================

	describe("正常系", () => {
		it("テキスト生成に成功し { text } を返す", async () => {
			mockGenerateContent.mockResolvedValue(
				createSuccessResponse("そういうことっすよ"),
			);

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result).toEqual({ text: "そういうことっすよ" });
		});

		it("generateContent が 1 回呼ばれる", async () => {
			mockGenerateContent.mockResolvedValue(createSuccessResponse("テキスト"));

			await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(mockGenerateContent).toHaveBeenCalledTimes(1);
		});

		it("tools を渡さないこと（Search Grounding 無効）", async () => {
			mockGenerateContent.mockResolvedValue(createSuccessResponse("テキスト"));

			await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			const callArgs = mockGenerateContent.mock.calls[0][0];
			// tools が渡されていないことを確認（generateWithSearch との差分）
			expect(callArgs.config?.tools).toBeUndefined();
		});

		it("structuredOutput が指定された場合は responseMimeType と responseSchema を渡す", async () => {
			mockGenerateContent.mockResolvedValue(createSuccessResponse("[\"a\"]"));

			await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
				structuredOutput: {
					responseMimeType: "application/json",
					responseSchema: {
						type: "array",
						items: { type: "string" },
						minItems: 1,
						maxItems: 1,
					},
				},
			});

			const callArgs = mockGenerateContent.mock.calls[0][0];
			expect(callArgs.config?.responseMimeType).toBe("application/json");
			expect(callArgs.config?.responseSchema).toEqual({
				type: "array",
				items: { type: "string" },
				minItems: 1,
				maxItems: 1,
			});
		});

		it("systemInstruction と contents が分離されていること（プロンプトインジェクション防止）", async () => {
			// See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
			// See: CLAUDE.md 横断的制約「ユーザー入力をそのままLLMに渡すことを禁止する」
			mockGenerateContent.mockResolvedValue(createSuccessResponse("テキスト"));

			await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			const callArgs = mockGenerateContent.mock.calls[0][0];

			// systemInstruction がシステムプロンプトである
			expect(callArgs.config?.systemInstruction).toBe(TEST_SYSTEM_PROMPT);
			// contents がユーザープロンプト（スレッド本文）である
			expect(callArgs.contents).toBe(TEST_USER_PROMPT);
		});

		it("指定したモデルIDが使用される", async () => {
			mockGenerateContent.mockResolvedValue(createSuccessResponse("テキスト"));

			await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			const callArgs = mockGenerateContent.mock.calls[0][0];
			expect(callArgs.model).toBe(TEST_MODEL_ID);
		});

		it("APIが空テキストを返した場合、空文字列を返す", async () => {
			mockGenerateContent.mockResolvedValue({ text: null, candidates: [] });

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result.text).toBe("");
		});
	});

	// =========================================================================
	// リトライ: 失敗からの回復
	// =========================================================================

	describe("リトライ戦略", () => {
		beforeEach(() => {
			// _sleep をスタブして待機時間をスキップ
			vi.spyOn(
				adapter as unknown as { _sleep: (ms: number) => Promise<void> },
				"_sleep",
			).mockResolvedValue(undefined);
		});

		it("429 エラーで 1 回失敗した後、2 回目で成功する", async () => {
			mockGenerateContent
				.mockRejectedValueOnce(new Error("429 Too Many Requests"))
				.mockResolvedValueOnce(createSuccessResponse("リトライ成功"));

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result).toEqual({ text: "リトライ成功" });
			expect(mockGenerateContent).toHaveBeenCalledTimes(2);
		});

		it("500 エラーで 2 回失敗した後、3 回目で成功する", async () => {
			mockGenerateContent
				.mockRejectedValueOnce(new Error("500 Internal Server Error"))
				.mockRejectedValueOnce(new Error("500 Internal Server Error"))
				.mockResolvedValueOnce(createSuccessResponse("最終成功"));

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result).toEqual({ text: "最終成功" });
			expect(mockGenerateContent).toHaveBeenCalledTimes(3);
		});

		it("3 回全て失敗した場合、エラーを投げる", async () => {
			mockGenerateContent.mockRejectedValue(
				new Error("503 Service Unavailable"),
			);

			await expect(
				adapter.generate({
					systemPrompt: TEST_SYSTEM_PROMPT,
					userPrompt: TEST_USER_PROMPT,
					modelId: TEST_MODEL_ID,
				}),
			).rejects.toThrow("503 Service Unavailable");

			expect(mockGenerateContent).toHaveBeenCalledTimes(3);
		});

		it("400 エラー（リトライ不可）は即座にエラーを投げる", async () => {
			mockGenerateContent.mockRejectedValue(new Error("400 Bad Request"));

			await expect(
				adapter.generate({
					systemPrompt: TEST_SYSTEM_PROMPT,
					userPrompt: TEST_USER_PROMPT,
					modelId: TEST_MODEL_ID,
				}),
			).rejects.toThrow("400 Bad Request");

			// リトライしないため 1 回のみ呼ばれる
			expect(mockGenerateContent).toHaveBeenCalledTimes(1);
		});

		it("ネットワークエラーはリトライされる", async () => {
			mockGenerateContent
				.mockRejectedValueOnce(new Error("network error"))
				.mockResolvedValueOnce(createSuccessResponse("ネットワーク回復"));

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result).toEqual({ text: "ネットワーク回復" });
			expect(mockGenerateContent).toHaveBeenCalledTimes(2);
		});
	});

	// =========================================================================
	// generate() と generateWithSearch() の差分確認
	// =========================================================================

	describe("generateWithSearch との差分", () => {
		it("generate() は searchQueries フィールドを返さない（{ text } のみ）", async () => {
			mockGenerateContent.mockResolvedValue(createSuccessResponse("テキスト"));

			const result = await adapter.generate({
				systemPrompt: TEST_SYSTEM_PROMPT,
				userPrompt: TEST_USER_PROMPT,
				modelId: TEST_MODEL_ID,
			});

			expect(result).not.toHaveProperty("searchQueries");
			expect(result).toEqual({ text: "テキスト" });
		});
	});
});
