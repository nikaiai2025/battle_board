/**
 * POST /api/admin/login — 管理者ログイン
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: features/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
 * See: docs/specs/openapi.yaml > /api/admin/login
 * See: docs/architecture/components/authentication.md §2.3 管理者認証
 * See: docs/architecture/components/admin.md §5 設計上の判断 > 認証と認可の分離
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - AdminUserRepository を通じた Supabase Auth 認証
 *   - 認証成功時: admin_session Cookie を設定して 200 を返す
 *   - 認証失敗時: 401 エラーを返す
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、AdminUserRepository への委譲のみ行う
 *   - admin_session Cookie は HttpOnly, Secure, SameSite=Strict に設定する
 *   - Cookie 名は "admin_session" で edge-token と完全に分離する
 */

import { NextRequest, NextResponse } from 'next/server'
import * as AdminUserRepository from '@/lib/infrastructure/repositories/admin-user-repository'
import { ADMIN_SESSION_COOKIE } from '@/lib/constants/cookie-names'

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/login — 管理者ログイン
 *
 * See: features/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
 * See: docs/specs/openapi.yaml > /api/admin/login
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { email: string, password: string }
 *
 * レスポンス:
 *   200: ログイン成功（admin_session Cookie を設定）
 *   400: バリデーションエラー
 *   401: 認証失敗
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- リクエストボディのパース ---
  let body: { email?: unknown; password?: unknown }
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown }
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' },
      { status: 400 }
    )
  }

  const { email, password } = body

  // --- バリデーション ---
  if (!email || typeof email !== 'string' || email.trim() === '') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'メールアドレスを入力してください' },
      { status: 400 }
    )
  }

  if (!password || typeof password !== 'string' || password === '') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'パスワードを入力してください' },
      { status: 400 }
    )
  }

  // --- 管理者認証 ---
  const result = await AdminUserRepository.loginWithPassword(email.trim(), password)

  if (!result.success) {
    // 認証失敗または管理者ロールなし
    return NextResponse.json(
      {
        error: 'UNAUTHORIZED',
        message: 'メールアドレスまたはパスワードが正しくありません',
      },
      { status: 401 }
    )
  }

  // --- 認証成功: admin_session Cookie を設定する ---
  // See: docs/architecture/components/authentication.md §2 Cookie命名
  // See: src/lib/constants/cookie-names.ts
  const response = NextResponse.json({ message: 'ログインしました' }, { status: 200 })

  response.cookies.set(ADMIN_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    // セッション Cookie（ブラウザ終了で失効）
    path: '/',
  })

  return response
}
