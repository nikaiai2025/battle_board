/**
 * PaginationNav — ページネーションナビゲーションコンポーネント（Server Component）
 *
 * スレッド閲覧ページのページナビゲーションリンクを生成・表示する。
 * 100件ごとのレンジリンク・「最新100」リンク・「全件」リンクを生成し、
 * postCount <= 50 の場合は非表示とする。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.6 ナビゲーションUIコンポーネント
 * See: docs/specs/screens/thread-view.yaml @SCR-002
 */

import Link from "next/link";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * PaginationNav に渡す Props。
 * See: features/thread.feature @pagination
 */
export interface PaginationNavProps {
	boardId: string;
	threadKey: string;
	postCount: number;
}

/**
 * ページネーションリンクの1エントリ。
 * 単体テスト用にエクスポートする。
 */
export interface PaginationLink {
	/** リンクのラベルテキスト */
	label: string;
	/** リンク先URL */
	href: string;
	/** リンクの種別（レンジ / 最新N件 / 全件） */
	type: "range" | "latest" | "all";
}

// ---------------------------------------------------------------------------
// リンク生成ロジック（純粋関数）
// ---------------------------------------------------------------------------

/**
 * ページネーションを表示すべきかどうかを判定する。
 *
 * postCount <= 50 の場合は非表示（5chでは全件表示で十分な件数）。
 *
 * See: features/thread.feature @pagination
 * シナリオ: 100件以下のスレッドではページナビゲーションが表示されない
 * タスク指示書: postCount <= 50 の場合: 何も表示しない
 *
 * @param postCount - スレッドの総レス数
 * @returns ページネーションを表示する場合 true
 */
export function shouldShowPagination(postCount: number): boolean {
	return postCount > 50;
}

/**
 * ページネーションリンクの配列を生成する。
 *
 * 生成ルール:
 * - 100件ごとのレンジリンク: 1-100, 101-200, ..., {start}-{postCount}
 * - 「最新100」リンク: l100
 * - 「全件」リンク: 1-{postCount}
 *
 * See: features/thread.feature @pagination
 * シナリオ: "1-100" "101-200" "201-250" "最新100" のナビゲーションリンクが表示される
 *
 * @param boardId - 板ID
 * @param threadKey - スレッドキー
 * @param postCount - スレッドの総レス数
 * @returns ページネーションリンクの配列
 */
export function generatePaginationLinks(
	boardId: string,
	threadKey: string,
	postCount: number,
): PaginationLink[] {
	const links: PaginationLink[] = [];
	const baseUrl = `/${boardId}/${threadKey}`;

	// 100件ごとのレンジリンクを生成する
	// 最後のレンジは {start}-{postCount} で終わる
	for (let start = 1; start <= postCount; start += 100) {
		const end = Math.min(start + 99, postCount);
		links.push({
			label: `${start}-${end}`,
			href: `${baseUrl}/${start}-${end}`,
			type: "range",
		});
	}

	// 「最新100」リンク
	// See: features/thread.feature @pagination - "最新100" のナビゲーションリンクが表示される
	links.push({
		label: "最新100",
		href: `${baseUrl}/l100`,
		type: "latest",
	});

	// 「全件」リンク: 1-{postCount}
	links.push({
		label: "全件",
		href: `${baseUrl}/1-${postCount}`,
		type: "all",
	});

	return links;
}

// ---------------------------------------------------------------------------
// コンポーネント本体
// ---------------------------------------------------------------------------

/**
 * ページネーションナビゲーションコンポーネント（Server Component）。
 *
 * postCount <= 50 の場合は null を返す（何も表示しない）。
 * postCount > 50 の場合は100件ごとのレンジリンク・「最新100」・「全件」を
 * 横並びリンクとして表示する。
 *
 * See: features/thread.feature @pagination
 * See: tmp/workers/bdd-architect_TASK-162/design.md §2.6
 * See: tmp/workers/bdd-architect_TASK-162/design.md §6.2 スレッドページ
 *
 * @param boardId - 板ID
 * @param threadKey - スレッドキー
 * @param postCount - スレッドの総レス数
 */
export default function PaginationNav({
	boardId,
	threadKey,
	postCount,
}: PaginationNavProps) {
	// postCount <= 50 の場合はナビゲーションを表示しない
	// See: features/thread.feature @pagination
	// シナリオ: 100件以下のスレッドではページナビゲーションが表示されない
	if (!shouldShowPagination(postCount)) {
		return null;
	}

	const links = generatePaginationLinks(boardId, threadKey, postCount);

	return (
		// pagination-nav: ページネーションナビゲーション
		// id属性はページ内に同じコンポーネントが上下2箇所に配置されるため、
		// HTML仕様違反（id重複）を避けて data-testid に変更。
		// See: features/thread.feature @pagination
		<nav
			data-testid="pagination-nav"
			aria-label="ページナビゲーション"
			className="flex flex-wrap gap-1 py-1 text-xs"
		>
			{links.map((link) => (
				<Link
					key={link.href}
					href={link.href}
					className="text-blue-600 hover:underline px-1 border border-gray-300 bg-gray-50 hover:bg-gray-100"
				>
					{link.label}
				</Link>
			))}
		</nav>
	);
}
