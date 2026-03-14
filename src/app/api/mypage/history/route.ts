/**
 * GET /api/mypage/history — 書き込み履歴取得
 *
 * See: features/phase1/mypage.feature @自分の書き込み履歴を確認できる
 * See: features/phase1/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
 * See: docs/specs/openapi.yaml > /api/mypage/history
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - MypageService.getPostHistory への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す
 *   - 0件の場合は空配列を返す（UI側で「まだ書き込みがありません」を表示する）
 *   - limit クエリパラメータで件数を制御可能（デフォルト 50）
 */

import { NextRequest, NextResponse } from 'next/server'
import * as MypageService from '@/lib/services/mypage-service'
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'
import { EDGE_TOKEN_COOKIE } from '@/lib/constants/cookie-names'

/**
 * GET /api/mypage/history — 書き込み履歴取得
 *
 * See: features/phase1/mypage.feature @自分の書き込み履歴を確認できる
 *
 * クエリパラメータ:
 *   limit: 取得件数（デフォルト 50、最大 100）
 *
 * レスポンス:
 *   200: { posts: PostHistoryItem[] }（0件の場合は空配列）
 *   401: ErrorResponse（未認証）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
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
  // See: features/phase1/mypage.feature（前提:「ログイン済みユーザー」= is_verified=true）
  // See: features/phase1/authentication.feature @認証フロー是正
  if (!user.isVerified) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: '認証が必要です' },
      { status: 401 }
    )
  }

  // --- limit クエリパラメータの取得（デフォルト 50、最大 100）---
  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50

  // --- MypageService への委譲 ---
  const posts = await MypageService.getPostHistory(user.id, { limit })

  return NextResponse.json({ posts }, { status: 200 })
}
