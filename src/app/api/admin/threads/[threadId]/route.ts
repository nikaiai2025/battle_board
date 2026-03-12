/**
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/phase1/admin.feature @管理者が指定したスレッドを削除する
 * See: features/phase1/admin.feature @管理者でないユーザーがレス削除を試みると権限エラーになる
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 * See: docs/architecture/components/admin.md §2 公開インターフェース
 * See: docs/architecture/components/admin.md §5 設計上の判断 > 認証と認可の分離
 *
 * 責務:
 *   - admin_session Cookie の検証（AuthService.verifyAdminSession 経由）
 *   - AdminService.deleteThread への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、AdminService への委譲のみ行う
 *   - 管理者セッション未検証の場合は 403 を返す
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSession } from '@/lib/services/auth-service'
import { deleteThread } from '@/lib/services/admin-service'
import { ADMIN_SESSION_COOKIE } from '@/lib/constants/cookie-names'

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * DELETE /api/admin/threads/{threadId} — スレッド削除（管理者）
 *
 * See: features/phase1/admin.feature @管理者が指定したスレッドを削除する
 * See: docs/specs/openapi.yaml > /api/admin/threads/{threadId}
 *
 * リクエスト:
 *   Cookie: admin_session（管理者セッション）
 *   Path: threadId（削除対象スレッドの UUID）
 *
 * レスポンス:
 *   200: 削除成功（スレッドと全レスが削除）
 *   403: 管理者権限なし（admin_session が無効）
 *   404: スレッドが存在しない
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
): Promise<NextResponse> {
  const { threadId } = await params

  // --- admin_session Cookie の検証 ---
  // See: docs/architecture/components/admin.md §5 > 認証と認可の分離
  // See: src/lib/constants/cookie-names.ts
  const sessionToken = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null

  if (!sessionToken) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: '管理者権限が必要です' },
      { status: 403 }
    )
  }

  const adminSession = await verifyAdminSession(sessionToken)

  if (!adminSession) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: '管理者権限が必要です' },
      { status: 403 }
    )
  }

  // --- AdminService へ委譲 ---
  const result = await deleteThread(threadId, adminSession.userId)

  // --- レスポンス整形 ---
  if (!result.success) {
    if (result.reason === 'not_found') {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: '指定されたスレッドが見つかりません' },
        { status: 404 }
      )
    }
  }

  return NextResponse.json({ message: '削除しました' }, { status: 200 })
}
