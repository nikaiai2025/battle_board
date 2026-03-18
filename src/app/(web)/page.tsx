/**
 * トップページ — `/` → `/battleboard/` リダイレクト（Server Component）
 *
 * ルートURL `/` へのアクセスを板トップ `/battleboard/` にリダイレクトする。
 * スレッド一覧の表示は `/battleboard/page.tsx`（`[boardId]/page.tsx`）が担当する。
 *
 * 設計判断: middleware.ts や next.config.ts の redirects ではなく、
 * page.tsx 内の redirect() を使用する（既存プロジェクトのパターンと一貫性を保つため）。
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.1
 *
 * See: features/thread.feature @url_structure
 */

import { redirect } from "next/navigation";

/**
 * トップページ（リダイレクト専用）。
 *
 * `/` へのアクセスを `/battleboard/` に 307 リダイレクトする。
 * Next.js の redirect() はレンダリング前に例外で中断するため、
 * 実質的なオーバーヘッドはない。
 *
 * See: features/thread.feature @url_structure
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.1
 */
export default function RootPage() {
	redirect("/battleboard/");
}
