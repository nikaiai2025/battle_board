/**
 * 単体テスト: auth-service.ts（AuthService）
 *
 * See: features/phase1/authentication.feature
 * See: docs/architecture/components/authentication.md §2 公開インターフェース
 *
 * テスト方針:
 *   - UserRepository, AuthCodeRepository, TurnstileClient はモック化する
 *   - Supabase Admin クライアントはモック化する
 *   - CurrencyService はモック化する（issueEdgeToken が initializeBalance を呼ぶため）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

// supabase/client は最初に宣言する（hoisting のため）
vi.mock('@/lib/infrastructure/supabase/client', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('@/lib/infrastructure/repositories/user-repository', () => ({
  findByAuthToken: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/auth-code-repository', () => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  markVerified: vi.fn(),
}))

vi.mock('@/lib/infrastructure/external/turnstile-client', () => ({
  verifyTurnstileToken: vi.fn(),
}))

// currency-service をモック化する（issueEdgeToken 内で initializeBalance が呼ばれるため）
// See: features/phase1/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
vi.mock('@/lib/services/currency-service', () => ({
  initializeBalance: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import {
  verifyEdgeToken,
  issueEdgeToken,
  issueAuthCode,
  verifyAuthCode,
  verifyAdminSession,
  hashIp,
  reduceIp,
} from '../auth-service'

import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'
import * as AuthCodeRepository from '@/lib/infrastructure/repositories/auth-code-repository'
import * as TurnstileClient from '@/lib/infrastructure/external/turnstile-client'
import * as CurrencyService from '@/lib/services/currency-service'
import { supabaseAdmin } from '@/lib/infrastructure/supabase/client'

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** テスト用ユーザーオブジェクトのファクトリ */
function makeUser(overrides: Partial<{
  id: string
  authToken: string
  authorIdSeed: string
  isPremium: boolean
  username: string | null
  streakDays: number
  lastPostDate: string | null
  createdAt: Date
}> = {}) {
  return {
    id: 'user-uuid-001',
    authToken: 'valid-edge-token',
    authorIdSeed: 'ip-hash-abc123',
    isPremium: false,
    username: null,
    streakDays: 0,
    lastPostDate: null,
    createdAt: new Date('2026-03-08T00:00:00Z'),
    ...overrides,
  }
}

