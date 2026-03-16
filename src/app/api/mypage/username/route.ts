/**
 * PUT /api/mypage/username — ユーザーネーム設定
 *
 * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 * See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
 * See: docs/specs/openapi.yaml > /api/mypage/username
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - リクエストボディのバリデーション
 *   - MypageService.setUsername への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す
 *   - 無料ユーザーが設定を試みた場合は 403 を返す
 */

import { NextRequest, NextResponse } from 'next/server'
import * as MypageService from '@/lib/services/mypage-service'
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'
import { EDGE_TOKEN_COOKIE } from '@/lib/constants/cookie-names'

/**
 * PUT /api/mypage/username — ユーザーネーム設定
 *
 * See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { username: string }
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   200: { username: string }（設定成功）
 *   400: ErrorResponse（バリデーションエラー）
 *   401: ErrorResponse（未認証）
 *   403: ErrorResponse（無料ユーザーは利用不可）
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  // --- Cookie から edge-token を読み取る ---
  // See: src/lib/constants/cookie-names.ts
  const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null

  if (!edgeToken) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: '認証が必要です' },
      { status: 401 }
    )
  }

  // --- edge-token でユーザーを特定する ---
  const user = await UserRepository.findByAuthToken(edgeToken)
  if (!user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: '認証が必要です' },
      { status: 401 }
    )
  }

  // --- 認証フロー完了チェック（is_verified） ---
  // See: features/mypage.feature（前提:「ログイン済みユーザー」= is_verified=true）
  // See: features/authentication.feature @認証フロー是正
  if (!user.isVerified) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: '認証が必要です' },
      { status: 401 }
    )
  }

  // --- リクエストボディのパース ---
  let body: { username?: unknown }
  try {
    body = (await req.json()) as { username?: unknown }
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' },
      { status: 400 }
    )
  }

  const { username } = body

  // --- バリデーション ---
  if (!username || typeof username !== 'string') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'ユーザーネームを入力してください' },
      { status: 400 }
    )
  }

  // --- MypageService への委譲 ---
  const result = await MypageService.setUsername(user.id, username)

  if (!result.success) {
    // 無料ユーザーが試みた場合: 403
    if (result.code === 'NOT_PREMIUM') {
      return NextResponse.json(
        { error: result.code, message: result.error },
        { status: 403 }
      )
    }
    // ユーザー不存在: 404
    if (result.code === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: result.code, message: result.error },
        { status: 404 }
      )
    }
    // バリデーションエラー: 400
    return NextResponse.json(
      { error: result.code, message: result.error },
      { status: 400 }
    )
  }

  return NextResponse.json({ username: result.username }, { status: 200 })
}
