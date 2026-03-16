/**
 * 単体テスト: mypage-service.ts（MypageService）
 *
 * See: features/mypage.feature
 * See: features/currency.feature @マイページで通貨残高を確認する
 *
 * テスト方針:
 *   - UserRepository・CurrencyService・PostRepository はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（無料ユーザーのアクセス制限・ユーザー不存在・バリデーション等）を網羅する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock('@/lib/infrastructure/repositories/user-repository', () => ({
  findById: vi.fn(),
  updateUsername: vi.fn(),
  updateIsPremium: vi.fn(),
}))

vi.mock('@/lib/services/currency-service', () => ({
  getBalance: vi.fn(),
}))

vi.mock('@/lib/infrastructure/repositories/post-repository', () => ({
  findByAuthorId: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import {
  getMypage,
  setUsername,
  upgradeToPremium,
  getPostHistory,
  type MypageInfo,
  type SetUsernameResult,
  type UpgradeToPremiumResult,
  type PostHistoryItem,
} from '../mypage-service'

import * as UserRepository from '@/lib/infrastructure/repositories/user-repository'
import * as CurrencyService from '@/lib/services/currency-service'
import * as PostRepository from '@/lib/infrastructure/repositories/post-repository'
import type { User } from '@/lib/domain/models/user'
import type { Post } from '@/lib/domain/models/post'

// ---------------------------------------------------------------------------
// テストフィクスチャ
// ---------------------------------------------------------------------------

const FREE_USER: User = {
  id: 'user-free-001',
  authToken: 'token-free-001',
  authorIdSeed: 'seed-001',
  isPremium: false,
  isVerified: true,
  username: null,
  streakDays: 3,
  lastPostDate: '2026-03-13',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const PREMIUM_USER: User = {
  id: 'user-premium-001',
  authToken: 'token-premium-001',
  authorIdSeed: 'seed-002',
  isPremium: true,
  isVerified: true,
  username: 'バトラー太郎',
  streakDays: 10,
  lastPostDate: '2026-03-13',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const SAMPLE_POST: Post = {
  id: 'post-001',
  threadId: 'thread-001',
  postNumber: 1,
  authorId: 'user-free-001',
  displayName: '名無しさん',
  dailyId: 'ABCD1234',
  body: 'テスト書き込みです',
  inlineSystemInfo: null,
  isSystemMessage: false,
  isDeleted: false,
  createdAt: new Date('2026-03-10T12:00:00Z'),
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('MypageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // getMypage: マイページ基本情報取得
  // =========================================================================

  describe('getMypage', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: 無料ユーザー', () => {
      it('残高・アカウント情報を含む MypageInfo を返す', async () => {
        // See: features/mypage.feature @マイページに基本情報が表示される
        // See: features/currency.feature @マイページで通貨残高を確認する
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(150)

        const result = await getMypage('user-free-001')

        expect(result).not.toBeNull()
        expect(result!.userId).toBe('user-free-001')
        expect(result!.balance).toBe(150)
        expect(result!.isPremium).toBe(false)
        expect(result!.username).toBeNull()
        expect(result!.streakDays).toBe(3)
      })

      it('UserRepository.findById と CurrencyService.getBalance を呼び出す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(50)

        await getMypage('user-free-001')

        expect(UserRepository.findById).toHaveBeenCalledWith('user-free-001')
        expect(CurrencyService.getBalance).toHaveBeenCalledWith('user-free-001')
      })
    })

    describe('正常系: 有料ユーザー', () => {
      it('isPremium=true・ユーザーネームを含む MypageInfo を返す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(500)

        const result = await getMypage('user-premium-001')

        expect(result!.isPremium).toBe(true)
        expect(result!.username).toBe('バトラー太郎')
        expect(result!.balance).toBe(500)
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース
    // -----------------------------------------------------------------------

    describe('エッジケース: ユーザーが存在しない', () => {
      it('ユーザーが見つからない場合は null を返す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(null)
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(0)

        const result = await getMypage('unknown-user')

        expect(result).toBeNull()
      })
    })

    describe('エッジケース: 残高が 0', () => {
      it('残高 0 を正常に返す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(0)

        const result = await getMypage('user-free-001')

        expect(result!.balance).toBe(0)
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: DB 障害
    // -----------------------------------------------------------------------

    describe('異常系: DB 障害', () => {
      it('UserRepository.findById がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.findById).mockRejectedValue(
          new Error('UserRepository.findById failed: DB障害')
        )
        vi.mocked(CurrencyService.getBalance).mockResolvedValue(0)

        await expect(getMypage('user-001')).rejects.toThrow('UserRepository.findById failed')
      })

      it('CurrencyService.getBalance がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(CurrencyService.getBalance).mockRejectedValue(
          new Error('CurrencyRepository.getBalance failed: DB障害')
        )

        await expect(getMypage('user-free-001')).rejects.toThrow(
          'CurrencyRepository.getBalance failed'
        )
      })
    })
  })

  // =========================================================================
  // setUsername: ユーザーネーム設定
  // =========================================================================

  describe('setUsername', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: 有料ユーザーがユーザーネームを設定する', () => {
      it('成功時に { success: true, username } を返す', async () => {
        // See: features/mypage.feature @有料ユーザーはマイページでユーザーネームを設定できる
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined)

        const result = await setUsername('user-premium-001', 'バトラー太郎')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.username).toBe('バトラー太郎')
        }
      })

      it('UserRepository.updateUsername を正しい引数で呼び出す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined)

        await setUsername('user-premium-001', 'バトラー太郎')

        expect(UserRepository.updateUsername).toHaveBeenCalledWith(
          'user-premium-001',
          'バトラー太郎'
        )
      })

      it('前後の空白はトリミングされる', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined)

        const result = await setUsername('user-premium-001', '  バトラー太郎  ')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.username).toBe('バトラー太郎')
        }
        expect(UserRepository.updateUsername).toHaveBeenCalledWith(
          'user-premium-001',
          'バトラー太郎'
        )
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: 無料ユーザー
    // -----------------------------------------------------------------------

    describe('異常系: 無料ユーザーが設定を試みる', () => {
      it('{ success: false, code: "NOT_PREMIUM" } を返す', async () => {
        // See: features/mypage.feature @無料ユーザーはユーザーネームを設定できない
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)

        const result = await setUsername('user-free-001', 'テスト名')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('NOT_PREMIUM')
        }
        // updateUsername は呼び出されない
        expect(UserRepository.updateUsername).not.toHaveBeenCalled()
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: バリデーション
    // -----------------------------------------------------------------------

    describe('エッジケース: 空文字・バリデーション', () => {
      it('空文字は { success: false, code: "VALIDATION_ERROR" } を返す', async () => {
        const result = await setUsername('user-001', '')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('VALIDATION_ERROR')
        }
        // findById は呼び出されない（早期リターン）
        expect(UserRepository.findById).not.toHaveBeenCalled()
      })

      it('空白のみは { success: false, code: "VALIDATION_ERROR" } を返す', async () => {
        const result = await setUsername('user-001', '   ')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('VALIDATION_ERROR')
        }
      })

      it('21文字は { success: false, code: "VALIDATION_ERROR" } を返す（上限20文字）', async () => {
        const result = await setUsername('user-001', 'あ'.repeat(21))

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('VALIDATION_ERROR')
        }
      })

      it('20文字は成功する（境界値）', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined)

        const result = await setUsername('user-premium-001', 'あ'.repeat(20))

        expect(result.success).toBe(true)
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: ユーザーが存在しない
    // -----------------------------------------------------------------------

    describe('エッジケース: ユーザーが存在しない', () => {
      it('{ success: false, code: "USER_NOT_FOUND" } を返す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(null)

        const result = await setUsername('unknown-user', '名前')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('USER_NOT_FOUND')
        }
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: 特殊文字
    // -----------------------------------------------------------------------

    describe('エッジケース: 特殊文字・Unicode', () => {
      it('日本語・絵文字を含むユーザーネームも設定できる', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockResolvedValue(undefined)

        const result = await setUsername('user-premium-001', '名前🎮テスト')

        expect(result.success).toBe(true)
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: DB 障害
    // -----------------------------------------------------------------------

    describe('異常系: DB 障害', () => {
      it('UserRepository.updateUsername がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)
        vi.mocked(UserRepository.updateUsername).mockRejectedValue(
          new Error('UserRepository.updateUsername failed: DB障害')
        )

        await expect(setUsername('user-premium-001', 'テスト')).rejects.toThrow(
          'UserRepository.updateUsername failed'
        )
      })
    })
  })

  // =========================================================================
  // upgradeToPremium: 課金（有料ステータス切替）モック
  // =========================================================================

  describe('upgradeToPremium', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: 無料ユーザーが課金する', () => {
      it('成功時に { success: true } を返す', async () => {
        // See: features/mypage.feature @無料ユーザーが課金ボタンで有料ステータスに切り替わる
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(UserRepository.updateIsPremium).mockResolvedValue(undefined)

        const result = await upgradeToPremium('user-free-001')

        expect(result.success).toBe(true)
      })

      it('UserRepository.updateIsPremium を isPremium=true で呼び出す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(UserRepository.updateIsPremium).mockResolvedValue(undefined)

        await upgradeToPremium('user-free-001')

        expect(UserRepository.updateIsPremium).toHaveBeenCalledWith('user-free-001', true)
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: 既に有料ユーザー
    // -----------------------------------------------------------------------

    describe('異常系: 既に有料ユーザー', () => {
      it('{ success: false, code: "ALREADY_PREMIUM" } を返す', async () => {
        // See: features/mypage.feature @既に有料ユーザーの場合は課金ボタンが無効である
        vi.mocked(UserRepository.findById).mockResolvedValue(PREMIUM_USER)

        const result = await upgradeToPremium('user-premium-001')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('ALREADY_PREMIUM')
        }
        // updateIsPremium は呼び出されない
        expect(UserRepository.updateIsPremium).not.toHaveBeenCalled()
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: ユーザーが存在しない
    // -----------------------------------------------------------------------

    describe('エッジケース: ユーザーが存在しない', () => {
      it('{ success: false, code: "USER_NOT_FOUND" } を返す', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(null)

        const result = await upgradeToPremium('unknown-user')

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe('USER_NOT_FOUND')
        }
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: DB 障害
    // -----------------------------------------------------------------------

    describe('異常系: DB 障害', () => {
      it('UserRepository.updateIsPremium がエラーをスローした場合は伝播する', async () => {
        vi.mocked(UserRepository.findById).mockResolvedValue(FREE_USER)
        vi.mocked(UserRepository.updateIsPremium).mockRejectedValue(
          new Error('UserRepository.updateIsPremium failed: DB障害')
        )

        await expect(upgradeToPremium('user-free-001')).rejects.toThrow(
          'UserRepository.updateIsPremium failed'
        )
      })
    })
  })

  // =========================================================================
  // getPostHistory: 書き込み履歴取得
  // =========================================================================

  describe('getPostHistory', () => {
    // -----------------------------------------------------------------------
    // 正常系
    // -----------------------------------------------------------------------

    describe('正常系: 書き込みがある場合', () => {
      it('PostHistoryItem 配列を返す', async () => {
        // See: features/mypage.feature @自分の書き込み履歴を確認できる
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue([SAMPLE_POST])

        const result = await getPostHistory('user-free-001')

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
          id: 'post-001',
          threadId: 'thread-001',
          postNumber: 1,
          body: 'テスト書き込みです',
        })
        expect(result[0].createdAt).toBeInstanceOf(Date)
      })

      it('PostRepository.findByAuthorId を userId で呼び出す', async () => {
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue([SAMPLE_POST])

        await getPostHistory('user-free-001')

        expect(PostRepository.findByAuthorId).toHaveBeenCalledWith(
          'user-free-001',
          expect.any(Object)
        )
      })

      it('複数件の書き込みを返す', async () => {
        const posts: Post[] = [
          { ...SAMPLE_POST, id: 'post-001', postNumber: 3, createdAt: new Date('2026-03-13') },
          { ...SAMPLE_POST, id: 'post-002', postNumber: 2, createdAt: new Date('2026-03-12') },
          { ...SAMPLE_POST, id: 'post-003', postNumber: 1, createdAt: new Date('2026-03-11') },
        ]
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue(posts)

        const result = await getPostHistory('user-free-001')

        expect(result).toHaveLength(3)
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: 0 件
    // -----------------------------------------------------------------------

    describe('エッジケース: 書き込みが 0 件', () => {
      it('空配列を返す', async () => {
        // See: features/mypage.feature @書き込み履歴が0件の場合はメッセージが表示される
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue([])

        const result = await getPostHistory('user-free-001')

        expect(result).toHaveLength(0)
        expect(result).toEqual([])
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: 論理削除されたレスを除外する
    // -----------------------------------------------------------------------

    describe('エッジケース: 論理削除されたレスを除外する', () => {
      it('isDeleted=true のレスは含まれない', async () => {
        const posts: Post[] = [
          { ...SAMPLE_POST, id: 'post-001', isDeleted: false },
          { ...SAMPLE_POST, id: 'post-002', isDeleted: true },
          { ...SAMPLE_POST, id: 'post-003', isDeleted: false },
        ]
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue(posts)

        const result = await getPostHistory('user-free-001')

        expect(result).toHaveLength(2)
        expect(result.map((p) => p.id)).toEqual(['post-001', 'post-003'])
      })

      it('全件論理削除済みの場合は空配列を返す', async () => {
        const posts: Post[] = [
          { ...SAMPLE_POST, id: 'post-001', isDeleted: true },
          { ...SAMPLE_POST, id: 'post-002', isDeleted: true },
        ]
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue(posts)

        const result = await getPostHistory('user-free-001')

        expect(result).toHaveLength(0)
      })
    })

    // -----------------------------------------------------------------------
    // エッジケース: limit オプション
    // -----------------------------------------------------------------------

    describe('エッジケース: limit オプション', () => {
      it('limit オプションを PostRepository に渡す', async () => {
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue([])

        await getPostHistory('user-free-001', { limit: 10 })

        expect(PostRepository.findByAuthorId).toHaveBeenCalledWith('user-free-001', { limit: 10 })
      })

      it('limit 未指定の場合はデフォルト（オプション未指定）で呼び出す', async () => {
        vi.mocked(PostRepository.findByAuthorId).mockResolvedValue([])

        await getPostHistory('user-free-001')

        expect(PostRepository.findByAuthorId).toHaveBeenCalledWith('user-free-001', {})
      })
    })

    // -----------------------------------------------------------------------
    // 異常系: DB 障害
    // -----------------------------------------------------------------------

    describe('異常系: DB 障害', () => {
      it('PostRepository.findByAuthorId がエラーをスローした場合は伝播する', async () => {
        vi.mocked(PostRepository.findByAuthorId).mockRejectedValue(
          new Error('PostRepository.findByAuthorId failed: DB障害')
        )

        await expect(getPostHistory('user-free-001')).rejects.toThrow(
          'PostRepository.findByAuthorId failed'
        )
      })
    })
  })
})
