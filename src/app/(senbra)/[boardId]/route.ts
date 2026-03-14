/**
 * GET /{boardId}/ — 板トップURLリダイレクト
 *
 * bbsmenu.html/json で板URLとして /{boardId}/ を返しているため、
 * 通常ブラウザでリンクを開いた場合に404にならないよう、
 * Web UIのスレッド一覧ページ（/）へ302リダイレクトする。
 *
 * Next.js App Router の動的ルート解決順序上、
 * /{boardId}/subject.txt, /{boardId}/dat/, /{boardId}/SETTING.TXT 等の
 * 静的ルートが優先され、この動的ルートは板IDのみのパスにのみマッチする。
 *
 * See: features/constraints/specialist_browser_compat.feature @板トップURLがアクセス可能である
 * See: docs/architecture/components/senbra-adapter.md
 */

import { NextRequest } from 'next/server'

/**
 * GET /{boardId}/ — Web UIスレッド一覧ページへ302リダイレクト
 *
 * Web UIのスレッド一覧ページ（/）へリダイレクトする。
 * 板IDはスラッシュなしでもアクセス可能にするため、
 * このルートは /{boardId} にマッチする。
 *
 * See: features/constraints/specialist_browser_compat.feature @板トップURLがアクセス可能である
 *
 * @param req - リクエスト
 * @param params - ルートパラメータ（boardId）
 * @returns 302リダイレクト（Web UIスレッド一覧ページへ）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
): Promise<Response> {
  // boardId は将来的な複数板対応のために引数として受け取るが、
  // 現状は単一板（battleboard）のみのためすべて / へリダイレクトする
  return Response.redirect(new URL('/', req.url), 302)
}
