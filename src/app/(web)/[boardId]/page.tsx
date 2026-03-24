/**
 * 板トップページ — スレッド一覧（Server Component）
 *
 * /{boardId}/ にアクセスしたときにスレッド一覧を表示する。
 * 現行の / (page.tsx) のスレッド一覧ロジックをベースに、
 * boardId パラメータを受け取る形で新設する。
 *
 * - PostService.getThreadList() でスレッド一覧を直接取得（SSR）
 * - ThreadCard のリンク先を /{boardId}/{threadKey}/ 形式に変更
 * - boardId パラメータを受け取る（将来的な板拡張に対応）
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.2 Next.js ディレクトリ構成
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.1 スレッド一覧ページ
 * See: docs/architecture/architecture.md §13 TDR-006
 */

import * as PostService from "@/lib/services/post-service";
import ThreadCreateForm from "../_components/ThreadCreateForm";
import ThreadList from "../_components/ThreadList";
import type { ThreadSummary } from "../_components/thread-types";

// リクエストごとにSSRを実行し、Vercelのページキャッシュを無効化する。
// Cloudflare Workers環境でのself-fetch禁止（error code 1042）対応として
// APIルート経由ではなくサービス層を直接importする方式に変更した結果、
// Next.jsがページを静的と判断してキャッシュする問題を回避するために必要。
// See: docs/architecture/architecture.md §13 TDR-006
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

// ThreadView は ThreadSummary に統合。
// See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1

interface BoardPageProps {
	params: Promise<{ boardId: string }>;
}

// ---------------------------------------------------------------------------
// データ取得
// ---------------------------------------------------------------------------

/**
 * 指定板のスレッド一覧をサービス層から直接取得する。
 *
 * SSR: Next.js の Server Component からサービス層を直接呼び出す。
 * Cloudflare Workers 環境では自分自身への fetch が error code 1042
 * （自己参照ループ禁止）でブロックされるため、API ルート経由ではなく
 * サービス層を直接 import して呼び出す。
 *
 * See: features/thread.feature @url_structure
 * See: docs/specs/openapi.yaml > /api/threads > get
 *
 * @param boardId - 板ID（例: 'livebot'）
 * @returns ThreadView 配列
 */
async function fetchThreads(boardId: string): Promise<ThreadSummary[]> {
	try {
		const threads = await PostService.getThreadList(boardId);
		// PostService は Date 型で返すが、UI表示用に string へ変換する
		// （APIルート経由の場合は JSON シリアライズで自動変換されていた）
		return threads.map((t) => ({
			id: t.id,
			title: t.title,
			postCount: t.postCount,
			lastPostAt:
				t.lastPostAt instanceof Date
					? t.lastPostAt.toISOString()
					: String(t.lastPostAt),
			threadKey: t.threadKey,
			boardId: t.boardId,
		}));
	} catch (err) {
		console.error("[fetchThreads] Exception:", err);
		return [];
	}
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * 板トップページ（Server Component）
 *
 * /{boardId}/ でスレッド一覧を表示する。
 * ThreadList / ThreadCard に boardId と threadKey を渡し、
 * リンク先を /{boardId}/{threadKey}/ 形式で生成する。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.1 スレッド一覧ページ
 * See: docs/specs/screens/thread-list.yaml @SCR-001
 */
export default async function BoardPage({ params }: BoardPageProps) {
	const { boardId } = await params;
	const threads = await fetchThreads(boardId);

	return (
		<main className="max-w-4xl mx-auto px-4 py-4">
			{/* ページタイトル */}
			<h1 className="text-base font-bold text-foreground border-b border-border pb-1 mb-3">
				ボットちゃんねる — スレッド一覧
			</h1>

			{/* thread-create-form: スレッド作成フォーム（Client Component）
			    送信時に 401 を受け取った場合は AuthModal が自動表示される。
			    See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
			*/}
			<ThreadCreateForm />

			{/* auth-prompt: 未認証ユーザーへの認証案内
			    フォームは送信時に認証を要求する設計のため、
			    認証状態に関わらず案内テキストを表示する。
			    See: docs/specs/screens/thread-list.yaml > auth-prompt
			*/}
			<p id="auth-prompt" className="text-xs text-muted-foreground mb-3">
				書き込みするには認証が必要です（送信時に認証画面が表示されます）
			</p>

			{/* thread-list: スレッド一覧
			    ThreadList → ThreadCard に boardId/threadKey を伝播し、
			    リンク先を /{boardId}/{threadKey}/ 形式で生成する。
			    See: features/thread.feature @url_structure
			    See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.6
			*/}
			<ThreadList threads={threads} />
		</main>
	);
}
