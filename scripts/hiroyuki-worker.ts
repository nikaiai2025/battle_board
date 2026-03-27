/**
 * hiroyuki-worker.ts -- !hiroyuki GH Actions ワーカースクリプト
 *
 * GitHub Actions hiroyuki-scheduler から tsx で実行されるエントリポイント。
 * Vercel の /api/internal/hiroyuki/pending から pending リスト（+スレッド全レス）を取得し、
 * GoogleAiAdapter.generate() で AI テキスト生成を行い、
 * /api/internal/hiroyuki/complete に結果を送信する。
 *
 * 責務:
 *   1. GET /api/internal/hiroyuki/pending -> pending リスト + スレッドレス取得
 *   2. 各 pending に対して:
 *      a. スレッドレスからプロンプトを構築（systemInstruction / contents を構造的に分離）
 *      b. GoogleAiAdapter.generate() で AI テキスト生成
 *      c. POST /api/internal/hiroyuki/complete -> 結果送信
 *   3. エラー時も /complete にエラー情報を送信（Vercel 側で通貨返却）
 *
 * セキュリティ:
 *   systemInstruction（ハードコード人格設定）と contents（スレッド本文 UGC）を
 *   Gemini API の構造で分離する。同一メッセージに混在させない。
 *   See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
 *   See: CLAUDE.md 横断的制約「ユーザー入力をそのままLLMに渡すことを禁止する」
 *
 * 環境変数:
 *   DEPLOY_URL     -- Vercel デプロイ URL
 *   BOT_API_KEY    -- Internal API 認証キー
 *   GEMINI_API_KEYS -- Google AI API キー（カンマ区切りで複数指定可）
 *
 * See: features/command_hiroyuki.feature
 * See: tmp/orchestrator/memo_hiroyuki_command.md §4, §7, §8
 */

import {
	HIROYUKI_MODEL_ID,
	HIROYUKI_SYSTEM_PROMPT,
} from "../config/hiroyuki-prompt";
import { GoogleAiAdapter } from "../src/lib/infrastructure/adapters/google-ai-adapter";

// ---------------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------------

const DEPLOY_URL = process.env.DEPLOY_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const GEMINI_API_KEYS_RAW = process.env.GEMINI_API_KEYS;

// 必須環境変数の存在確認
if (!DEPLOY_URL) {
	console.error("[hiroyuki-worker] DEPLOY_URL is not set");
	process.exit(1);
}
if (!BOT_API_KEY) {
	console.error("[hiroyuki-worker] BOT_API_KEY is not set");
	process.exit(1);
}
if (!GEMINI_API_KEYS_RAW) {
	console.error("[hiroyuki-worker] GEMINI_API_KEYS is not set");
	process.exit(1);
}

// カンマ区切りの API キーをパースし、空要素を除外
const GEMINI_API_KEYS = GEMINI_API_KEYS_RAW.split(",")
	.map((k) => k.trim())
	.filter((k) => k.length > 0);

