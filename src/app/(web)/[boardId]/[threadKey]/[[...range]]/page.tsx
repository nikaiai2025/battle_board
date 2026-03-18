/**
 * スレッド閲覧ページ（ページネーション対応）— /{boardId}/{threadKey}/{range?}
 *
 * - threadKey で PostService.getThreadByThreadKey() を呼び出してスレッドを取得
 * - parsePaginationRange() で URL のページネーションセグメントを解析
 * - PostService.getPostList() で範囲指定レスを取得（range / latestCount オプション対応）
 * - デフォルト表示:
 *   - postCount <= 50: 全レス表示
 *   - postCount > 50: 最新50件表示
 * - ポーリング有効判定:
 *   - デフォルト / latest: pollingEnabled=true
 *   - range 指定で末尾 < postCount: pollingEnabled=false（過去ページ）
 * - PostFormContextProvider でラップして PostItem のレス番号クリック連携を有効化
 *
 * See: features/thread.feature @url_structure
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2 @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.2 スレッドページ
 * See: tmp/workers/bdd-architect_TASK-162/design.md §7.1 スレッド閲覧（新URL）
 * See: docs/architecture/architecture.md §13 TDR-006
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { parsePaginationRange } from "@/lib/domain/rules/pagination-parser";
import * as PostService from "@/lib/services/post-service";
import PostForm from "../../../_components/PostForm";
import { PostFormContextProvider } from "../../../_components/PostFormContext";
import type { Post } from "../../../_components/PostItem";
import PostList from "../../../_components/PostList";
import PostListLiveWrapper from "../../../_components/PostListLiveWrapper";

// リクエストごとにSSRを実行し、Vercelのページキャッシュを無効化する。
// Cloudflare Workers環境でのself-fetch禁止（error code 1042）対応として
// APIルート経由ではなくサービス層を直接importする方式に変更した結果、
// Next.jsがページを静的と判断してキャッシュする問題を回避するために必要。
// See: docs/architecture/architecture.md §13 TDR-006
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Thread {
	id: string;
	threadKey: string;
	boardId: string;
	title: string;
	postCount: number;
	lastPostAt: string;
	createdAt: string;
}

interface ThreadDetailResponse {
	thread: Thread;
	posts: Post[];
}

interface ThreadPageProps {
	params: Promise<{
		boardId: string;
		threadKey: string;
		range?: string[];
	}>;
}

// ---------------------------------------------------------------------------
// データ取得
// ---------------------------------------------------------------------------

/**
 * threadKey でスレッドと指定範囲のレス一覧を取得する。
 *
 * SSR: Next.js の Server Component からサービス層を直接呼び出す。
 * Cloudflare Workers 環境では自分自身への fetch が error code 1042
 * （自己参照ループ禁止）でブロックされるため、API ルート経由ではなく
 * サービス層を直接 import して呼び出す。
 *
 * See: features/thread.feature @url_structure
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §7.1
 *
 * @param threadKey - 専ブラ互換キー（10桁 UNIX タイムスタンプ）
 * @param rangeSegment - URL のページネーションセグメント（例: "1-100", "l50"）
 * @returns スレッド情報とレス一覧、スレッドが存在しない場合は null
 */
