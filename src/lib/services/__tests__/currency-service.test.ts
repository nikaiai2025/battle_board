/**
 * 単体テスト: currency-service.ts（CurrencyService）
 *
 * See: features/currency.feature
 * See: docs/architecture/components/currency.md §2 公開インターフェース
 *
 * テスト方針:
 *   - CurrencyRepository はモック化する（Supabase に依存しない）
 *   - 振る舞い（Behavior）を検証し、実装詳細に依存しない
 *   - エッジケース（残高不足・同時操作・null入力等）を網羅する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// モック設定（hoisting のため最初に宣言）
// ---------------------------------------------------------------------------

vi.mock('@/lib/infrastructure/repositories/currency-repository', () => ({
  credit: vi.fn(),
  deduct: vi.fn(),
  getBalance: vi.fn(),
  create: vi.fn(),
}))

// ---------------------------------------------------------------------------
// インポート（モック宣言後）
// ---------------------------------------------------------------------------

import {
  credit,
  deduct,
  getBalance,
  initializeBalance,
  INITIAL_BALANCE,
} from '../currency-service'

import * as CurrencyRepository from '@/lib/infrastructure/repositories/currency-repository'
import type { DeductResult } from '@/lib/domain/models/currency'

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('CurrencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // INITIAL_BALANCE 定数
  // =========================================================================

  describe('INITIAL_BALANCE 定数', () => {
    it('初期付与額が 50 に設定されている', () => {
      // See: features/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
      expect(INITIAL_BALANCE).toBe(50)
    })
  })

  // =========================================================================
  // credit: 残高加算
  // =========================================================================

  describe('credit', () => {
    describe('正常系: 通常の加算', () => {
      it('CurrencyRepository.credit を userId・amount で呼び出す', async () => {
        // See: features/currency.feature
        vi.mocked(CurrencyRepository.credit).mockResolvedValue(undefined)

        await credit('user-001', 100, 'incentive_daily_login')

        expect(CurrencyRepository.credit).toHaveBeenCalledWith('user-001', 100)
      })

      it('amount=1 の最小加算も正常に処理される', async () => {
        vi.mocked(CurrencyRepository.credit).mockResolvedValue(undefined)

        await credit('user-001', 1, 'incentive_reply')

        expect(CurrencyRepository.credit).toHaveBeenCalledWith('user-001', 1)
      })

      it('大きな金額（10000）の加算も正常に処理される', async () => {
        vi.mocked(CurrencyRepository.credit).mockResolvedValue(undefined)

        await credit('user-001', 10000, 'bot_elimination')

        expect(CurrencyRepository.credit).toHaveBeenCalledWith('user-001', 10000)
      })
    })

    describe('reason パラメータのバリエーション', () => {
      it.each([
        'incentive_daily_login',
        'incentive_thread_growth',
        'incentive_reply',
        'incentive_hot_post',
        'incentive_new_thread_join',
        'incentive_thread_revival',
        'incentive_streak',
        'incentive_milestone_post',
        'accusation_hit',
        'false_accusation_bonus',
        'bot_elimination',
        'initial_grant',
        'incentive_thread_creation',
      ] as const)('reason="%s" で CurrencyRepository.credit を呼び出す', async (reason) => {
        vi.mocked(CurrencyRepository.credit).mockResolvedValue(undefined)

        await credit('user-001', 50, reason)

        expect(CurrencyRepository.credit).toHaveBeenCalledOnce()
      })
    })

    describe('異常系: DB障害', () => {
      it('CurrencyRepository.credit がエラーをスローした場合は伝播する', async () => {
        vi.mocked(CurrencyRepository.credit).mockRejectedValue(
          new Error('CurrencyRepository.credit failed: DB障害')
        )

        await expect(
          credit('user-001', 100, 'incentive_daily_login')
        ).rejects.toThrow('CurrencyRepository.credit failed')
      })
    })
  })

  // =========================================================================
  // deduct: 残高減算
  // =========================================================================

  describe('deduct', () => {
    describe('正常系: 残高が十分にある場合', () => {
      it('成功時に DeductResult { success: true, newBalance } を返す', async () => {
        // See: features/currency.feature @通貨残高がマイナスになる操作は実行されない
        const mockResult: DeductResult = { success: true, newBalance: 90 }
        vi.mocked(CurrencyRepository.deduct).mockResolvedValue(mockResult)

        const result = await deduct('user-001', 10, 'command_tell')

        expect(result).toEqual({ success: true, newBalance: 90 })
        expect(CurrencyRepository.deduct).toHaveBeenCalledWith('user-001', 10)
      })

      it('残高ちょうどのdeductも成功する（境界値）', async () => {
        const mockResult: DeductResult = { success: true, newBalance: 0 }
        vi.mocked(CurrencyRepository.deduct).mockResolvedValue(mockResult)

        const result = await deduct('user-001', 50, 'command_tell')

        expect(result).toEqual({ success: true, newBalance: 0 })
      })
    })

    describe('異常系: 残高不足', () => {
      it('残高不足時に { success: false, reason: "insufficient_balance" } を返す', async () => {
        // See: features/currency.feature @通貨残高がマイナスになる操作は実行されない
        const mockResult: DeductResult = { success: false, reason: 'insufficient_balance' }
        vi.mocked(CurrencyRepository.deduct).mockResolvedValue(mockResult)

        const result = await deduct('user-001', 100, 'command_tell')

        expect(result).toEqual({ success: false, reason: 'insufficient_balance' })
        // 例外はスローされない
      })

      it('残高0のユーザーへのdeductは失敗型を返す', async () => {
        const mockResult: DeductResult = { success: false, reason: 'insufficient_balance' }
        vi.mocked(CurrencyRepository.deduct).mockResolvedValue(mockResult)

        const result = await deduct('user-001', 1, 'command_attack')

        expect(result.success).toBe(false)
      })
    })

    describe('同時操作による二重消費防止（楽観的ロック）', () => {
      it('同時2件のdeductで1件が失敗型を返す（楽観的ロック動作）', async () => {
        // See: features/currency.feature @同時操作による通貨の二重消費が発生しない
        // 楽観的ロックはCurrencyRepositoryが担当するため、サービス層はDeductResultをそのまま伝播する
        const successResult: DeductResult = { success: true, newBalance: 5 }
        const failResult: DeductResult = { success: false, reason: 'insufficient_balance' }

        vi.mocked(CurrencyRepository.deduct)
          .mockResolvedValueOnce(successResult)
          .mockResolvedValueOnce(failResult)

        const [result1, result2] = await Promise.all([
          deduct('user-001', 10, 'command_tell'),
          deduct('user-001', 10, 'command_tell'),
        ])

        expect(result1).toEqual(successResult)
        expect(result2).toEqual(failResult)
      })
    })

    describe('reason パラメータのバリエーション', () => {
      it.each([
        'command_tell',
        'command_attack',
        'command_battle',
        'command_mute',
        'command_delete',
        'command_other',
      ] as const)('reason="%s" で CurrencyRepository.deduct を呼び出す', async (reason) => {
        const mockResult: DeductResult = { success: true, newBalance: 0 }
        vi.mocked(CurrencyRepository.deduct).mockResolvedValue(mockResult)

        await deduct('user-001', 10, reason)

        expect(CurrencyRepository.deduct).toHaveBeenCalledOnce()
      })
    })

    describe('異常系: DB障害', () => {
      it('CurrencyRepository.deduct がエラーをスローした場合は伝播する', async () => {
        vi.mocked(CurrencyRepository.deduct).mockRejectedValue(
          new Error('CurrencyRepository.deduct failed: DB障害')
        )

        await expect(
          deduct('user-001', 10, 'command_tell')
        ).rejects.toThrow('CurrencyRepository.deduct failed')
      })
    })
  })

  // =========================================================================
  // getBalance: 残高取得
  // =========================================================================

  describe('getBalance', () => {
    describe('正常系', () => {
      it('残高を数値で返す', async () => {
        vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(150)

        const balance = await getBalance('user-001')

        expect(balance).toBe(150)
        expect(CurrencyRepository.getBalance).toHaveBeenCalledWith('user-001')
      })

      it('残高0を返す', async () => {
        vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0)

        const balance = await getBalance('user-001')

        expect(balance).toBe(0)
      })

      it('大きな残高値も正常に返す', async () => {
        vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(99999)

        const balance = await getBalance('user-001')

        expect(balance).toBe(99999)
      })
    })

    describe('エッジケース: レコードが存在しないユーザー', () => {
      it('CurrencyRepository がレコードなしで 0 を返す場合、そのまま 0 を返す', async () => {
        // CurrencyRepository.getBalance はレコードなし時に 0 を返す設計
        vi.mocked(CurrencyRepository.getBalance).mockResolvedValue(0)

        const balance = await getBalance('unknown-user')

        expect(balance).toBe(0)
      })
    })

    describe('異常系: DB障害', () => {
      it('CurrencyRepository.getBalance がエラーをスローした場合は伝播する', async () => {
        vi.mocked(CurrencyRepository.getBalance).mockRejectedValue(
          new Error('CurrencyRepository.getBalance failed: DB障害')
        )

        await expect(getBalance('user-001')).rejects.toThrow(
          'CurrencyRepository.getBalance failed'
        )
      })
    })
  })

  // =========================================================================
  // initializeBalance: 初期通貨付与（新規ユーザー登録時）
  // =========================================================================

  describe('initializeBalance', () => {
    describe('正常系', () => {
      it('CurrencyRepository.create を userId と初期残高50で呼び出す', async () => {
        // See: features/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
        vi.mocked(CurrencyRepository.create).mockResolvedValue({
          userId: 'user-001',
          balance: 50,
          updatedAt: new Date(),
        })

        await initializeBalance('user-001')

        expect(CurrencyRepository.create).toHaveBeenCalledWith('user-001', INITIAL_BALANCE)
        expect(CurrencyRepository.create).toHaveBeenCalledWith('user-001', 50)
      })

      it('initializeBalance は void を返す（戻り値なし）', async () => {
        vi.mocked(CurrencyRepository.create).mockResolvedValue({
          userId: 'user-001',
          balance: 50,
          updatedAt: new Date(),
        })

        const result = await initializeBalance('user-001')

        expect(result).toBeUndefined()
      })
    })

    describe('エッジケース', () => {
      it('異なる userId ごとに個別のレコードが作成される', async () => {
        vi.mocked(CurrencyRepository.create).mockResolvedValue({
          userId: 'user-002',
          balance: 50,
          updatedAt: new Date(),
        })

        await initializeBalance('user-002')

        expect(CurrencyRepository.create).toHaveBeenCalledWith('user-002', INITIAL_BALANCE)
      })
    })

    describe('異常系: DB障害', () => {
      it('CurrencyRepository.create がエラーをスローした場合は伝播する', async () => {
        vi.mocked(CurrencyRepository.create).mockRejectedValue(
          new Error('CurrencyRepository.create failed: DB障害')
        )

        await expect(initializeBalance('user-001')).rejects.toThrow(
          'CurrencyRepository.create failed'
        )
      })
    })
  })
})