if (GEMINI_API_KEYS.length === 0) {
	console.error("[hiroyuki-worker] GEMINI_API_KEYS contains no valid keys");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 1 回の GH Actions 実行で処理する pending 件数の上限（安全ガード）。
 * See: scripts/newspaper-worker.ts の同パターン
 */
const MAX_PROCESS_PER_EXECUTION = 10;

/**
 * スレッドレスのトランケーション上限（安全弁）。
 * 1000レス x 150文字 ≈ 225Kトークン で Gemini 1M コンテキスト内だが、
 * 異常系での過大なリクエストを防ぐため上限を設ける。
 *
 * See: tmp/orchestrator/memo_hiroyuki_command.md §8
 */
const MAX_THREAD_POSTS = 500;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** /api/internal/hiroyuki/pending のレスポンス型 */
interface PendingResponse {
	pendingList: Array<{
		id: string;
		threadId: string;
		invokerUserId: string;
		targetPostNumber: number;
		payload: {
			model_id?: string;
			targetPostNumber?: number;
		} | null;
	}>;
	threadPostsMap: Record<
		string,
		Array<{
			postNumber: number;
			authorId: string;
			dailyId: string;
			body: string;
			displayName: string;
			isSystemMessage: boolean;
			isDeleted: boolean;
		}>
	>;
}

// ---------------------------------------------------------------------------
// プロンプト構築
// ---------------------------------------------------------------------------

/**
 * スレッドレスからユーザープロンプトを構築する。
 * systemInstruction と contents を構造的に分離するため、
 * この関数は contents（ユーザープロンプト）のみを返す。
 *
 * ターゲットあり: スレッド全レス + 対象ユーザーの全レスを特定する情報 + 返信指示
 * ターゲットなし: スレッド全レス + スレッド全体への感想指示
 *
 * See: features/command_hiroyuki.feature @ターゲット指定時、対象ユーザーの全レスがAI APIに渡される
 * See: features/command_hiroyuki.feature @ターゲットなし時、スレッド全体のみがコンテキストとして渡される
 * See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
 */
function buildUserPrompt(
	posts: PendingResponse["threadPostsMap"][string],
	targetPostNumber: number,
): string {
	// トランケーション: 直近N件に制限（安全弁）
	// See: tmp/orchestrator/memo_hiroyuki_command.md §8
	const truncatedPosts = posts.slice(-MAX_THREAD_POSTS);

	// スレッド全レスのテキストを構築
	const threadContext = truncatedPosts
		.filter((p) => !p.isDeleted)
		.map((p) => {
			const nameLabel = p.isSystemMessage ? "★システム" : p.displayName;
			return `>>${p.postNumber} ${nameLabel}(ID:${p.dailyId}): ${p.body}`;
		})
		.join("\n");

	if (targetPostNumber > 0) {
		// ターゲットあり: 対象ユーザーのIDを特定し、返信指示を付与
		const targetPost = posts.find((p) => p.postNumber === targetPostNumber);
		if (targetPost) {
			const targetDailyId = targetPost.dailyId;
			// 対象ユーザーの全レス番号を列挙
			const targetPostNumbers = posts
				.filter(
					(p) =>
						p.dailyId === targetDailyId && !p.isDeleted && !p.isSystemMessage,
				)
				.map((p) => p.postNumber);

			return `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nID: ${targetDailyId} のユーザーの投稿（レス番号${targetPostNumbers.join(", ")}）に対して返信してください。`;
		}
	}

	// ターゲットなし: スレッド全体への感想指示
	return `以下はスレッドの全レスです:\n\n${threadContext}\n\n---\nスレッド全体の流れを読んで感想を述べてください。`;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * メイン処理。
 *
 * pending リスト（+スレッドレス）を取得し、各 pending に対して
 * AI テキスト生成 -> 結果送信を行う。
 *
 * See: features/command_hiroyuki.feature
 */
async function main(): Promise<void> {
	console.log(`=== Hiroyuki Worker started at ${new Date().toISOString()} ===`);

	// Step 1: pending リスト + スレッドレスを取得
	const pendingRes = await fetch(
		`${DEPLOY_URL}/api/internal/hiroyuki/pending`,
		{
			headers: { Authorization: `Bearer ${BOT_API_KEY}` },
		},
	);

	if (!pendingRes.ok) {
		throw new Error(
			`GET /pending failed: ${pendingRes.status} ${pendingRes.statusText}`,
		);
	}

	const { pendingList, threadPostsMap } =
		(await pendingRes.json()) as PendingResponse;

	if (pendingList.length === 0) {
		console.log("[hiroyuki-worker] No pending hiroyuki commands.");
		return;
	}

	console.log(
		`[hiroyuki-worker] Found ${pendingList.length} pending command(s). Processing up to ${MAX_PROCESS_PER_EXECUTION}.`,
	);

	// 安全ガード: 上限件数以内に制限する
	const toProcess = pendingList.slice(0, MAX_PROCESS_PER_EXECUTION);

	console.log(`[hiroyuki-worker] Loaded ${GEMINI_API_KEYS.length} API key(s)`);
	const adapter = new GoogleAiAdapter(GEMINI_API_KEYS);

	// Step 2: 各 pending を処理
	for (const pending of toProcess) {
		const payload = pending.payload;
		const modelId = payload?.model_id ?? HIROYUKI_MODEL_ID;
		const targetPostNumber = payload?.targetPostNumber ?? 0;
		const threadPosts = threadPostsMap[pending.threadId] ?? [];

		console.log(
			`[hiroyuki-worker] Processing pending=${pending.id} target=${targetPostNumber} posts=${threadPosts.length}`,
		);

		let completeBody: Record<string, unknown>;

		try {
			// ユーザープロンプト構築
			// See: features/command_hiroyuki.feature @スレッド本文がシステムプロンプトと構造的に分離されている
			const userPrompt = buildUserPrompt(threadPosts, targetPostNumber);

			// AI テキスト生成（検索なし）
			// systemPrompt と userPrompt は Gemini API の
			// systemInstruction / contents として構造的に分離される
			// See: src/lib/infrastructure/adapters/google-ai-adapter.ts > _callGeminiApiWithoutSearch
			const aiResult = await adapter.generate({
				systemPrompt: HIROYUKI_SYSTEM_PROMPT,
				userPrompt,
				modelId,
			});

			completeBody = {
				pendingId: pending.id,
				threadId: pending.threadId,
				invokerUserId: pending.invokerUserId,
				success: true,
				generatedText: aiResult.text,
				targetPostNumber,
			};

			console.log(
				`[hiroyuki-worker] AI generation succeeded for pending=${pending.id}`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			console.error(
				`[hiroyuki-worker] AI generation failed for pending=${pending.id}: ${errorMessage}`,
			);

			completeBody = {
				pendingId: pending.id,
				threadId: pending.threadId,
				invokerUserId: pending.invokerUserId,
				success: false,
				error: errorMessage,
				targetPostNumber,
			};
		}

		// Step 3: 結果を Vercel に送信
		const completeRes = await fetch(
			`${DEPLOY_URL}/api/internal/hiroyuki/complete`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${BOT_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(completeBody),
			},
		);

		if (!completeRes.ok) {
			console.error(
				`[hiroyuki-worker] POST /complete failed for pending=${pending.id}: ${completeRes.status} ${completeRes.statusText}`,
			);
		} else {
			console.log(
				`[hiroyuki-worker] POST /complete succeeded for pending=${pending.id}`,
			);
		}
	}

	console.log(
		`=== Hiroyuki Worker finished at ${new Date().toISOString()} ===`,
	);
}

main().catch((err) => {
	console.error("[hiroyuki-worker] Fatal error:", err);
	process.exit(1);
});
