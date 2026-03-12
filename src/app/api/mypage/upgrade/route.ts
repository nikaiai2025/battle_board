/**
 * POST /api/mypage/upgrade — 課金（有料ステータス切替）モック
 *
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 * See: features/phase1/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
 * See: docs/specs/openapi.yaml > /api/mypage/upgrade
 *
 * 責務:
 *   - Cookie から edge-token を読み取り認証確認
 *   - MypageService.upgradeToPremium への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - MVP フェーズでは実決済なし。isPremium フラグの切替のみ行う
 *   - 既に有料ユーザーの場合は 409 Conflict を返す
 *   - 未認証時は 401 を返す
 */

import { NextRequest, NextResponse } from 'next/server'
import * as MypageService from '@/lib/services/mypage-service'
import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'

/**
 * POST /api/mypage/upgrade — 課金（モック）
 *
 * See: features/phase1/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
 *
 * リクエスト:
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   200: { isPremium: true }（アップグレード成功）
 *   401: ErrorResponse（未認証）
 *   409: ErrorResponse（既に有料ユーザー）
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
  const result = await MypageService.upgradeToPremium(user.id)

  if (!result.success) {
    // 既に有料ユーザー: 409 Conflict
    if (result.code === 'ALREADY_PREMIUM') {
      return NextResponse.json(
        { error: result.code, message: result.error },
        { status: 409 }
      )
    }
    // ユーザー不存在: 404
    return NextResponse.json(
      { error: result.code, message: result.error },
      { status: 404 }
    )
  }

  return NextResponse.json({ isPremium: true }, { status: 200 })
}
