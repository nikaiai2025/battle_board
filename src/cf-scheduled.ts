/**
 * Cloudflare Workers カスタムエントリポイント
 *
 * @opennextjs/cloudflare のビルド出力（.open-next/worker.js）は fetch ハンドラのみをエクスポートする。
 * このファイルはそれをラップし、scheduled ハンドラを追加するカスタムエントリポイントとなる。
 *
 * - fetch ハンドラ: OpenNext のメインハンドラ（.open-next/worker.js）に委譲
 * - scheduled ハンドラ: WORKER_SELF_REFERENCE バインディングで /api/internal/bot/execute を呼び出す
 *
 * デプロイ前に wrangler secret put BOT_API_KEY で秘密鍵を設定すること。
 *
 * See: docs/architecture/architecture.md §12.2, TDR-013
 * See: tmp/migration_cf_cron.md §5 SRV-1
 */

// Cloudflare Workers ランタイムの型定義
// @cloudflare/workers-types は devDependency として含まれないため、
// Workers ランタイム固有の型を最小限ローカル定義する

/** Cloudflare Workers の Service Binding (Fetcher) インターフェース */
interface Fetcher {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** このワーカーが使用する環境変数・バインディングの型 */
interface Env {
	/** OpenNext キャッシュ + scheduled self-fetch 用の自己参照サービスバインディング */
	WORKER_SELF_REFERENCE: Fetcher;
	/** /api/internal/bot/execute の Bearer 認証トークン */
	BOT_API_KEY: string;
	/** 静的アセットバインディング */
	ASSETS: Fetcher;
}

/** Cloudflare Workers Scheduled イベント */
interface ScheduledEvent {
	/** スケジュール cron 式 */
	cron: string;
	/** イベント発生時刻（Unix timestamp ms） */
	scheduledTime: number;
}

/** Cloudflare Workers Execution Context */
interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
}

export default {
	/**
	 * HTTP リクエストハンドラ
	 *
	 * @opennextjs/cloudflare のビルド出力（.open-next/worker.js）に委譲する。
	 * 動的 import により、wrangler バンドル時に .open-next/worker.js が解決される。
	 * See: features/welcome.feature (全シナリオ)
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// OpenNext のメインハンドラに委譲（動的 import）
		// .open-next/worker.js はビルド成果物のため型宣言が存在しない。
		// wrangler バンドル時に解決されるため、関数型の動的 import で対応する。
		const importFn = new Function("m", "return import(m)") as (
			m: string,
		) => Promise<{
			default: {
				fetch: (
					req: Request,
					env: Env,
					ctx: ExecutionContext,
				) => Promise<Response>;
			};
		}>;
		const { default: handler } = await importFn("./.open-next/worker.js");
		return handler.fetch(request, env, ctx);
	},

	/**
	 * Cron Trigger ハンドラ（5分間隔）
	 *
	 * WORKER_SELF_REFERENCE バインディングを使用して同一ワーカー内の
	 * /api/internal/bot/execute エンドポイントを呼び出す。
	 * self-fetch 方式により既存の route.ts（認証・エラーハンドリング）をそのまま活用する。
	 *
	 * See: docs/architecture/architecture.md §12.2 bot-scheduler-fast
	 * See: TDR-013
	 */
	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		// WORKER_SELF_REFERENCE.fetch() のホスト名は同一 Worker 内通信のため無視される
		const response = await env.WORKER_SELF_REFERENCE.fetch(
			"https://dummy-host/api/internal/bot/execute",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${env.BOT_API_KEY}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (!response.ok) {
			console.error(`[scheduled] bot/execute failed: ${response.status}`);
		} else {
			const body = await response.json();
			console.log(`[scheduled] bot/execute result:`, JSON.stringify(body));
		}
	},
};
