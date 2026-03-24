/**
 * newspaper-worker.ts — !newspaper GH Actions ワーカースクリプト
 *
 * GitHub Actions newspaper-scheduler から tsx で実行されるエントリポイント。
 * Vercel の /api/internal/newspaper/pending から pending リストを取得し、
 * GoogleAiAdapter で AI 生成を行い、/api/internal/newspaper/complete に結果を送信する。
 *
 * 責務:
 *   1. GET /api/internal/newspaper/pending → pending リスト取得
 *   2. 各 pending に対して GoogleAiAdapter.generateWithSearch() で AI テキスト生成
 *   3. POST /api/internal/newspaper/complete → 生成済みテキスト + メタ情報を送信
 *   エラー時: POST /api/internal/newspaper/complete → エラー情報を送信（Vercel 側で通貨返却・通知）
 *
 * 環境変数:
 *   DEPLOY_URL     — Vercel デプロイ URL（例: https://battle-board.vercel.app）
 *   BOT_API_KEY    — Internal API 認証キー
 *   GEMINI_API_KEYS — Google AI API キー（カンマ区切りで複数指定可）
 *
 * See: features/command_newspaper.feature
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §1
 */

import { NEWSPAPER_MODEL_ID } from "../config/newspaper-categories";
import { NEWSPAPER_SYSTEM_PROMPT } from "../config/newspaper-prompt";
import { GoogleAiAdapter } from "../src/lib/infrastructure/adapters/google-ai-adapter";

// ---------------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------------

const DEPLOY_URL = process.env.DEPLOY_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const GEMINI_API_KEYS_RAW = process.env.GEMINI_API_KEYS;

// 必須環境変数の存在確認
if (!DEPLOY_URL) {
	console.error("[newspaper-worker] DEPLOY_URL is not set");
	process.exit(1);
}
if (!BOT_API_KEY) {
	console.error("[newspaper-worker] BOT_API_KEY is not set");
	process.exit(1);
}
if (!GEMINI_API_KEYS_RAW) {
	console.error("[newspaper-worker] GEMINI_API_KEYS is not set");
	process.exit(1);
}

// カンマ区切りの API キーをパースし、空要素を除外
const GEMINI_API_KEYS = GEMINI_API_KEYS_RAW.split(",")
	.map((k) => k.trim())
	.filter((k) => k.length > 0);

if (GEMINI_API_KEYS.length === 0) {
	console.error("[newspaper-worker] GEMINI_API_KEYS contains no valid keys");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 1 回の GH Actions 実行で処理する pending 件数の上限（安全ガード）。
 * GH Actions はタイムアウト制約が緩い（最大 6h）ため全件処理が可能だが、
 * 異常系での無限処理を防ぐため上限 10 件を設ける。
 *
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §1.6
 */
const MAX_PROCESS_PER_EXECUTION = 10;

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * メイン処理。
 *
 * pending リストを取得し、各 pending に対して AI 生成 → 結果送信を行う。
 *
 * See: tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md §1.4
 */
async function main(): Promise<void> {
	console.log(
		`=== Newspaper Worker started at ${new Date().toISOString()} ===`,
	);

	// Step 1: pending リストを取得
	const pendingRes = await fetch(
		`${DEPLOY_URL}/api/internal/newspaper/pending`,
		{
			headers: { Authorization: `Bearer ${BOT_API_KEY}` },
		},
	);

	if (!pendingRes.ok) {
		throw new Error(
			`GET /pending failed: ${pendingRes.status} ${pendingRes.statusText}`,
		);
	}

	const { pendingList } = (await pendingRes.json()) as {
		pendingList: Array<{
			id: string;
			threadId: string;
			invokerUserId: string;
			payload: { category?: string; model_id?: string } | null;
		}>;
	};

	if (pendingList.length === 0) {
		console.log("[newspaper-worker] No pending newspaper commands.");
		return;
	}

	console.log(
		`[newspaper-worker] Found ${pendingList.length} pending command(s). Processing up to ${MAX_PROCESS_PER_EXECUTION}.`,
	);

	// 安全ガード: 上限件数以内に制限する
	const toProcess = pendingList.slice(0, MAX_PROCESS_PER_EXECUTION);

	console.log(`[newspaper-worker] Loaded ${GEMINI_API_KEYS.length} API key(s)`);
	const adapter = new GoogleAiAdapter(GEMINI_API_KEYS);

	// Step 2: 各 pending を処理
	for (const pending of toProcess) {
		const payload = pending.payload as {
			category?: string;
			model_id?: string;
		} | null;
		const category = payload?.category ?? "IT";
		const modelId = payload?.model_id ?? NEWSPAPER_MODEL_ID;

		console.log(
			`[newspaper-worker] Processing pending=${pending.id} category=${category}`,
		);

		let completeBody: Record<string, unknown>;

		try {
			// AI テキスト生成（Google Search Grounding 付き）
			const aiResult = await adapter.generateWithSearch({
				systemPrompt: NEWSPAPER_SYSTEM_PROMPT,
				userPrompt: `${category}カテゴリの最新ニュースを1件紹介してください。`,
				modelId,
			});

			completeBody = {
				pendingId: pending.id,
				threadId: pending.threadId,
				invokerUserId: pending.invokerUserId,
				success: true,
				generatedText: aiResult.text,
			};

			console.log(
				`[newspaper-worker] AI generation succeeded for pending=${pending.id}`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			console.error(
				`[newspaper-worker] AI generation failed for pending=${pending.id}: ${errorMessage}`,
			);

			completeBody = {
				pendingId: pending.id,
				threadId: pending.threadId,
				invokerUserId: pending.invokerUserId,
				success: false,
				error: errorMessage,
			};
		}

		// Step 3: 結果を Vercel に送信
		const completeRes = await fetch(
			`${DEPLOY_URL}/api/internal/newspaper/complete`,
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
				`[newspaper-worker] POST /complete failed for pending=${pending.id}: ${completeRes.status} ${completeRes.statusText}`,
			);
		} else {
			console.log(
				`[newspaper-worker] POST /complete succeeded for pending=${pending.id}`,
			);
		}
	}

	console.log(
		`=== Newspaper Worker finished at ${new Date().toISOString()} ===`,
	);
}

main().catch((err) => {
	console.error("[newspaper-worker] Fatal error:", err);
	process.exit(1);
});
