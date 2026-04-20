/**
 * UI層（src/app/(web)/）共有の表示用スレッド型定義。
 *
 * ドメイン層の Thread 型（src/lib/domain/models/thread.ts）は Date 型を使用するが、
 * UI 表示用には Date -> ISO string 変換済みの型が必要。
 * 3箇所（boardId/page.tsx・dev/page.tsx・ThreadList.tsx）で同一の型が重複定義
 * されていたため、ここに集約する。
 *
 * 配置方針:
 * - src/types/ は「複数レイヤで使う型」の置き場であり、この型は Web UI 層内専用のため不適
 * - src/app/(web)/_components/ に配置し、同ディレクトリ内コンポーネント・ページから参照する
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1
 */

/**
 * スレッド一覧表示用の共有型。Date -> ISO string 変換済み。
 *
 * 参照元:
 * - src/app/(web)/[boardId]/page.tsx
 * - src/app/(web)/dev/page.tsx
 * - src/app/(web)/_components/ThreadList.tsx
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1
 */
export interface ThreadSummary {
	id: string;
	title: string;
	postCount: number;
	/** ISO 8601 形式のスレッド作成日時 */
	createdAt: string;
	/** ISO 8601 形式の最終投稿日時 */
	lastPostAt: string;
	/** 板ID */
	boardId: string;
	/** 専ブラ互換キー（10桁 UNIX タイムスタンプ）。ThreadCard のリンク先生成に使用 */
	threadKey: string;
	/** トップページ用の最新レスプレビュー */
	previewPosts?: ThreadPreviewPostSummary[];
}

export interface ThreadPreviewPostSummary {
	postNumber: number;
	displayName: string;
	body: string;
	createdAt: string;
	isDeleted: boolean;
	isSystemMessage: boolean;
}

/**
 * スレッド詳細表示用の共有型。ThreadSummary + createdAt。
 *
 * 参照元:
 * - src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-187/thread_type_consolidation.md §3.1
 */
export type ThreadDetail = ThreadSummary;