async function fetchThreadDetail(
	threadKey: string,
	rangeSegment: string | undefined,
): Promise<ThreadDetailResponse | null> {
	try {
		// threadKey でスレッドを取得する
		// See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.4
		const thread = await PostService.getThreadByThreadKey(threadKey);

		if (!thread) {
			return null;
		}

		// ページネーション範囲を解析する
		// See: tmp/workers/bdd-architect_TASK-162/design.md §2.3
		const paginationRange = parsePaginationRange(rangeSegment);

		// PostListOptions を構築する
		// See: tmp/workers/bdd-architect_TASK-162/design.md §2.4 PostService改修
		let postListOptions: PostService.PostListOptions = {};

		if (
			paginationRange.type === "range" &&
			paginationRange.start !== undefined &&
			paginationRange.end !== undefined
		) {
			// 範囲指定: start〜end のレスを取得
			postListOptions = {
				range: { start: paginationRange.start, end: paginationRange.end },
			};
		} else if (
			paginationRange.type === "latest" &&
			paginationRange.count !== undefined
		) {
			// 最新N件: latestCount を指定
			postListOptions = { latestCount: paginationRange.count };
		} else {
			// デフォルト: postCount > 50 の場合は最新50件、それ以下は全件
			// See: tmp/workers/bdd-architect_TASK-162/design.md §2.5 デフォルト表示のロジック
			if (thread.postCount > 50) {
				postListOptions = { latestCount: 50 };
			}
			// postCount <= 50 の場合は options を空にして全件取得
		}

		// レス一覧を取得する
		const posts = await PostService.getPostList(thread.id, postListOptions);

		// PostService は Date 型で返すが、UI表示用に string へ変換する
		return {
			thread: {
				id: thread.id,
				threadKey: thread.threadKey,
				boardId: thread.boardId,
				title: thread.title,
				postCount: thread.postCount,
				lastPostAt:
					thread.lastPostAt instanceof Date
						? thread.lastPostAt.toISOString()
						: String(thread.lastPostAt),
				createdAt:
					thread.createdAt instanceof Date
						? thread.createdAt.toISOString()
						: String(thread.createdAt),
			},
			posts: posts.map((p) => ({
				id: p.id,
				threadId: p.threadId,
				postNumber: p.postNumber,
				displayName: p.displayName,
				dailyId: p.dailyId,
				body: p.body,
				// レス内マージ型システム情報（コマンド結果・書き込み報酬等）
				// See: docs/specs/screens/thread-view.yaml > post-inline-system-info
				inlineSystemInfo: p.inlineSystemInfo ?? null,
				isSystemMessage: p.isSystemMessage,
				isDeleted: p.isDeleted,
				createdAt:
					p.createdAt instanceof Date
						? p.createdAt.toISOString()
						: String(p.createdAt),
			})),
		};
	} catch (err) {
		console.error("[fetchThreadDetail] Exception:", err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// ポーリング有効判定
// ---------------------------------------------------------------------------

/**
 * ポーリング有効フラグを判定する。
 *
 * 判定ロジック:
 * - デフォルト表示（range === undefined）→ 有効
 * - latest 指定（l50, l100 等）→ 有効
 * - range 指定で末尾 >= postCount → 有効（最新ページ）
 * - range 指定で末尾 < postCount → 無効（過去ページ）
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.7 ポーリングとの共存
 *
 * @param rangeSegment - URL のページネーションセグメント
 * @param postCount - スレッドの総レス数
 * @returns ポーリングを有効にするかどうか
 */
function resolvePollingEnabled(
	rangeSegment: string | undefined,
	postCount: number,
): boolean {
	const paginationRange = parsePaginationRange(rangeSegment);

	if (paginationRange.type === "default" || paginationRange.type === "latest") {
		// デフォルト / latest: ポーリング有効
		return true;
	}

	// range 指定: 末尾が postCount 以上かどうかで判定
	// end >= postCount なら最新ページ（ポーリング有効）
	if (paginationRange.type === "range" && paginationRange.end !== undefined) {
		return paginationRange.end >= postCount;
	}

	// フォールバック: 有効
	return true;
}

// ---------------------------------------------------------------------------
// ページコンポーネント
// ---------------------------------------------------------------------------

/**
 * スレッド閲覧ページ（Server Component、ページネーション対応）
 *
 * /{boardId}/{threadKey}/{range?} でスレッドのレスを表示する。
 * PostFormContextProvider でラップし、PostItem のレス番号クリック時に
 * PostForm へのテキスト挿入連携を有効化する。
 *
 * See: features/thread.feature @url_structure
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.2 スレッドページ
 * See: docs/specs/screens/thread-view.yaml @SCR-002
 */
export default async function ThreadPage({ params }: ThreadPageProps) {
	const { boardId, threadKey, range } = await params;

	// range は Optional Catch-All のため配列または undefined
	// URL セグメント文字列として使用するのは最初の要素のみ
	const rangeSegment = range?.[0];

	// スレッド詳細を取得
	const data = await fetchThreadDetail(threadKey, rangeSegment);

	// スレッドが存在しない場合は 404
	if (!data) {
		notFound();
	}

	const { thread, posts } = data;

	// ポーリング基準点: SSRで取得したレスの最大post_number
	// PostListLiveWrapper はこれより大きい番号のレスだけを新着として表示する
	const lastPostNumber =
		posts.length > 0 ? Math.max(...posts.map((p) => p.postNumber)) : 0;

	// ポーリング有効フラグを判定する
	// See: tmp/workers/bdd-architect_TASK-162/design.md §2.7
	const pollingEnabled = resolvePollingEnabled(rangeSegment, thread.postCount);

	return (
		<main className="max-w-4xl mx-auto px-4 py-4">
			{/* thread-header: スレッドヘッダ
			    See: docs/specs/screens/thread-view.yaml > thread-header */}
			<div id="thread-header" className="border-b border-gray-400 pb-2 mb-3">
				{/* back-to-list: 一覧に戻るリンク
				    新URL構造: /{boardId}/ に統一する。
				    See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.7 */}
				<Link
					href={`/${boardId}/`}
					id="back-to-list"
					className="text-xs text-blue-600 hover:underline mb-1 inline-block"
				>
					← 一覧に戻る
				</Link>

				{/* thread-title: スレッドタイトル
				    See: docs/specs/screens/thread-view.yaml > thread-title */}
				<h1 id="thread-title" className="text-base font-bold text-gray-800">
					{thread.title}
				</h1>
				<p className="text-xs text-gray-500">レス数: {thread.postCount}</p>
			</div>

			{/* PostFormContextProvider: PostItem のレス番号クリック時に PostForm にテキスト挿入する
			    設計書 §6.2 の通り、PostForm と PostList をまとめてラップする。
			    See: tmp/workers/bdd-architect_TASK-162/design.md §6.2 スレッドページ
			    See: features/thread.feature @post_number_display */}
			<PostFormContextProvider>
				{/* post-form: 書き込みフォーム（Client Component）
				    未認証時に401レスポンスを受けると AuthModal が表示される。
				    See: docs/architecture/components/web-ui.md §4 認証フロー（UI観点） */}
				<PostForm threadId={thread.id} />

				{/* post-list: レス一覧（初期表示はSSR）
				    See: docs/specs/screens/thread-view.yaml > post-list
				    See: docs/architecture/components/web-ui.md §3.2 スレッドページ */}
				<PostList posts={posts} />

				{/* PostListLiveWrapper: ポーリングで新着レスを追加表示（Client Component）
				    SSRで表示済みのレス番号より大きいものだけを表示することで重複を防ぐ。
				    pollingEnabled: 過去ページ表示時はポーリング無効。
				    See: docs/architecture/components/web-ui.md §3.2 スレッドページ > ポーリング方式
				    See: tmp/workers/bdd-architect_TASK-162/design.md §2.7 ポーリングとの共存 */}
				<PostListLiveWrapper
					threadId={thread.id}
					initialLastPostNumber={lastPostNumber}
					pollingEnabled={pollingEnabled}
				/>
			</PostFormContextProvider>
		</main>
	);
}
