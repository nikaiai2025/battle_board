/**
 * POST /api/threads/{threadId}/posts — 書き込み（レス投稿）
 *
 * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
 * See: features/phase1/posting.feature @有料ユーザーがユーザーネーム付きで書き込みを行う
 * See: features/phase1/posting.feature @本文が空の場合は書き込みが行われない
 * See: docs/specs/openapi.yaml > /api/threads/{threadId}/posts
 * See: docs/architecture/components/posting.md §2.1 PostInput / §2.2 PostResult
 *
 * 責務:
 *   - リクエストの受付・バリデーション
 *   - Cookie から edge-token を読み取る
 *   - IP 抽出 → AuthService.hashIp(AuthService.reduceIp(ip))
 *   - PostService.createPost への委譲
 *   - レスポンス整形
 *
 * 設計上の判断:
 *   - ビジネスロジックを含まず、PostService への委譲のみ行う
 *   - 未認証時は 401 + AuthCodeIssuedResponse + Set-Cookie
 *   - スレッド不存在時は PostService からのエラーを 404 として返す
 */

import { NextRequest, NextResponse } from 'next/server'
import * as PostService from '@/lib/services/post-service'
import { hashIp, reduceIp } from '@/lib/services/auth-service'
import { EDGE_TOKEN_COOKIE } from '@/lib/constants/cookie-names'

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * リクエストからクライアント IP を取得し、ハッシュ化して返す。
 * x-forwarded-for → x-real-ip → '127.0.0.1' のフォールバックチェーン。
 *
 * @param req - Next.js リクエストオブジェクト
 * @returns クライアント IP の SHA-512 ハッシュ
 */
function getIpHash(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  // x-forwarded-for は "client, proxy1, proxy2" の形式のため先頭を使用する
  const ip =
    forwarded?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  return hashIp(reduceIp(ip))
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/threads/{threadId}/posts — レス投稿
 *
 * See: features/phase1/posting.feature @無料ユーザーが書き込みを行う
 * See: docs/specs/openapi.yaml > /api/threads/{threadId}/posts > post
 *
 * リクエスト:
 *   Content-Type: application/json
 *   Body: { body: string }
 *   Cookie: edge-token（認証済みトークン）
 *
 * レスポンス:
 *   201: { post: Post }（書き込み成功）
 *   400: ErrorResponse（バリデーションエラー）
 *   401: AuthCodeIssuedResponse + Set-Cookie（未認証）
 *   404: ErrorResponse（スレッド不存在）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
): Promise<NextResponse> {
  const { threadId } = await params

  // --- リクエストボディのパース ---
  let body: { body?: unknown }
  try {
    body = (await req.json()) as { body?: unknown }
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' },
      { status: 400 }
    )
  }

  const { body: postBody } = body

  // --- バリデーション ---
  if (!postBody || typeof postBody !== 'string' || postBody.trim() === '') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '本文を入力してください' },
      { status: 400 }
    )
  }

  // --- Cookie から edge-token を読み取る ---
  // See: src/lib/constants/cookie-names.ts
  const edgeToken = req.cookies.get(EDGE_TOKEN_COOKIE)?.value ?? null

  // --- IP ハッシュの取得 ---
  const ipHash = getIpHash(req)

  // --- PostService への委譲 ---
  const result = await PostService.createPost({
    threadId,
    body: postBody.trim(),
    edgeToken,
    ipHash,
    isBotWrite: false,
  })

  // --- レスポンス整形 ---

  // 未認証の場合: 401 + AuthCodeIssuedResponse + Set-Cookie
  if ('authRequired' in result) {
    const response = NextResponse.json(
      {
        message: '認証コードを入力してください',
        authCodeUrl: '/auth/auth-code',
      },
      { status: 401 }
    )
    // edge-token Cookie を設定（HttpOnly, Secure, SameSite=Lax）
    // See: docs/specs/openapi.yaml > /api/threads/{threadId}/posts > post > 401 > Set-Cookie
    // See: src/lib/constants/cookie-names.ts
    response.cookies.set(EDGE_TOKEN_COOKIE, result.edgeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  }

  // 失敗の場合: エラーコードに応じてステータスを判定
  if (!result.success) {
    // スレッド不存在エラー
    if (result.code === 'THREAD_NOT_FOUND') {
      return NextResponse.json(
        { error: result.code, message: result.error ?? 'スレッドが見つかりません' },
        { status: 404 }
      )
    }
    // その他のバリデーションエラー
    return NextResponse.json(
      { error: result.code ?? 'VALIDATION_ERROR', message: result.error ?? 'エラーが発生しました' },
      { status: 400 }
    )
  }

  // 成功: 201 + { post: Post }
  // PostService.createPost は postId と postNumber のみ返すため、
  // 作成された Post を getPostList 経由で取得してレスポンスを組み立てる。
  // postNumber で絞り込むことで、直前に作成された Post を取得する。
  // See: docs/architecture/components/posting.md §2.2 PostResult
  const posts = await PostService.getPostList(threadId, result.postNumber)
  const createdPost = posts.find((p) => p.id === result.postId)

  return NextResponse.json(
    {
      post: createdPost ?? {
        id: result.postId,
        threadId,
        postNumber: result.postNumber,
      },
    },
    { status: 201 }
  )
}
