/**
 * GET /test/read.cgi/{boardId}/{key}/ — スレッド閲覧リダイレクト
 *
 * 5ch専用ブラウザがスレッドURLとして構築する /test/read.cgi/{boardId}/{key}/ に
 * 対応するルートハンドラ。Web UIのスレッド表示ページへ302リダイレクトする。
 *
 * 専ブラのスレッドリンクコピーや通常ブラウザでのリンク開封時に
 * Web UI でスレッドを表示できるようにする。
 *
 * リダイレクト先: /{boardId}/{key}/ （Web UI スレッド表示ページの新URL形式）。
 * boardId はURLパラメータから取得できるため、DBへの追加クエリは不要。
 * スレッドが存在しない場合は404を返す（threadKey の存在確認は ThreadRepository で行う）。
 *
 * See: features/specialist_browser_compat.feature @read.cgiのURLでスレッドが閲覧できる
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.5 専ブラread.cgiリダイレクト先の変更
 * See: docs/architecture/components/senbra-adapter.md
 */

import type { NextRequest } from "next/server";
import * as ThreadRepository from "@/lib/infrastructure/repositories/thread-repository";

/**
 * GET /test/read.cgi/{boardId}/{key}/ — Web UIスレッド表示ページへ302リダイレクト
 *
 * threadKey で Thread を検索し、存在すれば /{boardId}/{key}/ へリダイレクトする。
 * boardId は URL パラメータから直接取得するため DB の追加クエリは不要。
 * スレッドが存在しない場合は404を返す。
 *
 * See: features/specialist_browser_compat.feature @read.cgiのURLでスレッドが閲覧できる
 * See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.5
 *
 * @param req - リクエスト
 * @param params - ルートパラメータ（boardId, key）
 * @returns 302リダイレクトまたは404レスポンス
 */
export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ boardId: string; key: string }> },
): Promise<Response> {
	// boardId と key の両方を取得する
	// boardId: リダイレクト先URLの生成に使用（DBクエリ不要）
	// key: threadKey としてスレッドの存在確認に使用
	const { boardId, key } = await params;

	// threadKey でスレッドの存在を確認する
	const thread = await ThreadRepository.findByThreadKey(key);
	if (!thread) {
		return new Response("Not Found", { status: 404 });
	}

	// 新URL形式 /{boardId}/{key}/ へ302リダイレクトする
	// boardId は URL パラメータから取得するため thread.boardId は使用しない
	// See: tmp/workers/bdd-architect_TASK-162/design.md §1.3.5
	const redirectUrl = `/${boardId}/${key}/`;
	return Response.redirect(new URL(redirectUrl, req.url), 302);
}
