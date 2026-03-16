/**
 * 単体テスト: POST /api/auth/auth-code Route Handler
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: features/authentication.feature @期限切れ認証コードでは認証できない
 *
 * テスト方針:
 *   - AuthService はモック化する
 *   - next/headers の cookies / headers はモック化する
 *   - HTTP レベルの振る舞い（レスポンスコード・ボディ・Cookie）を検証する
 *   - write_token がレスポンスに含まれることを検証する（TASK-042の主目的）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock('@/lib/services/auth-service', () => ({
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
  verifyAuthCode: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import { POST } from '../route'
import * as AuthService from '@/lib/services/auth-service'
import { cookies, headers } from 'next/headers'

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用 NextRequest を生成する
 */
function makeRequest(body: Record<string, unknown>, options: {
  ip?: string
} = {}): NextRequest {
  const { ip = '127.0.0.1' } = options
  return new NextRequest('http://localhost/api/auth/auth-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

/**
 * cookies() の get メソッドをモック化するヘルパー
 */
function mockCookies(edgeToken: string | undefined) {
  const cookieStoreMock = {
    get: vi.fn((name: string) => {
      if (name === 'edge-token' && edgeToken !== undefined) {
        return { value: edgeToken }
      }
      return undefined
    }),
  }
  vi.mocked(cookies).mockResolvedValue(cookieStoreMock as unknown as ReturnType<typeof cookies> extends Promise<infer T> ? T : never)
}

/**
 * headers() をモック化するヘルパー
 */
function mockHeaders(ip: string = '127.0.0.1') {
  const headersMock = {
    get: vi.fn((name: string) => {
      if (name === 'x-forwarded-for') return ip
      return null
    }),
  }
  vi.mocked(headers).mockResolvedValue(headersMock as unknown as ReturnType<typeof headers> extends Promise<infer T> ? T : never)
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('POST /api/auth/auth-code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルトのモック設定
    mockHeaders()
    mockCookies('valid-edge-token')
  })

  // =========================================================================
  // 正常系: 認証成功
  // =========================================================================

  describe('正常系: 認証成功', () => {
    // See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する

    it('認証成功時に 200 と { success: true, writeToken } を返す', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: true,
        writeToken: 'abcdef1234567890abcdef1234567890',
      })

      const req = makeRequest({ code: '123456', turnstileToken: 'valid-turnstile' })
      const res = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as { success: boolean; writeToken?: string }
      expect(body.success).toBe(true)
      expect(body.writeToken).toBe('abcdef1234567890abcdef1234567890')
    })

    it('write_token が undefined でも 200 と { success: true } を返す（後方互換）', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: true,
        writeToken: undefined,
      })

      const req = makeRequest({ code: '123456', turnstileToken: 'valid-turnstile' })
      const res = await POST(req)

      expect(res.status).toBe(200)
      const body = await res.json() as { success: boolean; writeToken?: string }
      expect(body.success).toBe(true)
    })

    it('認証成功時に edge-token Cookie を設定する', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: true,
        writeToken: 'test-write-token',
      })

      const req = makeRequest({ code: '123456', turnstileToken: 'valid-turnstile' })
      const res = await POST(req)

      // edge-token Cookie が設定されることを確認
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toContain('edge-token')
    })

    it('AuthService.verifyAuthCode を正しい引数で呼び出す', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: true,
        writeToken: 'test-token',
      })
      mockHeaders('192.168.1.100')

      const req = makeRequest({ code: '654321', turnstileToken: 'some-turnstile' }, { ip: '192.168.1.100' })
      await POST(req)

      expect(AuthService.verifyAuthCode).toHaveBeenCalledWith(
        '654321',
        'some-turnstile',
        expect.any(String) // IP ハッシュ
      )
    })
  })

  // =========================================================================
  // 異常系: 認証失敗
  // =========================================================================

  describe('異常系: 認証失敗', () => {
    // See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
    // See: features/authentication.feature @期限切れ認証コードでは認証できない

    it('認証失敗時に 401 と { success: false, error } を返す', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: false,
      })

      const req = makeRequest({ code: '999999', turnstileToken: 'invalid-turnstile' })
      const res = await POST(req)

      expect(res.status).toBe(401)
      const body = await res.json() as { success: boolean; error?: string }
      expect(body.success).toBe(false)
      expect(body.error).toBeTruthy()
    })

    it('認証失敗時に write_token は含まれない', async () => {
      vi.mocked(AuthService.verifyAuthCode).mockResolvedValue({
        success: false,
      })

      const req = makeRequest({ code: '999999', turnstileToken: 'invalid-turnstile' })
      const res = await POST(req)

      const body = await res.json() as { writeToken?: string }
      expect(body.writeToken).toBeUndefined()
    })
  })

  // =========================================================================
  // 異常系: バリデーションエラー
  // =========================================================================

  describe('異常系: バリデーションエラー', () => {
    it('リクエストボディが不正な場合に 400 を返す', async () => {
      const req = new NextRequest('http://localhost/api/auth/auth-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('code が 6桁数字でない場合に 400 を返す', async () => {
      const req = makeRequest({ code: 'abc', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBeTruthy()
    })

    it('code が空の場合に 400 を返す', async () => {
      const req = makeRequest({ code: '', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('turnstileToken が未指定の場合に 400 を返す', async () => {
      const req = makeRequest({ code: '123456', turnstileToken: '' })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('edge-token Cookie が存在しない場合に 400 を返す', async () => {
      mockCookies(undefined)

      const req = makeRequest({ code: '123456', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toContain('edge-token')
    })
  })

  // =========================================================================
  // エッジケース
  // =========================================================================

  describe('エッジケース', () => {
    it('5桁の code は 400 を返す（6桁未満）', async () => {
      const req = makeRequest({ code: '12345', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('7桁の code は 400 を返す（6桁超過）', async () => {
      const req = makeRequest({ code: '1234567', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it('code に数字以外が含まれる場合は 400 を返す', async () => {
      const req = makeRequest({ code: '12345a', turnstileToken: 'valid' })
      const res = await POST(req)

      expect(res.status).toBe(400)
    })
  })
})
