/**
 * human-mimic-worker.ts -- 人間模倣ボット候補生成 GH Actions ワーカースクリプト
 *
 * GitHub Actions human-mimic-candidate-scheduler から tsx で実行される。
 * Vercel の internal API を経由せず、GH Actions 内で Supabase + Gemini を直接使って
 * 候補生成バッチを完了させる。
 *
 * 環境変数:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_AI_API_KEY or GEMINI_API_KEYS
 *
 * See: features/human_mimic_bot.feature
 */

import { GoogleAiAdapter } from "../src/lib/infrastructure/adapters/google-ai-adapter";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_API_KEYS_RAW = process.env.GEMINI_API_KEYS;

if (!SUPABASE_URL) {
	console.error("[human-mimic-worker] SUPABASE_URL is not set");
	process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
	console.error("[human-mimic-worker] SUPABASE_SERVICE_ROLE_KEY is not set");
	process.exit(1);
}

const rawApiKeys = GEMINI_API_KEYS_RAW ?? GOOGLE_AI_API_KEY ?? "";
const apiKeys = rawApiKeys
	.split(",")
	.map((key) => key.trim())
	.filter((key) => key.length > 0);

if (apiKeys.length === 0) {
	console.error(
		"[human-mimic-worker] Neither GOOGLE_AI_API_KEY nor GEMINI_API_KEYS is set",
	);
	process.exit(1);
}

async function main(): Promise<void> {
	console.log(
		`=== Human Mimic Worker started at ${new Date().toISOString()} ===`,
	);
	console.log(`[human-mimic-worker] Loaded ${apiKeys.length} API key(s)`);

	// worker は service_role 経由しか使わないが、共有 client 初期化の都合で
	// SUPABASE_ANON_KEY が未設定だと import 時に落ちるためダミー値を補う。
	process.env.SUPABASE_ANON_KEY ??= "unused-worker-anon-placeholder";

	const [PostRepository, replyCandidateRepositoryModule, ThreadRepository, serviceModule] =
		await Promise.all([
			import("../src/lib/infrastructure/repositories/post-repository"),
			import("../src/lib/infrastructure/repositories/reply-candidate-repository"),
			import("../src/lib/infrastructure/repositories/thread-repository"),
			import("../src/lib/services/human-mimic-candidate-service"),
		]);
	const { replyCandidateRepository } = replyCandidateRepositoryModule;
	const { runHumanMimicCandidateBatch } = serviceModule;

	const result = await runHumanMimicCandidateBatch({
		threadRepository: ThreadRepository,
		postRepository: {
			findByThreadId: (threadId: string) => PostRepository.findByThreadId(threadId),
		},
		replyCandidateRepository,
		googleAiAdapter: new GoogleAiAdapter(apiKeys),
	});

	console.log("[human-mimic-worker] Batch result:", JSON.stringify(result));
	console.log(
		`=== Human Mimic Worker finished at ${new Date().toISOString()} ===`,
	);
}

main().catch((err) => {
	console.error("[human-mimic-worker] Fatal error:", err);
	process.exit(1);
});
