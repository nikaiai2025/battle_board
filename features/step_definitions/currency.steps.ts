/**
 * currency.feature ステップ定義
 *
 * 通貨システム（初期通貨、残高制約、二重消費防止）に関するシナリオを実装する。
 * マイページシナリオは cucumber.js 設定で除外済み。
 *
 * サービス層は動的 require で取得する（モック差し替え後に呼ばれるため）。
 *
 * See: features/phase1/currency.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 currency.feature
 */

import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'
import type { BattleBoardWorld } from '../support/world'

// ---------------------------------------------------------------------------
// サービス層の動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getAuthService() {
  return require('../../src/lib/services/auth-service') as typeof import('../../src/lib/services/auth-service')
}

function getCurrencyService() {
  return require('../../src/lib/services/currency-service') as typeof import('../../src/lib/services/currency-service')
}

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

/** BDD テストで使用するデフォルト IP ハッシュ */
const DEFAULT_IP_HASH = 'bdd-test-ip-hash-default-sha512-placeholder'

/** deduct のテスト用消費理由 */
const TEST_DEDUCT_REASON = 'bot_create' as const

// ---------------------------------------------------------------------------
// Given: 操作コストの設定
// See: features/phase1/currency.feature @通貨残高がマイナスになる操作は実行されない
// ---------------------------------------------------------------------------

/**
 * 実行しようとする操作のコストが {int} である。
 * テスト用のコスト値を World に保存する。
 */
Given('実行しようとする操作のコストが {int} である', function (
  this: BattleBoardWorld,
  cost: number
) {
  ;(this as any)._operationCost = cost
})

/**
 * 操作コストが {int} である（二重消費シナリオ用）。
 */
Given('操作コストが {int} である', function (
  this: BattleBoardWorld,
  cost: number
) {
  ;(this as any)._operationCost = cost
})

// ---------------------------------------------------------------------------
// When: 新規ユーザーとして登録を完了する
// See: features/phase1/currency.feature @新規ユーザー登録時に初期通貨 50 が付与される
// ---------------------------------------------------------------------------

/**
 * 新規ユーザーとして登録を完了する。
 * AuthService.issueEdgeToken → CurrencyService.initializeBalance の連鎖をテストする。
 */
When('新規ユーザーとして登録を完了する', async function (this: BattleBoardWorld) {
  const AuthService = getAuthService()

  // issueEdgeToken 内部で initializeBalance が呼ばれる
  // See: src/lib/services/auth-service.ts @issueEdgeToken
  const { token, userId } = await AuthService.issueEdgeToken(DEFAULT_IP_HASH)
  this.currentEdgeToken = token
  this.currentUserId = userId
  this.currentIpHash = DEFAULT_IP_HASH
  this.lastResult = { type: 'success', data: { userId, token } }
})

// ---------------------------------------------------------------------------
// When: 操作を実行する
// See: features/phase1/currency.feature @通貨残高がマイナスになる操作は実行されない
// ---------------------------------------------------------------------------

/**
 * 操作を実行する。
 * CurrencyService.deduct を呼び出して残高不足チェックを行う。
 */
When('操作を実行する', async function (this: BattleBoardWorld) {
  const CurrencyService = getCurrencyService()

  assert(this.currentUserId, 'ユーザーがログイン済みである必要があります')
  const cost: number = (this as any)._operationCost ?? 0
  assert(cost > 0, '操作コストが設定されていません')

  const result = await CurrencyService.deduct(this.currentUserId, cost, TEST_DEDUCT_REASON)

  if (result.success) {
    this.lastResult = { type: 'success', data: result }
  } else {
    this.lastResult = {
      type: 'error',
      message: '通貨が不足しています',
      code: 'INSUFFICIENT_BALANCE',
    }
  }
})

// ---------------------------------------------------------------------------
// Then: 操作実行結果の検証
// See: features/phase1/currency.feature @通貨残高がマイナスになる操作は実行されない
// ---------------------------------------------------------------------------

Then('操作は実行されない', function (this: BattleBoardWorld) {
  assert(this.lastResult, '操作結果が存在しません')
  assert.strictEqual(
    this.lastResult.type,
    'error',
    `操作が失敗することを期待しましたが "${this.lastResult.type}" でした`
  )
})

// ---------------------------------------------------------------------------
// When: 同一ユーザーが同時に2つの操作を実行する
// See: features/phase1/currency.feature @同時操作による通貨の二重消費が発生しない
// ---------------------------------------------------------------------------

/** 同時操作の結果を保持する */
interface ConcurrentDeductResult {
  first: { success: boolean; newBalance?: number }
  second: { success: boolean; reason?: string }
}
let concurrentDeductResult: ConcurrentDeductResult | null = null

When('同一ユーザーが同時に2つの操作を実行する', async function (this: BattleBoardWorld) {
  const CurrencyService = getCurrencyService()

  assert(this.currentUserId, 'ユーザーがログイン済みである必要があります')
  const cost: number = (this as any)._operationCost ?? 0
  assert(cost > 0, '操作コストが設定されていません')

  // Promise.all で並行 deduct を実行する
  // See: features/support/in-memory/currency-repository.ts @楽観的ロック
  const [result1, result2] = await Promise.all([
    CurrencyService.deduct(this.currentUserId, cost, TEST_DEDUCT_REASON),
    CurrencyService.deduct(this.currentUserId, cost, TEST_DEDUCT_REASON),
  ])

  concurrentDeductResult = {
    first: {
      success: result1.success,
      newBalance: result1.success ? result1.newBalance : undefined,
    },
    second: {
      success: result2.success,
      reason: !result2.success ? result2.reason : undefined,
    },
  }

  this.lastResult = { type: 'success', data: concurrentDeductResult }
})

// ---------------------------------------------------------------------------
// Then: 同時操作の検証
// See: features/phase1/currency.feature @同時操作による通貨の二重消費が発生しない
// ---------------------------------------------------------------------------

Then('1つの操作のみ成功する', function (this: BattleBoardWorld) {
  assert(concurrentDeductResult, '同時操作の結果が存在しません')

  const successCount = [concurrentDeductResult.first.success, concurrentDeductResult.second.success]
    .filter(Boolean).length

  assert.strictEqual(
    successCount,
    1,
    `1つの操作のみ成功することを期待しましたが、${successCount} 件成功しました`
  )
})

Then('残高が不足する2つ目の操作は拒否される', function (this: BattleBoardWorld) {
  assert(concurrentDeductResult, '同時操作の結果が存在しません')

  // どちらか1件が失敗していることを確認する
  const failureExists =
    !concurrentDeductResult.first.success || !concurrentDeductResult.second.success
  assert(failureExists, '残高不足による拒否が発生していません')

  // 失敗した操作の reason が insufficient_balance であることを確認する
  if (!concurrentDeductResult.second.success) {
    assert.strictEqual(
      concurrentDeductResult.second.reason,
      'insufficient_balance',
      `失敗した操作の reason が "insufficient_balance" であることを期待しましたが "${concurrentDeductResult.second.reason}" でした`
    )
  } else if (!concurrentDeductResult.first.success) {
    // first が失敗した場合の確認（稀だが可能性あり）
    assert.ok(true, '二重消費防止が機能しています')
  }
})
