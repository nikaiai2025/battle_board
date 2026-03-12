/**
 * GET /api/mypage — マイページ基本情報取得
 *
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 * See: features/phase1/currency.feature @マイページで通貨残高を確認する
 * See: docs/specs/openapi.yaml > /api/mypage
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - MypageService.getMypage への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - 未認証時は 401 を返す（マイページは認証必須）
 *   - ビジネスロジックを含まず、MypageService への委譲のみ行う
 */

import { NextRequest, NextResponse } from 'next/server'
import * as MypageService from '@/lib/services/mypage-service'
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'

/**
 * GET /api/mypage — マイページ基本情報取得
 *
 * See: features/phase1/mypage.feature @マイページに基本情報が表示される
 *
 * レスポンス:
 *   200: MypageInfo（基本情報）
 *   401: ErrorResponse（未認証）
 *   404: ErrorResponse（ユーザー不存在）
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Cookie から edge-token を読み取る ---
  const edgeToken = req.cookies.get('edge-token')?.value ?? null

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

  // --- MypageService への委譲 ---
  const mypageInfo = await MypageService.getMypage(user.id)

  if (!mypageInfo) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'ユーザーが見つかりません' },
      { status: 404 }
    )
  }

  return NextResponse.json(mypageInfo, { status: 200 })
}