/** テスト用 AuthCode オブジェクトのファクトリ */
function makeAuthCode(overrides: Partial<{
  id: string
  code: string
  tokenId: string
  ipHash: string
  verified: boolean
  expiresAt: Date
  createdAt: Date
}> = {}) {
  return {
    id: 'auth-code-uuid-001',
    code: '123456',
    tokenId: 'valid-edge-token',
    ipHash: 'ip-hash-abc123',
    verified: false,
    expiresAt: new Date(Date.now() + 600_000), // 10分後
    createdAt: new Date('2026-03-08T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // reduceIp: IP縮約ユーティリティ
  // =========================================================================

  describe('reduceIp', () => {
    describe('正常系: IPv4', () => {
      it('IPv4 アドレスはそのまま返す', () => {
        expect(reduceIp('192.168.1.1')).toBe('192.168.1.1')
      })

      it('ループバックアドレスはそのまま返す', () => {
        expect(reduceIp('127.0.0.1')).toBe('127.0.0.1')
      })

      it('0.0.0.0 はそのまま返す', () => {
        expect(reduceIp('0.0.0.0')).toBe('0.0.0.0')
      })
    })

    describe('正常系: IPv6', () => {
      it('完全展開形式の IPv6 は先頭3グループを返す', () => {
        const result = reduceIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')
        expect(result).toBe('2001:0db8:85a3')
      })

      it('短縮形 IPv6 (::) は先頭3グループを返す', () => {
        const result = reduceIp('2001:db8::1')
        // 2001:0db8:0000 の形式になるはず
        expect(result).toMatch(/^[0-9a-f:]+:[0-9a-f:]+:[0-9a-f:]+$/)
      })

      it('ループバック IPv6 (::1) の縮約', () => {
        const result = reduceIp('::1')
        // 先頭3グループはすべて 0000
        expect(result).toBe('0000:0000:0000')
      })

      it('同一 /48 の IPv6 アドレスは同じ縮約結果を返す', () => {
        const ip1 = '2001:db8:85a3:0000:0000:8a2e:0370:7334'
        const ip2 = '2001:db8:85a3:0001:0002:0003:0004:0005'
        expect(reduceIp(ip1)).toBe(reduceIp(ip2))
      })

      it('異なる /48 の IPv6 アドレスは異なる縮約結果を返す', () => {
        const ip1 = '2001:db8:85a3::1'
        const ip2 = '2001:db8:85a4::1'
        expect(reduceIp(ip1)).not.toBe(reduceIp(ip2))
      })
    })

    describe('境界値', () => {
      it('空文字列でもクラッシュしない', () => {
        expect(() => reduceIp('')).not.toThrow()
      })
    })
  })

  // =========================================================================
  // hashIp: IPハッシュ生成
  // =========================================================================

  describe('hashIp', () => {
    describe('正常系', () => {
      it('同じ IP は同じハッシュを返す（冪等性）', () => {
        expect(hashIp('192.168.1.1')).toBe(hashIp('192.168.1.1'))
      })

      it('異なる IP は異なるハッシュを返す', () => {
        expect(hashIp('192.168.1.1')).not.toBe(hashIp('192.168.1.2'))
      })

      it('返り値は16進数の SHA-512 ハッシュ（128文字）', () => {
        const hash = hashIp('192.168.1.1')
        expect(hash).toMatch(/^[0-9a-f]{128}$/)
      })

      it('IPv4 アドレスのハッシュを生成できる', () => {
        const hash = hashIp('203.0.113.1')
        expect(hash).toHaveLength(128)
      })

      it('IPv6 アドレスは /48 に縮約してからハッシュする', () => {
        // 同一 /48 の2つの IPv6 アドレスは同じハッシュになる
        const hash1 = hashIp('2001:db8:85a3:0000:0000:8a2e:0370:7334')
        const hash2 = hashIp('2001:db8:85a3:0001:0002:0003:0004:0005')
        expect(hash1).toBe(hash2)
      })
    })

    describe('境界値', () => {
      it('空文字列でもクラッシュしない', () => {
        expect(() => hashIp('')).not.toThrow()
        expect(hashIp('')).toHaveLength(128)
      })
    })
  })

  // =========================================================================
  // verifyEdgeToken: edge-token 検証
  // =========================================================================

  describe('verifyEdgeToken', () => {
    describe('正常系: トークンが有効でIP一致', () => {
      it('有効なトークンと一致するIPで valid: true を返す', async () => {
        const user = makeUser({ authToken: 'valid-token', authorIdSeed: 'ip-hash' })
        vi.mocked(UserRepository.findByAuthToken).mockResolvedValue(user)

        const result = await verifyEdgeToken('valid-token', 'ip-hash')

        expect(result.valid).toBe(true)
        if (result.valid) {
          expect(result.userId).toBe('user-uuid-001')
          expect(result.authorIdSeed).toBe('ip-hash')
        }
      })
    })

    describe('異常系: トークンが存在しない', () => {
      it('存在しないトークンで not_found を返す', async () => {
        vi.mocked(UserRepository.findByAuthToken).mockResolvedValue(null)

        const result = await verifyEdgeToken('unknown-token', 'ip-hash')

        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.reason).toBe('not_found')
        }
      })
    })

    describe('異常系: IP 不一致（ソフトチェック）', () => {
      it('IP不一致時は ip_mismatch を返す', async () => {
        const user = makeUser({ authToken: 'valid-token', authorIdSeed: 'original-ip-hash' })
        vi.mocked(UserRepository.findByAuthToken).mockResolvedValue(user)

        const result = await verifyEdgeToken('valid-token', 'different-ip-hash')

        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.reason).toBe('ip_mismatch')
        }
      })
    })

    describe('エッジケース', () => {
      it('空のトークンでも UserRepository を呼び出す', async () => {
        vi.mocked(UserRepository.findByAuthToken).mockResolvedValue(null)

        const result = await verifyEdgeToken('', 'ip-hash')

        expect(result.valid).toBe(false)
        expect(UserRepository.findByAuthToken).toHaveBeenCalledWith('')
      })

      it('UserRepository がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.findByAuthToken).mockRejectedValue(
          new Error('DB接続エラー')
        )

        await expect(verifyEdgeToken('token', 'ip')).rejects.toThrow('DB接続エラー')
      })
    })
  })

  // =========================================================================
  // issueEdgeToken: edge-token 発行
  // =========================================================================

  describe('issueEdgeToken', () => {
    beforeEach(() => {
      // initializeBalance は常に成功するデフォルトモックを設定する
      vi.mocked(CurrencyService.initializeBalance).mockResolvedValue(undefined)
    })

    describe('正常系', () => {
      it('新しい edge-token とユーザーIDを返す', async () => {
        const user = makeUser({ id: 'new-user-uuid', authToken: 'generated-token' })
        vi.mocked(UserRepository.create).mockResolvedValue(user)

        const result = await issueEdgeToken('ip-hash-abc123')

        expect(result.userId).toBe('new-user-uuid')
        expect(typeof result.token).toBe('string')
        expect(result.token.length).toBeGreaterThan(0)
      })

      it('異なる呼び出しで異なるトークンを生成する（CSPRNG）', async () => {
        vi.mocked(UserRepository.create)
          .mockResolvedValueOnce(makeUser({ id: 'user-1' }))
          .mockResolvedValueOnce(makeUser({ id: 'user-2' }))

        const result1 = await issueEdgeToken('ip-hash-1')
        const result2 = await issueEdgeToken('ip-hash-2')

        // CSPRNG による生成のため、トークンは一致しないはず
        expect(result1.token).not.toBe(result2.token)
      })

      it('UUID 形式のトークンを生成する', async () => {
        vi.mocked(UserRepository.create).mockResolvedValue(makeUser())

        const result = await issueEdgeToken('ip-hash')

        // crypto.randomUUID() は UUID v4 形式
        expect(result.token).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        )
      })

      it('UserRepository.create を正しい引数で呼び出す', async () => {
        vi.mocked(UserRepository.create).mockResolvedValue(makeUser())

        await issueEdgeToken('test-ip-hash')

        expect(UserRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            authorIdSeed: 'test-ip-hash',
            isPremium: false,
            username: null,
          })
        )
      })

      it('新規ユーザー登録時に CurrencyService.initializeBalance を呼び出す', async () => {
        // See: features/phase1/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
        const user = makeUser({ id: 'user-for-currency-init' })
        vi.mocked(UserRepository.create).mockResolvedValue(user)

        await issueEdgeToken('ip-hash-abc123')

        // ユーザー作成後に initializeBalance がユーザーIDで呼ばれることを検証する
        expect(CurrencyService.initializeBalance).toHaveBeenCalledWith('user-for-currency-init')
        expect(CurrencyService.initializeBalance).toHaveBeenCalledTimes(1)
      })
    })

    describe('異常系', () => {
      it('UserRepository.create がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.create).mockRejectedValue(
          new Error('DB挿入エラー')
        )

        await expect(issueEdgeToken('ip-hash')).rejects.toThrow('DB挿入エラー')
      })
    })
  })

  // =========================================================================
  // issueAuthCode: 認証コード発行
  // =========================================================================

  describe('issueAuthCode', () => {
    describe('正常系', () => {
      it('6桁の数字コードを返す', async () => {
        vi.mocked(AuthCodeRepository.create).mockResolvedValue(makeAuthCode())

        const result = await issueAuthCode('ip-hash', 'edge-token')

        expect(result.code).toMatch(/^\d{6}$/)
      })

      it('有効期限が10分後になっている', async () => {
        vi.mocked(AuthCodeRepository.create).mockResolvedValue(makeAuthCode())
        const before = Date.now()

        const result = await issueAuthCode('ip-hash', 'edge-token')

        const after = Date.now()
        const expiresMs = result.expiresAt.getTime()
        // 有効期限が 600秒（10分）後であることを確認（±5秒の誤差を許容）
        expect(expiresMs).toBeGreaterThanOrEqual(before + 600_000 - 5000)
        expect(expiresMs).toBeLessThanOrEqual(after + 600_000 + 5000)
      })

      it('AuthCodeRepository.create を正しい引数で呼び出す', async () => {
        vi.mocked(AuthCodeRepository.create).mockResolvedValue(makeAuthCode())

        await issueAuthCode('test-ip-hash', 'test-edge-token')

        expect(AuthCodeRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            ipHash: 'test-ip-hash',
            tokenId: 'test-edge-token',
            verified: false,
          })
        )
      })

      it('生成されるコードの code フィールドが6桁数字', async () => {
        // 複数回呼び出してすべて6桁であることを確認
        vi.mocked(AuthCodeRepository.create).mockResolvedValue(makeAuthCode())

        for (let i = 0; i < 10; i++) {
          const result = await issueAuthCode('ip-hash', 'token')
          expect(result.code).toMatch(/^\d{6}$/)
        }
      })
    })

    describe('境界値: ゼロパディング', () => {
      it('0から始まるコードも6桁で返される（ゼロパディング）', async () => {
        // generateAuthCode は 0〜999999 の範囲で生成するため、
        // 先頭0のコード（例: "000001"）も正しく処理されることを確認
        vi.mocked(AuthCodeRepository.create).mockResolvedValue(makeAuthCode({ code: '000001' }))

        // 実際の生成は内部で行われるため、形式のみ確認
        const result = await issueAuthCode('ip-hash', 'token')
        expect(result.code).toHaveLength(6)
      })
    })

    describe('異常系', () => {
      it('AuthCodeRepository.create がエラーをスローした場合は伝播する', async () => {
        vi.mocked(AuthCodeRepository.create).mockRejectedValue(
          new Error('DB挿入エラー')
        )

        await expect(issueAuthCode('ip-hash', 'token')).rejects.toThrow('DB挿入エラー')
      })
    })
  })

  // =========================================================================
  // verifyAuthCode: 認証コード検証
  // =========================================================================

  describe('verifyAuthCode', () => {
    describe('正常系: 認証成功', () => {
      it('有効なコードとTurnstile成功で true を返す', async () => {
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(makeAuthCode())
        vi.mocked(TurnstileClient.verifyTurnstileToken).mockResolvedValue(true)
        vi.mocked(AuthCodeRepository.markVerified).mockResolvedValue(undefined)

        const result = await verifyAuthCode('123456', 'turnstile-token', 'ip-hash-abc123')

        expect(result).toBe(true)
      })

      it('認証成功後に markVerified を呼び出す', async () => {
        const authCode = makeAuthCode({ id: 'code-id-001' })
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(authCode)
        vi.mocked(TurnstileClient.verifyTurnstileToken).mockResolvedValue(true)
        vi.mocked(AuthCodeRepository.markVerified).mockResolvedValue(undefined)

        await verifyAuthCode('123456', 'turnstile-token', 'ip-hash-abc123')

        expect(AuthCodeRepository.markVerified).toHaveBeenCalledWith('code-id-001')
      })

      it('IP 不一致でも認証は成功する（ソフトチェック）', async () => {
        const authCode = makeAuthCode({ ipHash: 'original-ip' })
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(authCode)
        vi.mocked(TurnstileClient.verifyTurnstileToken).mockResolvedValue(true)
        vi.mocked(AuthCodeRepository.markVerified).mockResolvedValue(undefined)

        // IP が異なる場合でも認証は成功する
        const result = await verifyAuthCode('123456', 'turnstile-token', 'different-ip')

        expect(result).toBe(true)
      })
    })

    describe('異常系: コードが存在しない', () => {
      it('存在しないコードで false を返す', async () => {
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(null)

        const result = await verifyAuthCode('999999', 'turnstile-token', 'ip-hash')

        expect(result).toBe(false)
        expect(AuthCodeRepository.markVerified).not.toHaveBeenCalled()
      })
    })

    describe('異常系: 有効期限切れ', () => {
      it('期限切れコードで false を返す', async () => {
        const expiredCode = makeAuthCode({
          expiresAt: new Date(Date.now() - 1000), // 1秒前に期限切れ
        })
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(expiredCode)

        const result = await verifyAuthCode('123456', 'turnstile-token', 'ip-hash')

        expect(result).toBe(false)
        expect(TurnstileClient.verifyTurnstileToken).not.toHaveBeenCalled()
        expect(AuthCodeRepository.markVerified).not.toHaveBeenCalled()
      })
    })

    describe('異常系: Turnstile 検証失敗', () => {
      it('Turnstile 検証失敗で false を返す', async () => {
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(makeAuthCode())
        vi.mocked(TurnstileClient.verifyTurnstileToken).mockResolvedValue(false)

        const result = await verifyAuthCode('123456', 'invalid-turnstile', 'ip-hash-abc123')

        expect(result).toBe(false)
        expect(AuthCodeRepository.markVerified).not.toHaveBeenCalled()
      })
    })

    describe('境界値: 期限ちょうど', () => {
      it('有効期限の1ms前は有効', async () => {
        const code = makeAuthCode({
          expiresAt: new Date(Date.now() + 1), // 1ms 後に期限切れ
        })
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(code)
        vi.mocked(TurnstileClient.verifyTurnstileToken).mockResolvedValue(true)
        vi.mocked(AuthCodeRepository.markVerified).mockResolvedValue(undefined)

        const result = await verifyAuthCode('123456', 'turnstile', 'ip-hash-abc123')

        expect(result).toBe(true)
      })
    })

    describe('エッジケース', () => {
      it('空のコードでも AuthCodeRepository を呼び出す', async () => {
        vi.mocked(AuthCodeRepository.findByCode).mockResolvedValue(null)

        const result = await verifyAuthCode('', 'turnstile', 'ip-hash')

        expect(result).toBe(false)
        expect(AuthCodeRepository.findByCode).toHaveBeenCalledWith('')
      })

      it('AuthCodeRepository がエラーをスローした場合は伝播する', async () => {
        vi.mocked(AuthCodeRepository.findByCode).mockRejectedValue(
          new Error('DB接続エラー')
        )

        await expect(
          verifyAuthCode('123456', 'turnstile', 'ip-hash')
        ).rejects.toThrow('DB接続エラー')
      })
    })
  })

  // =========================================================================
  // verifyAdminSession: 管理者セッション検証
  // =========================================================================

  describe('verifyAdminSession', () => {
    /** supabaseAdmin の from チェーンをモック化するヘルパー */
    function mockAdminUserQuery(adminUser: { role: string } | null, error: Error | null = null) {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: adminUser,
            error,
          }),
        }),
      })
      vi.mocked(supabaseAdmin.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabaseAdmin.from>)
    }

    describe('正常系: 管理者セッション有効', () => {
      it('有効なセッショントークンで AdminSession を返す', async () => {
        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
          data: { user: { id: 'admin-uuid', email: 'admin@example.com' } as any },
          error: null,
        } as any)
        mockAdminUserQuery({ role: 'admin' })

        const result = await verifyAdminSession('valid-session-token')

        expect(result).not.toBeNull()
        expect(result?.userId).toBe('admin-uuid')
        expect(result?.email).toBe('admin@example.com')
        expect(result?.role).toBe('admin')
      })
    })

    describe('異常系: セッション無効', () => {
      it('無効なセッショントークンで null を返す', async () => {
        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
          data: { user: null },
          error: new Error('Invalid token'),
        } as any)

        const result = await verifyAdminSession('invalid-token')

        expect(result).toBeNull()
      })

      it('Supabase Auth がユーザーを返さない場合は null を返す', async () => {
        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
          data: { user: null },
          error: null,
        } as any)

        const result = await verifyAdminSession('no-user-token')

        expect(result).toBeNull()
      })

      it('admin_users テーブルに存在しない場合は null を返す', async () => {
        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
          data: { user: { id: 'non-admin-uuid', email: 'user@example.com' } },
          error: null,
        } as any)
        mockAdminUserQuery(null, new Error('Not found'))

        const result = await verifyAdminSession('valid-but-not-admin')

        expect(result).toBeNull()
      })
    })
  })
})
