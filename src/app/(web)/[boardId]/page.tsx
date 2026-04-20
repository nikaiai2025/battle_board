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
import VisionSection from "../_components/VisionSection";

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
		const threads = await PostService.getThreadListWithPreview(boardId, 5);
		// PostService は Date 型で返すが、UI表示用に string へ変換する
		// （APIルート経由の場合は JSON シリアライズで自動変換されていた）
		return threads.map((t) => ({
			id: t.id,
			title: t.title,
			postCount: t.postCount,
			createdAt:
				t.createdAt instanceof Date
					? t.createdAt.toISOString()
					: String(t.createdAt),
			lastPostAt:
				t.lastPostAt instanceof Date
					? t.lastPostAt.toISOString()
					: String(t.lastPostAt),
			threadKey: t.threadKey,
			boardId: t.boardId,
			previewPosts: t.previewPosts.map((p) => ({
				postNumber: p.postNumber,
				displayName: p.displayName,
				body: p.body,
				createdAt:
					p.createdAt instanceof Date
						? p.createdAt.toISOString()
						: String(p.createdAt),
				isDeleted: p.isDeleted,
				isSystemMessage: p.isSystemMessage,
			})),
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
		<main className="max-w-4xl mx-auto px-4 py-4" data-page="board">
			<section className="mb-3 rounded border border-border bg-muted/45 px-4 py-3">
				<h1 className="mb-2 text-sm font-bold text-foreground border-b border-border pb-1">
					このサイトは何？
				</h1>
				<p className="whitespace-pre-line text-sm leading-6 text-foreground/85">
					人間とBOTが入り混じる対戦型掲示板です。
					{"\n"}
					コマンドやAI機能で遊ぶこともできます。
					{"\n"}
					掲示板文化の保全と拡張を目指しています。
				</p>
				<p
					id="auth-prompt"
					className="mt-3 rounded border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
				>
					アカウント登録なしで書き込めます（初回のみ簡単な認証）。メールアドレスDiscordで本登録すると、Cookie喪失時でも同一ユーザーとして復帰できます。
				</p>
			</section>

			{/* ビジョン（折りたたみ） */}
			<VisionSection />

			{/* thread-list: スレッド一覧
			    ThreadList → ThreadCard に boardId/threadKey を伝播し、
			    リンク先を /{boardId}/{threadKey}/ 形式で生成する。
			    See: features/thread.feature @url_structure
			    See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.6
			*/}
			<ThreadList threads={threads} />

			{/* thread-create-form: スレッド作成フォーム（Client Component）
			    送信時に 401 を受け取った場合は AuthModal が自動表示される。
			    See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点）
			*/}
			<div className="mt-4">
				<ThreadCreateForm />
			</div>
		</main>
	);
}
